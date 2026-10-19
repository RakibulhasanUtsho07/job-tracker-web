import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

try { process.loadEnvFile?.(".env.local"); } catch (error) { if (error?.code !== "ENOENT") throw error; }

const root = process.cwd();
let serverOutput = "";
const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "northstar-careers-smoke-"));
const uploadPath = path.join(tempDirectory, "private-uploads");
let demoEmail = "smoke-test-" + randomUUID() + "@careers.local";
let child;
let cookie = "";
let csrfToken = "";

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a local port.");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function formFor(roleId, blob, filename) {
  const form = new FormData();
  form.set("roleId", roleId);
  form.set("fullName", "Demo Candidate");
  form.set("email", demoEmail);
  form.set("linkedinUrl", "");
  form.set("experienceLevel", "junior");
  form.set("coverLetter", "A fictional note used by the automated smoke test.");
  form.set("resume", blob, filename);
  return form;
}

async function api(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers ?? {}),
    },
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 45_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error("Next.js server exited during startup.");
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok) return;
      lastError = new Error(`Server returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Next.js server did not become ready: ${String(lastError)}`);
}

async function main() {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      CAREERS_UPLOAD_DIR: uploadPath,
      DATABASE_URL: process.env.DATABASE_URL,
      RECRUITER_EMAIL: process.env.RECRUITER_EMAIL,
      RECRUITER_PASSWORD: process.env.RECRUITER_PASSWORD,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => { serverOutput = (serverOutput + chunk.toString()).slice(-6000); });
  child.stderr.on("data", (chunk) => { serverOutput = (serverOutput + chunk.toString()).slice(-6000); });
  await waitForServer(baseUrl);

  const rolesResponse = await api(`${baseUrl}/api/roles`);
  assert.equal(rolesResponse.status, 200, "fictional roles endpoint should be available");
  const roles = await rolesResponse.json();
  assert.ok(Array.isArray(roles.roles) && roles.roles.length >= 6, "role catalogue should contain the demo roles");

  const registrationEmail = "new-candidate-" + randomUUID() + "@careers.local";
  const registrationResponse = await api(baseUrl + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Registered Candidate", email: registrationEmail.toUpperCase(), password: "LongEnoughPassword123!" }),
  });
  assert.equal(registrationResponse.status, 201, "a valid candidate should be able to register");
  const registrationBody = await registrationResponse.json();
  assert.equal(registrationBody.user.email, registrationEmail, "registration should normalize and return the new user's email");
  assert.ok(registrationBody.csrfToken, "registration should start an authenticated session");
  assert.match(registrationResponse.headers.get("set-cookie") ?? "", /^careers_session=/, "registration should set a session cookie");

  const registeredLogin = await api(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: registrationEmail, password: "LongEnoughPassword123!" }),
  });
  assert.equal(registeredLogin.status, 200, "a newly registered candidate should be able to sign in");
  const registeredLoginBody = await registeredLogin.json();
  assert.equal(registeredLoginBody.user.email, registrationEmail, "registered credentials should resolve the normalized account");
  demoEmail = registrationEmail;
  csrfToken = registeredLoginBody.csrfToken;
  cookie = (registeredLogin.headers.get("set-cookie") ?? "").split(";")[0];
  assert.ok(csrfToken, "sign-in should issue a CSRF token");
  assert.match(cookie, /^careers_session=/, "sign-in should set a session cookie");

  const shortPasswordRegistration = await api(baseUrl + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Short Password", email: "short-password@careers.local", password: "tiny" }),
  });
  assert.equal(shortPasswordRegistration.status, 422, "weak-length passwords should be rejected");

  const duplicateRegistration = await api(baseUrl + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Registered Candidate", email: registrationEmail, password: "LongEnoughPassword123!" }),
  });
  assert.equal(duplicateRegistration.status, 409, "duplicate email registrations should be rejected");

  const noCsrf = await api(`${baseUrl}/api/applications`, {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: formFor("web-developer", new Blob(["%PDF-1.7\nDemo"], { type: "application/pdf" }), "resume.pdf"),
  });
  assert.equal(noCsrf.status, 403, "mutations without CSRF protection should be rejected");

  const idempotencyKey = randomUUID();
  const validForm = () => formFor("web-developer", new Blob(["%PDF-1.7\nFictional PDF bytes"], { type: "application/pdf" }), "candidate-resume.pdf");
  const firstResponse = await api(`${baseUrl}/api/applications`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey, "X-CSRF-Token": csrfToken },
    body: validForm(),
  });
  assert.equal(firstResponse.status, 201, "a valid application should be created");
  const created = await firstResponse.json();
  assert.ok(created.id, "created application should return a reference ID");

  const replayResponse = await api(`${baseUrl}/api/applications`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey, "X-CSRF-Token": csrfToken },
    body: validForm(),
  });
  assert.equal(replayResponse.status, 201, "same-key retry should replay the original response");
  const replayed = await replayResponse.json();
  assert.equal(replayed.id, created.id, "same-key retry must return the original application ID");

  const duplicateResponse = await api(`${baseUrl}/api/applications`, {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID(), "X-CSRF-Token": csrfToken },
    body: validForm(),
  });
  assert.equal(duplicateResponse.status, 409, "different-key duplicate application should be rejected");
  assert.equal((await duplicateResponse.json()).applicationId, created.id);

  const applicationList = await api(`${baseUrl}/api/applications`);
  assert.equal(applicationList.status, 200);
  const applicationPayload = await applicationList.json();
  assert.equal(applicationPayload.applications.length, 1, "retry and duplicate paths must leave one application row");

  const resumeResponse = await api(`${baseUrl}/api/applications/${created.id}/resume`);
  assert.equal(resumeResponse.status, 200, "owner should be able to download their resume");
  assert.match(resumeResponse.headers.get("content-disposition") ?? "", /attachment/);
  assert.equal(resumeResponse.headers.get("x-content-type-options"), "nosniff");
  assert.doesNotMatch(resumeResponse.headers.get("content-security-policy") ?? "", /unsafe-inline/);
  assert.match((await resumeResponse.text()).slice(0, 5), /^%PDF-/);

  // Candidate accounts must never receive recruiter privileges.
  const candidateForbidden = await api(baseUrl + "/api/recruiter/jobs");
  assert.equal(candidateForbidden.status, 403, "candidate role must be denied recruiter endpoints");

  const historyBeforeReview = await api(baseUrl + "/api/applications/" + created.id + "/history");
  assert.equal(historyBeforeReview.status, 200, "candidate should view their own status history");
  assert.equal((await historyBeforeReview.json()).history[0].toStatus, "APPLIED");

  const recruiterEmail = process.env.RECRUITER_EMAIL;
  const recruiterPassword = process.env.RECRUITER_PASSWORD;
  assert.ok(recruiterEmail && recruiterPassword, "smoke test requires trusted recruiter setup");
  const recruiterLogin = await api(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: recruiterEmail, password: recruiterPassword }),
  });
  assert.equal(recruiterLogin.status, 200, "trusted recruiter should sign in");
  const recruiterLoginBody = await recruiterLogin.json();
  cookie = (recruiterLogin.headers.get("set-cookie") ?? "").split(";")[0];
  csrfToken = recruiterLoginBody.csrfToken;
  assert.ok(cookie && csrfToken, "recruiter session and CSRF token should be set");

  const recruiterJobs = await api(baseUrl + "/api/recruiter/jobs");
  assert.equal(recruiterJobs.status, 200, "recruiter should load authorized jobs");
  assert.ok((await recruiterJobs.json()).jobs.some((job) => job.id === "web-developer"), "bootstrap should assign legacy jobs");

  const draftResponse = await api(baseUrl + "/api/recruiter/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify({ title: "Smoke Test Backend Role", department: "Engineering",
      description: "A fictional role used to verify recruiter job lifecycle transitions.",
      location: "Dhaka", workMode: "REMOTE", employmentType: "FULL_TIME",
      requiredSkills: ["TypeScript", "PostgreSQL"], preferredSkills: ["Testing"] }),
  });
  assert.equal(draftResponse.status, 201, "recruiter should create a draft job");
  const draft = (await draftResponse.json()).job;
  assert.equal(draft.status, "DRAFT");
  const publicDraftCheck = await api(baseUrl + "/api/roles");
  assert.ok(!(await publicDraftCheck.json()).roles.some((job) => job.id === draft.id), "draft jobs must stay private");

  const publishResponse = await api(baseUrl + "/api/recruiter/jobs/" + draft.id, {
    method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify({ action: "publish" }),
  });
  assert.equal(publishResponse.status, 200, "valid job draft should publish");
  const publishedRoles = await api(baseUrl + "/api/roles");
  assert.ok((await publishedRoles.json()).roles.some((job) => job.id === draft.id), "published job should be public");

  const closeResponse = await api(baseUrl + "/api/recruiter/jobs/" + draft.id, {
    method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify({ action: "close" }),
  });
  assert.equal(closeResponse.status, 200, "published job should close");
  const afterCloseRoles = await api(baseUrl + "/api/roles");
  assert.ok(!(await afterCloseRoles.json()).roles.some((job) => job.id === draft.id), "closed job should be hidden publicly");

  const recruiterApplications = await api(baseUrl + "/api/recruiter/applications");
  assert.equal(recruiterApplications.status, 200, "recruiter should load application queue");
  assert.ok((await recruiterApplications.json()).applications.some((item) => item.id === created.id), "queue should contain candidate application");
  const recruiterResume = await api(baseUrl + "/api/recruiter/applications/" + created.id + "/resume");
  assert.equal(recruiterResume.status, 200, "owning recruiter should download resume");

  const transition = await api(baseUrl + "/api/recruiter/applications/" + created.id + "/status", {
    method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify({ status: "SCREENING", note: "Reviewed by the automated smoke test." }),
  });
  assert.equal(transition.status, 200, "valid status transition should succeed");
  const invalidTransition = await api(baseUrl + "/api/recruiter/applications/" + created.id + "/status", {
    method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify({ status: "APPLIED" }),
  });
  assert.equal(invalidTransition.status, 409, "invalid reverse transition should be rejected");

  const candidateLogin = await api(baseUrl + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: registrationEmail, password: "LongEnoughPassword123!" }),
  });
  assert.equal(candidateLogin.status, 200, "candidate should sign in after recruiter review");
  const candidateLoginBody = await candidateLogin.json();
  cookie = (candidateLogin.headers.get("set-cookie") ?? "").split(";")[0];
  csrfToken = candidateLoginBody.csrfToken;
  const updatedHistory = await api(baseUrl + "/api/applications/" + created.id + "/history");
  assert.equal(updatedHistory.status, 200);
  assert.ok((await updatedHistory.json()).history.some((event) => event.toStatus === "SCREENING"), "candidate timeline should include status update without private notes");

  const fakePdfResponse = await api(`${baseUrl}/api/applications`, {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID(), "X-CSRF-Token": csrfToken },
    body: formFor("product-designer", new Blob(["<html><script>alert(1)</script></html>"], { type: "application/pdf" }), "cv.pdf"),
  });
  assert.equal(fakePdfResponse.status, 415, "HTML renamed as a PDF must be rejected");
  assert.equal(readdirSync(uploadPath).filter((name) => name.endsWith(".pdf")).length, 1, "rejected fake PDF must not be stored");

  const oversize = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "application/pdf" });
  const oversizedResponse = await api(`${baseUrl}/api/applications`, {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID(), "X-CSRF-Token": csrfToken },
    body: formFor("backend-engineer", oversize, "too-large.pdf"),
  });
  assert.equal(oversizedResponse.status, 413, "resumes over 5 MiB must be rejected");


  const logoutResponse = await api(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken },
  });
  assert.equal(logoutResponse.status, 200, "CSRF-protected sign-out should succeed");
  const afterLogout = await api(`${baseUrl}/api/applications`);
  assert.equal(afterLogout.status, 401, "a signed-out session cannot access applications");

  console.log("Smoke checks passed: candidate auth, role denial, job publication/closure, applications, idempotency, private resumes, recruiter review transitions, status history, PDF rejection, size cap and logout.");
}

try {
  await main();
} catch (error) {
  console.error(error);
  if (serverOutput) console.error("Next.js server output:\n" + serverOutput);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2500).unref();
    });
  }
  rmSync(tempDirectory, { recursive: true, force: true });
}
