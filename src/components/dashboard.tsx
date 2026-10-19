"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type PortalUser = { id: string; name: string; email: string };
type Application = {
  id: string;
  roleId: string;
  roleTitle: string;
  department: string;
  fullName: string;
  email: string;
  experienceLevel: string;
  resumeName: string;
  resumeAvailable: boolean;
  status: "submitted" | "in_review" | "shortlisted" | "rejected" | "interview" | "offered" | "hired" | "withdrawn" | string;
  submittedAt: number;
};

type Filter = "all" | "active" | "shortlisted" | "closed";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All applications" },
  { id: "active", label: "In progress" },
  { id: "shortlisted", label: "Shortlisted" },
  { id: "closed", label: "Closed" },
];

function statusLabel(status: string): string {
  switch (status) {
    case "in_review": return "In review";
    case "shortlisted": return "Shortlisted";
    case "rejected": return "Not moving forward";
    case "interview": return "Interview";
    case "offered": return "Offer received";
    case "hired": return "Hired";
    case "withdrawn": return "Withdrawn";
    default: return "Submitted";
  }
}

function formattedDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-BD", { day: "numeric", month: "short", year: "numeric" }).format(new Date(timestamp));
}

export function CandidateDashboard() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [totalApplications, setTotalApplications] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = sessionResponse.ok ? await sessionResponse.json() : { user: null };
      if (!session.user) {
        setUser(null);
        setApplications([]);
        setTotalApplications(0);
        setNextOffset(0);
        setHasMore(false);
        return;
      }
      setUser(session.user as PortalUser);

      const response = await fetch("/api/applications?limit=25&offset=0", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setUser(null);
        setApplications([]);
        return;
      }
      if (!response.ok) throw new Error(payload.message || "We could not load your applications.");
      const firstPage = Array.isArray(payload.applications) ? payload.applications : [];
      setApplications(firstPage);
      setTotalApplications(Number(payload.total ?? firstPage.length));
      setNextOffset(Number(payload.nextOffset ?? firstPage.length));
      setHasMore(Boolean(payload.hasMore));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "We could not load your applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(handle);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/applications?limit=25&offset=${nextOffset}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setUser(null);
        setApplications([]);
        setTotalApplications(0);
        setHasMore(false);
        return;
      }
      if (!response.ok) throw new Error(payload.message || "We could not load older applications.");
      const page = Array.isArray(payload.applications) ? payload.applications as Application[] : [];
      setApplications(current => {
        const existing = new Set(current.map(application => application.id));
        return [...current, ...page.filter(application => !existing.has(application.id))];
      });
      setTotalApplications(Number(payload.total ?? totalApplications));
      setNextOffset(Number(payload.nextOffset ?? nextOffset + page.length));
      setHasMore(Boolean(payload.hasMore));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "We could not load older applications.");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextOffset, totalApplications]);

  const visibleApplications = useMemo(() => applications.filter((application) => {
    if (filter === "active") return ["submitted", "in_review", "shortlisted", "interview", "offered"].includes(application.status);
    if (filter === "shortlisted") return application.status === "shortlisted";
    if (filter === "closed") return ["rejected", "hired", "withdrawn"].includes(application.status);
    return true;
  }), [applications, filter]);

  if (!loading && !user) {
    return (
      <section className="application-empty">
        <span aria-hidden="true">⌁</span>
        <h2>Sign in to see your journey.</h2>
        <p>Your applications are private to your account. Sign in with your candidate account to view application statuses and private resume files.</p>
        <Link className="button button-dark" href="/sign-in?returnTo=%2Fdashboard">Sign in to continue <span aria-hidden="true">↗</span></Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="dashboard-applications-heading">
      <div className="dashboard-head">
        <div>
          <p className="page-kicker"><span className="eyebrow-dot" /> YOUR CANDIDATE SPACE</p>
          <h1 className="page-title" id="dashboard-applications-heading">Your next steps<span style={{ color: "#839e58" }}>.</span></h1>
          <p className="page-lede">{user ? `Welcome back, ${user.name}. Here is where things stand.` : "Your applications, gathered in one calm place."}</p>
        </div>
        <div className="dashboard-count" aria-label={`${totalApplications} applications submitted`}>
          <strong>{totalApplications.toString().padStart(2, "0")}</strong>
          <span>Applications<br />submitted</span>
        </div>
      </div>

      <div className="dashboard-tabs" role="group" aria-label="Filter applications">
        {filters.map((item) => (
          <button key={item.id} className="dashboard-tab" type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="loading-placeholder" aria-label="Loading applications" aria-busy="true"><div className="loading-line" /><div className="loading-line" /></div>
      ) : loadError ? (
        <div className="form-notice form-notice-error" role="alert"><div><strong>Something did not load.</strong>{loadError}<p><button className="auth-link" type="button" onClick={() => { setLoading(true); setLoadError(""); void load(); }}>Try again</button></p></div></div>
      ) : visibleApplications.length === 0 ? (
        <div className="application-empty">
          <span aria-hidden="true">✳</span>
          <h2>{hasMore ? "No matching applications on this page yet." : applications.length === 0 ? "Your next chapter can start here." : "Nothing in this view yet."}</h2>
          <p>{hasMore ? "Load older applications to include earlier results in this filter." : applications.length === 0 ? "When you apply for a role, you'll find the submission date, status, and resume download here." : "Choose another filter to see your other applications."}</p>
          {hasMore && <button className="button button-dark" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load older applications"}</button>}
          {applications.length === 0 && !hasMore && <Link className="button button-dark" href="/#opportunities">Explore open roles <span aria-hidden="true">↗</span></Link>}
          {applications.length > 0 && !hasMore && <button className="button button-outline" type="button" onClick={() => setFilter("all")}>Show all applications</button>}
        </div>
      ) : (
        <div className="application-list">
          {visibleApplications.map((application) => (
            <article className="application-row" key={application.id}>
              <div className="application-row-main">
                <span className="application-role-icon" aria-hidden="true">✳</span>
                <div>
                  <h3>{application.roleTitle}</h3>
                  <p>{application.department} <span aria-hidden="true">·</span> Applied {formattedDate(application.submittedAt)}</p>
                  <p>Reference: <span>{application.id.slice(0, 8).toUpperCase()}</span> <span aria-hidden="true">·</span> Resume: {application.resumeName}</p>
                </div>
              </div>
              <div className="application-row-meta">
                <span className={`status-pill status-${application.status}`}>{statusLabel(application.status)}</span>
                {application.resumeAvailable && <a className="resume-link" href={`/api/applications/${encodeURIComponent(application.id)}/resume`}>Download PDF ↗</a>}
                <Link className="resume-link" href={`/dashboard/applications/${encodeURIComponent(application.id)}`}>Status history ↗</Link>
              </div>
            </article>
          ))}
        </div>
      )}
      {visibleApplications.length > 0 && hasMore && <div className="recruiter-actions"><button className="button button-outline" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading older applications…" : "Load older applications"}</button><span>Showing {applications.length} of {totalApplications}</span></div>}
      <div className="safe-note"><span aria-hidden="true">▣</span><div>Only your account can see these applications. Resume downloads are authorized on the server and sent as attachments.</div></div>
    </section>
  );
}
