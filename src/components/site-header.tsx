"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type PortalUser = { id: string; name: string; email: string };

export function SiteHeader() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [checking, setChecking] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!active || !data) return;
        setUser(data.user ?? null);
        setCsrfToken(data.csrfToken ?? "");
      })
      .catch(() => undefined)
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (response.ok) {
        setUser(null);
        setCsrfToken("");
        router.replace("/");
      }
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="Northstar Careers home">
          <span className="brand-mark" aria-hidden="true">n<span>✳</span></span>
          <span className="brand-word">northstar<span>careers</span></span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/#opportunities">Find a role</Link>
          <Link href="/#culture">Our culture</Link>
        </nav>
        <div className="header-actions">
          {checking ? (
            <span className="header-skeleton" aria-label="Checking sign-in status" />
          ) : user ? (
            <>
              <Link className="nav-dashboard" href="/dashboard">My applications</Link>
              <button className="avatar-button" type="button" onClick={() => void signOut()} disabled={signingOut} aria-label={signingOut ? "Signing out" : `Sign out ${user.name}`}>
                <span aria-hidden="true">{user.name.trim().charAt(0).toUpperCase() || "C"}</span>
              </button>
            </>
          ) : (
            <>
              <Link className="nav-sign-in" href="/sign-in">Sign in</Link>
              <Link className="button button-dark button-small" href="/#opportunities">Explore roles <span aria-hidden="true">↗</span></Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
