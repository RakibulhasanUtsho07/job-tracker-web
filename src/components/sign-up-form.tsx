"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (password.length < 12) {
      setError("Use a password with at least 12 characters.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload.message === "string" ? payload.message : "We could not create your account. Please try again.");
        return;
      }
      // Navigate with the App Router after the session cookie is issued.
      router.push("/dashboard");
    } catch {
      setError("The registration request could not reach the server. Check your connection and retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit} noValidate>
      {error && <div className="form-notice form-notice-error" id="sign-up-error" role="alert"><span aria-hidden="true">!</span><div>{error}</div></div>}
      <div className="field-group">
        <label htmlFor="sign-up-name">Full name</label>
        <input id="sign-up-name" name="name" type="text" autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" aria-invalid={Boolean(error)} aria-describedby={error ? "sign-up-error" : undefined} />
      </div>
      <div className="field-group">
        <label htmlFor="sign-up-email">Email address</label>
        <input id="sign-up-email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" aria-invalid={Boolean(error)} aria-describedby={error ? "sign-up-error" : undefined} />
      </div>
      <div className="field-group">
        <label htmlFor="sign-up-password">Password</label>
        <div className="password-wrap">
          <input id="sign-up-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" aria-invalid={Boolean(error)} aria-describedby={error ? "sign-up-error" : undefined} />
          <button className="password-toggle" type="button" onClick={() => setShowPassword((current) => !current)} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button>
        </div>
      </div>
      <div className="field-group">
        <label htmlFor="sign-up-confirm-password">Confirm password</label>
        <input id="sign-up-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter the same password again" aria-invalid={Boolean(error)} aria-describedby={error ? "sign-up-error" : undefined} />
      </div>
      <button className="button button-dark full-width form-submit" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Creating your account…" : "Create account"} <span aria-hidden="true">↗</span>
      </button>
      <p className="form-footer-note">Email verification and password reset are not configured in this demo.</p>
      <p className="form-footer-note">Already have an account? <Link className="auth-link" href="/sign-in">Sign in</Link></p>
    </form>
  );
}
