"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Props = { returnTo: string };

export function SignInForm({ returnTo }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload.message === "string" ? payload.message : "We could not sign you in. Please try again.");
        return;
      }
      // The destination is reduced to a same-origin path by the server page.
      window.location.assign(returnTo);
    } catch {
      setError("The sign-in request could not reach the server. Check your connection and retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit} noValidate>
      {error && <div className="form-notice form-notice-error" id="sign-in-error" role="alert"><span aria-hidden="true">!</span><div>{error}</div></div>}
      <div className="field-group">
        <label htmlFor="sign-in-email">Email address</label>
        <input id="sign-in-email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" aria-invalid={Boolean(error)} aria-describedby={error ? "sign-in-error" : undefined} />
      </div>
      <div className="field-group">
        <label htmlFor="sign-in-password">Password</label>
        <div className="password-wrap">
          <input id="sign-in-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" />
          <button className="password-toggle" type="button" onClick={() => setShowPassword((current) => !current)} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button>
        </div>
      </div>
      <button className="button button-dark full-width form-submit" type="submit" aria-disabled={pending} aria-busy={pending}>
        {pending ? "Signing you in…" : "Sign in securely"} <span aria-hidden="true">↗</span>
      </button>
      <p className="form-footer-note">This portal uses fictional data and a local demo account. Credentials are configured by the project owner.</p>
      <p className="form-footer-note">Just exploring? <Link className="auth-link" href="/#opportunities">Browse roles without signing in</Link></p>
    </form>
  );
}
