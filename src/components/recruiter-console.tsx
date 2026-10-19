"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Job = {
  id:string; title:string; department:string|null; description:string; location:string|null;
  workMode:string; employmentType:string; level:string|null; salary:string|null;
  status:"DRAFT"|"PUBLISHED"|"CLOSED"; closingAt:string|null; applicationCount:number;
  skills:{name:string;kind:"REQUIRED"|"PREFERRED"}[];
};
type Application = {
  id:string; jobId:string; jobTitle:string; fullName:string; email:string; linkedinUrl:string;
  experienceLevel:string; coverLetter:string; status:string; statusCode:string;
  submittedAt:number; resumeAvailable:boolean; resumeName:string|null;
  matchScore:number|null; matchStatus:string|null; matchedSkills:string[]; missingRequiredSkills:string[];
};
type Editor = {title:string;department:string;description:string;location:string;workMode:string;employmentType:string;level:string;salary:string;closingAt:string;requiredSkills:string;preferredSkills:string};
const emptyEditor:Editor={title:"",department:"",description:"",location:"Dhaka, Bangladesh",workMode:"HYBRID",employmentType:"FULL_TIME",level:"",salary:"",closingAt:"",requiredSkills:"",preferredSkills:""};
const statusOptions:Record<string,string[]>={APPLIED:["SCREENING","SHORTLISTED","REJECTED","WITHDRAWN"],SCREENING:["SHORTLISTED","INTERVIEW","REJECTED","WITHDRAWN"],SHORTLISTED:["SCREENING","INTERVIEW","REJECTED","WITHDRAWN"],INTERVIEW:["SCREENING","SHORTLISTED","OFFERED","REJECTED","WITHDRAWN"],OFFERED:["HIRED","REJECTED","WITHDRAWN"],HIRED:[],REJECTED:[],WITHDRAWN:[]};
const labelStatus=(s:string)=>({APPLIED:"Applied",SCREENING:"In review",SHORTLISTED:"Shortlisted",INTERVIEW:"Interview",OFFERED:"Offer",HIRED:"Hired",REJECTED:"Rejected",WITHDRAWN:"Withdrawn"}[s]||s);
function dateLabel(value:string|null){return value?new Intl.DateTimeFormat("en-BD",{day:"numeric",month:"short",year:"numeric"}).format(new Date(value)):"No closing date";}
function toEditor(job:Job):Editor{return {title:job.title,department:job.department||"",description:job.description,location:job.location||"",workMode:job.workMode,employmentType:job.employmentType,level:job.level||"",salary:job.salary||"",closingAt:job.closingAt?new Date(job.closingAt).toISOString().slice(0,16):"",requiredSkills:job.skills.filter(s=>s.kind==="REQUIRED").map(s=>s.name).join(", "),preferredSkills:job.skills.filter(s=>s.kind==="PREFERRED").map(s=>s.name).join(", ")};}
function parseSkills(value:string){return value.split(",").map(v=>v.trim()).filter(Boolean);}

