import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ApplicationForm } from "@/components/application-form";
import { getRoleById } from "@/lib/roles";

type Props = { params: Promise<{ roleId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { roleId } = await params;
  const role = getRoleById(roleId);
  return { title: role ? `Apply — ${role.title}` : "Role not found" };
}

export default async function ApplyPage({ params }: Props) {
  const { roleId } = await params;
  const role = getRoleById(roleId);
  if (!role) notFound();

  return (
    <main id="main-content" className="utility-page">
      <div className="utility-shell">
        <p className="page-kicker"><span className="eyebrow-dot" /> YOUR NEXT CHAPTER</p>
        <h1 className="page-title">Make your next move<span style={{ color: "#839e58" }}>.</span></h1>
        <p className="page-lede">Applying for <strong>{role.title}</strong> takes a few minutes. Your information is handled with care, and you can track your application afterwards.</p>

        <div className="apply-layout">
          <ApplicationForm role={role} />
          <aside>
            <div className="job-side-card">
              <div className="job-side-top">
                <span className="job-side-badge">OPEN ROLE</span>
                <h2>{role.title}</h2>
                <p>{role.description}</p>
                <div className="job-side-meta">
                  <div><span aria-hidden="true">✳</span>{role.department}</div>
                  <div><span aria-hidden="true">⌖</span>{role.location}</div>
                  <div><span aria-hidden="true">◷</span>{role.workMode} · {role.employmentType}</div>
                  <div><span aria-hidden="true">↗</span>{role.salary}</div>
                </div>
              </div>
              <div className="job-side-foot">Fictional role details for a self-contained portfolio demo. No external recruiting service is contacted.</div>
            </div>
            <div className="safe-note"><span aria-hidden="true">▣</span><div><strong>PDF resumes only.</strong> Files are capped at 5 MB, checked server-side, renamed randomly, and saved outside the web root.</div></div>
            <p className="form-footer-note"><Link className="auth-link" href="/#opportunities">← Back to all roles</Link></p>
          </aside>
        </div>
      </div>
    </main>
  );
}
