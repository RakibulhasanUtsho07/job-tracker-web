"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MAX_RESUME_BYTES,
  validateApplicationFields,
  type ApplicationFields,
  type ApplicationFieldErrors,
} from "@/lib/application-validation";
import type { JobRole } from "@/lib/roles";

type Props = { role: JobRole };
type SubmissionStatus = "idle" | "submitting" | "error" | "done";
type ApiError = { code?: string; message?: string; fieldErrors?: ApplicationFieldErrors; applicationId?: string };

const initialValues: ApplicationFields = {
  fullName: "",
  email: "",
  linkedinUrl: "",
  experienceLevel: "",
  coverLetter: "",
};
const fieldNames: Record<string, string> = {
  fullName: "Full name",
  email: "Email address",
  linkedinUrl: "LinkedIn profile",
  experienceLevel: "Experience level",
  coverLetter: "Note to the team",
  resume: "Resume",
};

function createSubmissionKey(): string {
  return globalThis.crypto.randomUUID();
}

export function ApplicationForm({ role }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<ApplicationFields>(initialValues);
  const [resume, setResume] = useState<File | null>(null);
  const [errors, setErrors] = useState<ApplicationFieldErrors>({});
  const [globalError, setGlobalError] = useState("");
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [csrfToken, setCsrfToken] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [submittedId, setSubmittedId] = useState("");
  const [retryAvailable, setRetryAvailable] = useState(false);
  const inFlight = useRef(false);
  const idempotencyKey = useRef("");
  const summaryRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const draftStorageKey = `careers:pending-application:${role.id}`;

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => { if (active && data?.csrfToken) setCsrfToken(data.csrfToken); })
      .catch(() => undefined);

    try {
      const draft = sessionStorage.getItem(draftStorageKey);
      if (draft) {
        const parsed = JSON.parse(draft) as { values?: ApplicationFields; idempotencyKey?: string };
        if (parsed.values && typeof parsed.values === "object") {
          const restoredValues: ApplicationFields = {
            fullName: typeof parsed.values.fullName === "string" ? parsed.values.fullName : "",
            email: typeof parsed.values.email === "string" ? parsed.values.email : "",
            linkedinUrl: typeof parsed.values.linkedinUrl === "string" ? parsed.values.linkedinUrl : "",
            experienceLevel: typeof parsed.values.experienceLevel === "string" ? parsed.values.experienceLevel : "",
            coverLetter: typeof parsed.values.coverLetter === "string" ? parsed.values.coverLetter : "",
          };
          queueMicrotask(() => { if (active) setValues(restoredValues); });
        }
        if (typeof parsed.idempotencyKey === "string" && parsed.idempotencyKey.length >= 8) {
          idempotencyKey.current = parsed.idempotencyKey;
        }
      }
    } catch {
      // An invalid local draft must never prevent the application form from opening.
    }
    return () => { active = false; };
  }, [draftStorageKey]);

  useEffect(() => {
    if ((globalError || Object.keys(errors).length > 0) && summaryRef.current) {
      summaryRef.current.focus();
    }
  }, [errors, globalError]);

  useEffect(() => {
    if (!sessionExpired || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    getFocusable()[0]?.focus();

    function trapFocus(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }

    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [sessionExpired]);

  function updateField(field: keyof ApplicationFields, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setGlobalError("");
    setRetryAvailable(false);
    if (status === "error") {
      idempotencyKey.current = createSubmissionKey();
      setStatus("idle");
    }
  }

  function chooseResume(file: File | null) {
    setResume(file);
    setErrors((current) => {
      if (!current.resume) return current;
      const next = { ...current };
      delete next.resume;
      return next;
    });
    setGlobalError("");
    setRetryAvailable(false);
    if (status === "error") {
      idempotencyKey.current = createSubmissionKey();
      setStatus("idle");
    }
  }

  function persistDraftForReauthentication() {
    try {
      sessionStorage.setItem(draftStorageKey, JSON.stringify({
        values,
        idempotencyKey: idempotencyKey.current || createSubmissionKey(),
      }));
    } catch {
      // The form remains usable if browser storage is unavailable.
    }
  }

  async function submitApplication(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (inFlight.current || status === "done") return;

    inFlight.current = true;
    setStatus("submitting");
    setGlobalError("");
    setRetryAvailable(false);

    try {
      const nextErrors: ApplicationFieldErrors = validateApplicationFields(values);
      if (!resume) {
        nextErrors.resume = "Choose a PDF resume to continue.";
      } else if (resume.size <= 0) {
        nextErrors.resume = "Choose a non-empty PDF resume.";
      } else if (resume.size > MAX_RESUME_BYTES) {
        nextErrors.resume = "Your resume must be 5 MB or smaller.";
      } else if (!/\.pdf$/i.test(resume.name)) {
        nextErrors.resume = "Choose a file with a .pdf extension.";
      } else {
        const signature = await resume.slice(0, 5).text();
        if (signature !== "%PDF-") nextErrors.resume = "This file does not look like a real PDF. Choose another file.";
      }

      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
        setStatus("idle");
        return;
      }

      if (!idempotencyKey.current) idempotencyKey.current = createSubmissionKey();
      const formData = new FormData();
      formData.set("roleId", role.id);
      formData.set("fullName", values.fullName);
      formData.set("email", values.email);
      formData.set("linkedinUrl", values.linkedinUrl);
      formData.set("experienceLevel", values.experienceLevel);
      formData.set("coverLetter", values.coverLetter);
      formData.set("resume", resume as File);

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20_000);

      try {
        const response = await fetch("/api/applications", {
          method: "POST",
          body: formData,
          headers: {
            "Idempotency-Key": idempotencyKey.current,
            ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          },
          signal: controller.signal,
          cache: "no-store",
        });
        window.clearTimeout(timeout);
        const payload = await response.json().catch(() => ({})) as ApiError & { id?: string };

        if (response.status === 401 && payload.code === "SESSION_EXPIRED") {
          persistDraftForReauthentication();
          setGlobalError("");
          setSessionExpired(true);
          setStatus("error");
          return;
        }

        if (response.status === 422 && payload.fieldErrors) {
          setErrors(payload.fieldErrors);
          setGlobalError(payload.message || "Check the highlighted fields and try again.");
          setStatus("error");
          return;
        }

        if (response.status === 413) {
          setErrors({ resume: "Your resume must be 5 MB or smaller." });
          setGlobalError(payload.message || "The upload is too large.");
          setStatus("error");
          return;
        }

        if (response.status === 415) {
          setErrors({ resume: payload.message || "Choose a real PDF resume." });
          setGlobalError(payload.message || "This file type is not supported.");
          setStatus("error");
          return;
        }

        if (response.status === 409 && payload.code === "ALREADY_APPLIED") {
          setGlobalError(payload.message || "You already applied for this role.");
          setRetryAvailable(false);
          setErrors({});
          setStatus("error");
          return;
        }

        if (!response.ok) {
          setGlobalError(response.status >= 500
            ? "We could not confirm your submission. Retrying is safe."
            : payload.message || "We could not submit your application. Please try again.");
          setRetryAvailable(response.status >= 500);
          setStatus("error");
          return;
        }

        if (typeof payload.id === "string") setSubmittedId(payload.id);
        setStatus("done");
        setGlobalError("");
        setErrors({});
        try { sessionStorage.removeItem(draftStorageKey); } catch { /* Storage is optional. */ }
      } catch {
        setGlobalError("We could not confirm your submission. Retrying is safe.");
        setRetryAvailable(true);
        setStatus("error");
      } finally {
        window.clearTimeout(timeout);
      }
    } catch {
      setGlobalError("We could not validate this form. Review the fields and try again.");
      setRetryAvailable(false);
      setStatus("error");
    } finally {
      inFlight.current = false;
      if (status === "submitting") setStatus((current) => current === "submitting" ? "idle" : current);
    }
  }

  const fieldErrorItems = Object.entries(errors).filter((entry): entry is [string, string] => Boolean(entry[1]));

  if (status === "done") {
    return (
      <section className="success-panel" aria-labelledby="application-success-heading">
        <div className="success-icon" aria-hidden="true">✓</div>
        <h2 id="application-success-heading">Application received. Nice move.</h2>
        <p>Your application for <strong>{role.title}</strong> has been saved. You can check its status and download your resume from your dashboard.</p>
        {submittedId && <p><strong>Reference:</strong> <span>{submittedId}</span></p>}
        <div className="success-actions">
          <Link href="/dashboard" className="button button-dark">View my applications <span aria-hidden="true">↗</span></Link>
          <Link href="/#opportunities" className="button button-outline">Explore other roles</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <form className="panel" onSubmit={(event) => void submitApplication(event)} noValidate aria-busy={status === "submitting"}>
        <div className="panel-heading">
          <div><h2>Tell us about yourself</h2><p>A few details help the team get to know you.</p></div>
          <span className="required-note">* Required</span>
        </div>

        {(globalError || fieldErrorItems.length > 0) && (
          <div className="error-summary" ref={summaryRef} role="alert" aria-live="assertive" tabIndex={-1} aria-labelledby="form-error-heading">
            <h2 id="form-error-heading">We need to check a few things</h2>
            {globalError && <p>{globalError}</p>}
            {fieldErrorItems.length > 0 && (
              <ul>
                {fieldErrorItems.map(([field, message]) => (
                  <li key={field}><a href={field === "resume" ? "#resume" : `#${field}`}>{fieldNames[field] ?? field}: {message}</a></li>
                ))}
              </ul>
            )}
            {retryAvailable && (
              <button className="button button-dark button-small" type="button" onClick={() => void submitApplication()} aria-disabled={status === "submitting"}>
                {status === "submitting" ? "Retrying…" : "Retry safely"} <span aria-hidden="true">↻</span>
              </button>
            )}
            {globalError && globalError.toLowerCase().includes("already applied") && (
              <p><Link className="auth-link" href="/dashboard">View your existing application <span aria-hidden="true">↗</span></Link></p>
            )}
          </div>
        )}

        <div className="field-grid">
          <div className="field-group">
            <label htmlFor="fullName">Full name *</label>
            <input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={100} value={values.fullName} onChange={(event) => updateField("fullName", event.target.value)} aria-invalid={Boolean(errors.fullName)} aria-describedby={["fullName-hint", errors.fullName ? "fullName-error" : ""].filter(Boolean).join(" ") || undefined} />
            <p className="field-hint" id="fullName-hint">Use the name you want the team to know.</p>
            {errors.fullName && <p className="field-error" id="fullName-error">{errors.fullName}</p>}
          </div>
          <div className="field-group">
            <label htmlFor="email">Email address *</label>
            <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} value={values.email} onChange={(event) => updateField("email", event.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} />
            {errors.email && <p className="field-error" id="email-error">{errors.email}</p>}
          </div>
          <div className="field-group">
            <label htmlFor="linkedinUrl">LinkedIn profile <span className="field-hint">(optional)</span></label>
            <input id="linkedinUrl" name="linkedinUrl" type="url" inputMode="url" autoComplete="url" placeholder="https://www.linkedin.com/in/you" value={values.linkedinUrl} onChange={(event) => updateField("linkedinUrl", event.target.value)} aria-invalid={Boolean(errors.linkedinUrl)} aria-describedby={errors.linkedinUrl ? "linkedinUrl-error" : undefined} />
            {errors.linkedinUrl && <p className="field-error" id="linkedinUrl-error">{errors.linkedinUrl}</p>}
          </div>
          <div className="field-group">
            <label htmlFor="experienceLevel">Experience level *</label>
            <select id="experienceLevel" name="experienceLevel" required value={values.experienceLevel} onChange={(event) => updateField("experienceLevel", event.target.value)} aria-invalid={Boolean(errors.experienceLevel)} aria-describedby={errors.experienceLevel ? "experienceLevel-error" : undefined}>
              <option value="">Choose your level</option>
              <option value="student">Student / recent graduate</option>
              <option value="junior">Junior (0–2 years)</option>
              <option value="mid">Mid-level (3–5 years)</option>
              <option value="senior">Senior (6+ years)</option>
            </select>
            {errors.experienceLevel && <p className="field-error" id="experienceLevel-error">{errors.experienceLevel}</p>}
          </div>
          <div className="field-group field-span-full">
            <label htmlFor="resume">Resume (PDF, max 5 MB) *</label>
            <div className="file-drop">
              <span className="file-icon" aria-hidden="true">PDF</span>
              <div className="file-drop-content">
                <strong>{resume ? resume.name : "Attach your latest resume"}</strong>
                <p id="resume-hint">{resume ? `${(resume.size / (1024 * 1024)).toFixed(2)} MB selected · Choose another file any time.` : "PDF only · Up to 5 MB · Stored privately"}</p>
              </div>
              <input ref={resumeInputRef} className="file-hidden" id="resume" name="resume" type="file" accept="application/pdf,.pdf" aria-describedby={["resume-hint", errors.resume ? "resume-error" : ""].filter(Boolean).join(" ")} aria-invalid={Boolean(errors.resume)} onChange={(event) => chooseResume(event.target.files?.[0] ?? null)} />
              <label htmlFor="resume" className="file-select-label">Choose PDF</label>
            </div>
            {errors.resume && <p className="field-error" id="resume-error">{errors.resume}</p>}
          </div>
          <div className="field-group field-span-full">
            <label htmlFor="coverLetter">A note to the team <span className="field-hint">(optional, up to 2,000 characters)</span></label>
            <textarea id="coverLetter" name="coverLetter" rows={4} maxLength={2000} value={values.coverLetter} onChange={(event) => updateField("coverLetter", event.target.value)} placeholder="What interests you about this role?" aria-describedby="coverLetter-hint" />
            <p className="field-hint" id="coverLetter-hint">{values.coverLetter.length}/2,000 characters. Keep it genuine; there&apos;s no perfect answer.</p>
          </div>
        </div>

        <div className="safe-note"><span aria-hidden="true">▣</span><div><strong>Your information stays private.</strong> Your resume is stored outside the public web folder and can only be downloaded by the account that submitted it.</div></div>
        <button className="button button-dark full-width form-submit" type="submit" aria-disabled={status === "submitting"} aria-busy={status === "submitting"}>
          {status === "submitting" ? "Sending your application…" : "Submit application"} <span aria-hidden="true">{status === "submitting" ? "…" : "↗"}</span>
        </button>
        <p className="form-footer-note">One application per role. If a request times out, retrying with the same key is safe.</p>
      </form>

      {sessionExpired && (
        <div className="dialog-backdrop">
          <div className="dialog-card" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="session-dialog-heading" aria-describedby="session-dialog-description">
            <div className="dialog-icon" aria-hidden="true">⌁</div>
            <h2 id="session-dialog-heading">Your session expired.</h2>
            <p id="session-dialog-description">Please sign in again to finish submitting. Your text answers and safe-retry key will be restored, but you&apos;ll need to choose the PDF again because browsers do not allow file inputs to be restored.</p>
            <div className="dialog-actions">
              <button className="button button-dark" type="button" onClick={() => {
                persistDraftForReauthentication();
                router.push(`/sign-in?returnTo=${encodeURIComponent(`/apply/${role.id}`)}`);
              }}>Sign in again <span aria-hidden="true">↗</span></button>
              <button className="button button-outline" type="button" onClick={() => setSessionExpired(false)}>Keep editing</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
