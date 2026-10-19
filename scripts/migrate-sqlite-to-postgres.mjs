import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

try { process.loadEnvFile?.(".env.local"); } catch (error) { if (error?.code !== "ENOENT") throw error; }

const connectionString=process.env.DATABASE_URL?.trim();
if(!connectionString){console.error("DATABASE_URL is required. Configure PostgreSQL before importing.");process.exit(1);}
const sourceDatabase=path.resolve(process.env.CAREERS_DB_PATH||path.join(process.cwd(),"data","careers.sqlite"));
const sourceUploads=path.resolve(process.env.SQLITE_UPLOAD_DIR||process.env.CAREERS_UPLOAD_DIR||path.join(process.cwd(),"data","private-uploads"));
const targetUploads=path.resolve(process.env.CAREERS_UPLOAD_DIR||path.join(process.cwd(),"data","private-uploads"));
if(!existsSync(sourceDatabase)){console.error("Legacy SQLite database not found at "+sourceDatabase+". It has not been created or changed by this command.");process.exit(1);}

const sqlite=new DatabaseSync(sourceDatabase,{readOnly:true});
const sql=postgres(connectionString,{max:1,prepare:false,connect_timeout:10,...(process.env.DATABASE_SSL==="require"?{ssl:"require"}:{})});
const counts={users:0,sessions:0,applications:0,resumes:0,history:0,idempotency:0,missingResumeFiles:0,alreadyPresent:0};
function tableExists(name){return Boolean(sqlite.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?").get(name));}
function dateFromEpoch(value){
  const n=Number(value),date=new Date(Number.isFinite(n)?n:Date.now());
  if(!Number.isFinite(date.getTime()))throw new Error("An invalid legacy timestamp was found.");
  return date;
}
function normalizedEmail(value){return String(value??"").trim().toLowerCase();}
function mapStatus(value){
  const status=String(value??"submitted").toLowerCase();
  if(status==="in_review")return "SCREENING";
  if(status==="shortlisted")return "SHORTLISTED";
  if(status==="rejected")return "REJECTED";
  if(status==="interview")return "INTERVIEW";
  if(status==="offered")return "OFFERED";
  if(status==="hired")return "HIRED";
  if(status==="withdrawn")return "WITHDRAWN";
  return "APPLIED";
}
function hashFile(filePath){return createHash("sha256").update(readFileSync(filePath)).digest("hex");}

try{
  const users=tableExists("users")?sqlite.prepare("SELECT * FROM users ORDER BY created_at,id").all():[];
  for(const user of users){
    const id=String(user.id),email=normalizedEmail(user.email);
    if(!id||!email||!String(user.password_salt??"")||!String(user.password_hash??""))
      throw new Error("A legacy user is missing an ID, normalized email, password salt or password hash.");
    const sameId=await sql.unsafe('SELECT "id","email" FROM "User" WHERE "id"=$1 LIMIT 1',[id]);
    if(sameId[0]){
      if(normalizedEmail(sameId[0].email)!==email)throw new Error("User ID collision found; migration stopped without overwriting "+id+".");
      counts.alreadyPresent++;continue;
    }
    const emailCollision=await sql.unsafe('SELECT "id" FROM "User" WHERE lower(btrim("email"))=$1 LIMIT 1',[email]);
    if(emailCollision[0])throw new Error("Email "+email+" belongs to a different PostgreSQL user. Resolve the identity conflict before importing.");
    await sql.unsafe('INSERT INTO "User" ("id","name","email","passwordSalt","passwordHash","role","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id,String(user.name),email,String(user.password_salt),String(user.password_hash),"CANDIDATE",dateFromEpoch(user.created_at)]);
    counts.users++;
  }

  const sessions=tableExists("sessions")?sqlite.prepare("SELECT * FROM sessions ORDER BY created_at,token_hash").all():[];
  for(const row of sessions){
    const owner=await sql.unsafe('SELECT 1 FROM "User" WHERE "id"=$1 LIMIT 1',[String(row.user_id)]);
    if(!owner[0])throw new Error("A legacy session references a missing user.");
    const inserted=await sql.unsafe('INSERT INTO "Session" ("tokenHash","userId","csrfToken","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5) ON CONFLICT ("tokenHash") DO NOTHING RETURNING "tokenHash"',
      [String(row.token_hash),String(row.user_id),String(row.csrf_token),dateFromEpoch(row.expires_at),dateFromEpoch(row.created_at)]);
    counts.sessions+=inserted.length;
  }

  const applications=tableExists("applications")?sqlite.prepare("SELECT * FROM applications ORDER BY created_at,id").all():[];
  mkdirSync(targetUploads,{recursive:true,mode:0o700});
  const jobs=await sql.unsafe('SELECT "id" FROM "Job"');
  const jobIds=new Set(jobs.map(row=>String(row.id)));
  for(const row of applications){
    const id=String(row.id),candidateId=String(row.user_id),jobId=String(row.role_id);
    if(!jobIds.has(jobId))throw new Error("Legacy application "+id+" references missing job "+jobId+". Run npm run db:seed first.");
    const candidate=await sql.unsafe('SELECT 1 FROM "User" WHERE "id"=$1 LIMIT 1',[candidateId]);
    if(!candidate[0])throw new Error("Legacy application "+id+" references a missing candidate.");
    const existingId=await sql.unsafe('SELECT "id","candidateId","jobId" FROM "Application" WHERE "id"=$1 LIMIT 1',[id]);
    const appById=existingId[0];
    let applicationId=id;
    if(appById){
      if(String(appById.candidateId)!==candidateId||String(appById.jobId)!==jobId)throw new Error("Application ID collision found; migration stopped without overwriting "+id+".");
      counts.alreadyPresent++;
    }else{
      const duplicate=await sql.unsafe('SELECT "id" FROM "Application" WHERE "candidateId"=$1 AND "jobId"=$2 LIMIT 1',[candidateId,jobId]);
      if(duplicate[0])throw new Error("A different application ID already exists for candidate "+candidateId+" and job "+jobId+". Resolve this conflict before import.");
      const inserted=await sql.unsafe('INSERT INTO "Application" ("id","candidateId","jobId","fullName","email","linkedinUrl","experienceLevel","coverLetter","status","submittedAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) ON CONFLICT ("candidateId","jobId") DO NOTHING RETURNING "id"',
        [id,candidateId,jobId,String(row.full_name),normalizedEmail(row.email),String(row.linkedin_url??""),String(row.experience_level),String(row.cover_letter??""),mapStatus(row.status),dateFromEpoch(row.created_at)]);
      if(!inserted[0])throw new Error("Application uniqueness conflict for legacy ID "+id+".");
      counts.applications++;
    }

    const existingAsset=await sql.unsafe('SELECT "id" FROM "ResumeAsset" WHERE "applicationId"=$1 LIMIT 1',[applicationId]);
    if(!existingAsset[0]){
      const oldName=path.basename(String(row.resume_storage_name??""));
      const sourceFile=oldName?path.join(sourceUploads,oldName):"";
      if(!oldName||!existsSync(sourceFile)||!statSync(sourceFile).isFile()){
        counts.missingResumeFiles++;
        console.warn("Resume file unavailable for legacy application "+id+"; application metadata and history will be retained.");
      }else{
        const size=statSync(sourceFile).size;
        if(size<1||size>5_000_000)throw new Error("Legacy resume "+oldName+" is outside the supported 1–5,000,000 byte range.");
        let storageKey=/^[0-9a-f-]{36}\.pdf$/i.test(oldName)?oldName:randomUUID()+".pdf";
        let destination=path.join(targetUploads,storageKey);
        const sourcePath=path.resolve(sourceFile);
        const destinationPath=path.resolve(destination);
        const checksum=hashFile(sourceFile);
        if(sourcePath!==destinationPath&&existsSync(destination)){
          if(hashFile(destination)!==checksum){storageKey=randomUUID()+".pdf";destination=path.join(targetUploads,storageKey);}
        }
        if(sourcePath!==path.resolve(destination)&&!existsSync(destination)){
          copyFileSync(sourceFile,destination);
        }
        if(!existsSync(destination))throw new Error("Resume copy failed for "+oldName+".");
        await sql.unsafe('INSERT INTO "ResumeAsset" ("id","applicationId","storageKey","originalFileName","mimeType","sizeBytes","checksum") VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("applicationId") DO NOTHING',
          [randomUUID(),applicationId,storageKey,String(row.resume_original_name??"resume.pdf").slice(0,255),"application/pdf",size,checksum]);
        counts.resumes++;
      }
    }

    const mappedStatus=mapStatus(row.status);
    const insertedEvent=await sql.unsafe('INSERT INTO "ApplicationEvent" ("id","applicationId","actorId","fromStatus","toStatus","eventSource","note","createdAt") VALUES ($1,$2,NULL,NULL,$3,$4,$5,$6) ON CONFLICT ("id") DO NOTHING RETURNING "id"',
      ["legacy-status-"+id,applicationId,mappedStatus,"MIGRATION_BASELINE","Imported current status; the legacy database did not retain individual prior status transitions.",dateFromEpoch(row.created_at)]);
    counts.history+=insertedEvent.length;
  }

  const keys=tableExists("idempotency_records")?sqlite.prepare("SELECT * FROM idempotency_records ORDER BY created_at,user_id,idempotency_key").all():[];
  for(const row of keys){
    const key=String(row.idempotency_key),code=Number(row.response_status);
    let payload;
    try{payload=JSON.parse(String(row.response_json));}catch{throw new Error("Malformed idempotency JSON for key "+key+"; migration stopped.");}
    if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new Error("Invalid idempotency response for key "+key+".");
    const inserted=await sql.unsafe('INSERT INTO "IdempotencyRecord" ("userId","idempotencyKey","responseStatus","responseJson","createdAt") VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT ("userId","idempotencyKey") DO NOTHING RETURNING "idempotencyKey"',
      [String(row.user_id),key,code,JSON.stringify(payload),dateFromEpoch(row.created_at)]);
    counts.idempotency+=inserted.length;
  }
  console.log("SQLite import finished. The source database and files were not deleted or modified.");
  console.log(JSON.stringify(counts,null,2));
  if(counts.missingResumeFiles>0)console.warn("Review missingResumeFiles above; no application records were dropped.");
}catch(error){
  console.error("SQLite import stopped; source data was preserved. Completed PostgreSQL rows and copied files are intentionally retained so the idempotent import can be resumed after resolving the reported conflict: "+(error instanceof Error?error.message:String(error)));
  process.exitCode=1;
}finally{
  sqlite.close();
  await sql.end({timeout:10});
}
