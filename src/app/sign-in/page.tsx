import Link from "next/link";
import type { Metadata } from "next";
import { SignInForm } from "@/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export const instant = false;

type Props = { searchParams: Promise<{ returnTo?: string | string[] }> };

export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo = raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") && !raw.includes("\n")
    ? raw
    : "/dashboard";

  return (
    <main id="main-content" className="utility-page">
      <div className="utility-shell">
        <div className="auth-layout">
          <aside className="auth-aside">
            <p className="eyebrow"><span className="eyebrow-dot" /> YOUR CAREER, YOUR PACE</p>
            <h1>Good things<br />start with a<br /><span>next step.</span></h1>
            <p>Sign in to pick up where you left off, submit an application, and keep the important details in one place.</p>
            <div className="auth-points">
              <div className="auth-point"><span aria-hidden="true">✓</span><div><strong>One clear place</strong><p>Keep each application easy to find.</p></div></div>
              <div className="auth-point"><span aria-hidden="true">⌁</span><div><strong>Private by design</strong><p>Resume files are not served from the public folder.</p></div></div>
              <div className="auth-point"><span aria-hidden="true">↻</span><div><strong>Safe retries</strong><p>Network hiccups do not need to mean starting over.</p></div></div>
            </div>
          </aside>
          <section className="auth-card" aria-labelledby="sign-in-heading">
            <p className="page-kicker"><span className="eyebrow-dot" /> CANDIDATE PORTAL</p>
            <h2 id="sign-in-heading">Welcome back.</h2>
            <p className="auth-card-intro">Enter the email address and password linked to your candidate account.</p>
            <SignInForm returnTo={returnTo} />
            <div className="auth-lock-note"><span aria-hidden="true">▣</span> Session cookies are HttpOnly and same-site.</div>
          </section>
        </div>
        <p className="form-footer-note"><Link className="auth-link" href="/">← Back to Northstar Careers</Link></p>
      </div>
    </main>
  );
}