export function RecruiterConsole({recruiterName}:{recruiterName:string}) {
  const [csrf,setCsrf]=useState("");
  const [jobs,setJobs]=useState<Job[]>([]);
  const [applications,setApplications]=useState<Application[]>([]);
  const [editor,setEditor]=useState<Editor>(emptyEditor);
  const [editingId,setEditingId]=useState("");
  const [selectedStatuses,setSelectedStatuses]=useState<Record<string,string>>({});
  const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const load=useCallback(async()=>{
    try{
      setError("");
      const [sessionResponse,jobResponse,applicationResponse]=await Promise.all([
        fetch("/api/auth/session",{cache:"no-store"}),fetch("/api/recruiter/jobs",{cache:"no-store"}),fetch("/api/recruiter/applications",{cache:"no-store"})
      ]);
      const session=await sessionResponse.json().catch(()=>({}));
      if(!sessionResponse.ok||!session.user||!session.csrfToken)throw new Error("Your session expired. Sign in again.");
      setCsrf(session.csrfToken);
      const jobsBody=await jobResponse.json().catch(()=>({}));
      const appBody=await applicationResponse.json().catch(()=>({}));
      if(!jobResponse.ok)throw new Error(jobsBody.message||"Could not load recruiter jobs.");
      if(!applicationResponse.ok)throw new Error(appBody.message||"Could not load applications.");
      setJobs(Array.isArray(jobsBody.jobs)?jobsBody.jobs:[]);
      setApplications(Array.isArray(appBody.applications)?appBody.applications:[]);
    }catch(e){setError(e instanceof Error?e.message:"Could not load recruiter workspace.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{const id=window.setTimeout(()=>{void load();},0);return()=>window.clearTimeout(id);},[load]);

  function setField<K extends keyof Editor>(key:K,value:Editor[K]){setEditor(current=>({...current,[key]:value}));}
  async function send(url:string,method:string,body?:unknown){
    const response=await fetch(url,{method,headers:{"X-CSRF-Token":csrf,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.message||"The request could not be completed.");
    return payload;
  }
  async function saveJob(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setSaving(true);setError("");setNotice("");
    const payload={...editor,closingAt:editor.closingAt?new Date(editor.closingAt).toISOString():null,requiredSkills:parseSkills(editor.requiredSkills),preferredSkills:parseSkills(editor.preferredSkills)};
    try{
      if(editingId){await send("/api/recruiter/jobs/"+encodeURIComponent(editingId),"PATCH",payload);setNotice("Job draft updated.");}
      else{await send("/api/recruiter/jobs","POST",payload);setNotice("Draft created. Review it and publish when ready.");}
      setEditor(emptyEditor);setEditingId("");await load();
    }catch(e){setError(e instanceof Error?e.message:"The job could not be saved.");}
    finally{setSaving(false);}
  }
  async function jobAction(job:Job,action:"publish"|"close"|"delete"){
    setError("");setNotice("");
    try{
      if(action==="delete")await send("/api/recruiter/jobs/"+encodeURIComponent(job.id),"DELETE");
      else await send("/api/recruiter/jobs/"+encodeURIComponent(job.id),"PATCH",{action});
      setNotice(action==="publish"?"Job published.":action==="close"?"Job closed.":"Draft deleted.");
      if(editingId===job.id){setEditingId("");setEditor(emptyEditor);}
      await load();
    }catch(e){setError(e instanceof Error?e.message:"The job action failed.");}
  }
  async function updateStatus(app:Application){
    const next=selectedStatuses[app.id];
    if(!next)return;
    setError("");setNotice("");
    try{
      await send("/api/recruiter/applications/"+encodeURIComponent(app.id)+"/status","POST",{status:next,note:reviewNotes[app.id]||""});
      setNotice("Application status updated and added to history.");
      setSelectedStatuses(v=>({...v,[app.id]:""}));
      setReviewNotes(v=>({...v,[app.id]:""}));
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Application status could not be updated.");}
  }

  return <main id="main-content" className="utility-page recruiter-page"><div className="utility-shell recruiter-shell">
    <header className="recruiter-top"><div><p className="page-kicker"><span className="eyebrow-dot"/> HIREFLOW RECRUITER WORKSPACE</p><h1 className="page-title">Hiring, in one place<span style={{color:"#839e58"}}>.</span></h1><p className="page-lede">Welcome, {recruiterName}. Manage job openings and review candidate applications.</p></div><Link className="button button-outline" href="/">View public careers site ↗</Link></header>
    {error&&<div className="form-notice form-notice-error" role="alert">{error}</div>}
    {notice&&<div className="form-notice" role="status">{notice}</div>}
    {loading?<div className="loading-placeholder" aria-busy="true"><div className="loading-line"/><div className="loading-line"/></div>:<>
      <section className="recruiter-section" aria-labelledby="job-management-heading">
        <div className="recruiter-section-head"><div><p className="page-kicker">WORK PACKAGE 04</p><h2 id="job-management-heading">Job management</h2><p>Create draft jobs, edit them, then explicitly publish or close them.</p></div><span className="recruiter-count">{jobs.length} jobs</span></div>
        <form className="recruiter-form" onSubmit={saveJob}>
          <h3>{editingId?"Edit job draft":"Create a job draft"}</h3>
          <div className="recruiter-form-grid">
            <label>Job title<input required maxLength={160} value={editor.title} onChange={e=>setField("title",e.target.value)}/></label>
            <label>Department<input maxLength={120} value={editor.department} onChange={e=>setField("department",e.target.value)}/></label>
            <label>Location<input maxLength={160} value={editor.location} onChange={e=>setField("location",e.target.value)}/></label>
            <label>Work style<select value={editor.workMode} onChange={e=>setField("workMode",e.target.value)}><option value="HYBRID">Hybrid</option><option value="REMOTE">Remote</option><option value="ON_SITE">On-site</option></select></label>
            <label>Employment type<select value={editor.employmentType} onChange={e=>setField("employmentType",e.target.value)}><option value="FULL_TIME">Full-time</option><option value="PART_TIME">Part-time</option><option value="CONTRACT">Contract</option><option value="INTERNSHIP">Internship</option><option value="TEMPORARY">Temporary</option></select></label>
            <label>Experience level<input maxLength={120} value={editor.level} onChange={e=>setField("level",e.target.value)}/></label>
            <label>Salary range<input maxLength={120} value={editor.salary} onChange={e=>setField("salary",e.target.value)}/></label>
            <label>Closing date/time<input type="datetime-local" value={editor.closingAt} onChange={e=>setField("closingAt",e.target.value)}/></label>
            <label className="recruiter-span-2">Description<textarea required minLength={20} maxLength={20000} rows={5} value={editor.description} onChange={e=>setField("description",e.target.value)}/></label>
            <label>Required skills (comma separated)<input placeholder="TypeScript, React" value={editor.requiredSkills} onChange={e=>setField("requiredSkills",e.target.value)}/></label>
            <label>Preferred skills (comma separated)<input placeholder="Accessibility, testing" value={editor.preferredSkills} onChange={e=>setField("preferredSkills",e.target.value)}/></label>
          </div>
          <div className="recruiter-actions"><button className="button button-dark" disabled={saving}>{saving?"Saving…":editingId?"Save changes":"Save draft"}</button>{editingId&&<button className="button button-outline" type="button" onClick={()=>{setEditingId("");setEditor(emptyEditor);}}>Cancel edit</button>}</div>
        </form>
        {jobs.length===0?<p className="recruiter-empty">No recruiter-owned jobs yet. Create your first draft above.</p>:<div className="recruiter-job-list">{jobs.map(job=><article className="recruiter-card" key={job.id}>
          <div className="recruiter-card-main"><div><span className={"recruiter-status recruiter-status-"+job.status.toLowerCase()}>{job.status}</span><h3>{job.title}</h3><p>{job.department||"General"} · {job.location||"Location flexible"} · {job.applicationCount} applications</p>{job.closingAt&&<p>Closes {dateLabel(job.closingAt)}</p>}</div>
            <div className="recruiter-card-actions">{job.status!=="CLOSED"&&<button className="button button-outline button-small" type="button" onClick={()=>{setEditingId(job.id);setEditor(toEditor(job));window.scrollTo({top:0,behavior:"smooth"});}}>Edit</button>}{job.status==="DRAFT"&&<button className="button button-dark button-small" type="button" onClick={()=>void jobAction(job,"publish")}>Publish</button>}{job.status==="PUBLISHED"&&<button className="button button-outline button-small" type="button" onClick={()=>void jobAction(job,"close")}>Close job</button>}{job.status==="DRAFT"&&job.applicationCount===0&&<button className="recruiter-danger" type="button" onClick={()=>void jobAction(job,"delete")}>Delete draft</button>}</div>
          </div>
          {!!job.skills.length&&<p className="recruiter-skills">{job.skills.map(skill=><span key={skill.kind+skill.name}>{skill.kind==="REQUIRED"?"Required: ":"Preferred: "}{skill.name}</span>)}</p>}
        </article>)}</div>}
      </section>
      <section className="recruiter-section" aria-labelledby="application-review-heading">
        <div className="recruiter-section-head"><div><p className="page-kicker">WORK PACKAGE 05–06</p><h2 id="application-review-heading">Application review</h2><p>Change a status only after review. Each transition is recorded in a server-side history log.</p></div><span className="recruiter-count">{applications.length} candidates</span></div>
        {applications.length===0?<p className="recruiter-empty">Applications for the jobs you manage will appear here.</p>:<div className="recruiter-application-list">{applications.map(app=><article className="recruiter-card" key={app.id}>
          <div className="recruiter-card-main"><div className="recruiter-applicant"><h3>{app.fullName}</h3><p>{app.email} · {app.jobTitle}</p><p>{app.experienceLevel} · Applied {new Intl.DateTimeFormat("en-BD",{day:"numeric",month:"short",year:"numeric"}).format(new Date(app.submittedAt))}</p>{app.linkedinUrl&&<a className="resume-link" href={app.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn profile ↗</a>}</div><div className="recruiter-app-review"><span className={"recruiter-status recruiter-status-"+app.statusCode.toLowerCase()}>{labelStatus(app.statusCode)}</span>{app.resumeAvailable&&<a className="resume-link" href={"/api/recruiter/applications/"+encodeURIComponent(app.id)+"/resume"}>Download private resume ↗</a>}</div></div>
          <div className="recruiter-match"><div><strong>{app.matchScore===null?"Match unavailable":app.matchScore+"% skill overlap"}</strong><p>{app.matchStatus==="UNAVAILABLE"?"Text extraction or skill definitions were unavailable.":app.matchStatus==="COMPLETED"?"Heuristic only; not a hiring probability.":"No analysis available yet."}</p></div>{app.matchedSkills.length>0&&<div><b>Matched</b><p>{app.matchedSkills.join(", ")}</p></div>}{app.missingRequiredSkills.length>0&&<div><b>Missing required</b><p>{app.missingRequiredSkills.join(", ")}</p></div>}</div>
          <details className="recruiter-review-details"><summary>Review and update status</summary><label>Next status<select value={selectedStatuses[app.id]||""} onChange={e=>setSelectedStatuses(old=>({...old,[app.id]:e.target.value}))}><option value="">Choose a next status</option>{(statusOptions[app.statusCode]||[]).map(status=><option key={status} value={status}>{labelStatus(status)}</option>)}</select></label><label>Private reviewer note (not shown to the candidate)<textarea rows={2} maxLength={1000} value={reviewNotes[app.id]||""} onChange={e=>setReviewNotes(old=>({...old,[app.id]:e.target.value}))}/></label><button className="button button-dark button-small" type="button" disabled={!selectedStatuses[app.id]} onClick={()=>void updateStatus(app)}>Save status and audit event</button></details>
        </article>)}</div>}
      </section>
    </>}
  </div></main>;
}
