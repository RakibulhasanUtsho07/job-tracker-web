import Link from "next/link";
import type { Metadata } from "next";
import { SignUpForm } from "@/components/sign-up-form";

export const metadata: Metadata = { title: "Create account" };


export default function SignUpPage() {
  return (
    <main id="main-content" className="utility-page">
      <div className="utility-shell">
        <div className="auth-layout">
          <aside className="auth-aside">
            <p className="eyebrow"><span className="eyebrow-dot" /> YOUR CAREER, YOUR PACE</p>
            <h1>Your next step<br />starts <span>with you.</span></h1>
            <p>Create a candidate account to submit applications and keep their progress together in one private place.</p>
            <div className="auth-points">
              <div className="auth-point"><span aria-hidden="true">✓</span><div><strong>One clear place</strong><p>Find your applications in one dashboard.</p></div></div>
              <div className="auth-point"><span aria-hidden="true">⌁</span><div><strong>Private by design</strong><p>Passwords are stored as salted hashes, not plain text.</p></div></div>
              <div className="auth-point"><span aria-hidden="true">↻</span><div><strong>Ready when you are</strong><p>Sign in again to continue where you left off.</p></div></div>
            </div>
          </aside>
          <section className="auth-card" aria-labelledby="sign-up-heading">
            <p className="page-kicker"><span className="eyebrow-dot" /> CANDIDATE PORTAL</p>
            <h2 id="sign-up-heading">Create your account.</h2>
            <p className="auth-card-intro">Use an email address you can access and a password with at least 12 characters.</p>
            <SignUpForm />
            <div className="auth-lock-note"><span aria-hidden="true">▣</span> Your session uses a secure, HttpOnly cookie.</div>
          </section>
        </div>
        <p className="form-footer-note"><Link className="auth-link" href="/">← Back to Northstar Careers</Link></p>
      </div>
    </main>
  );
}
