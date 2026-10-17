import Link from "next/link";
import type { Metadata } from "next";
import { CandidateDashboard } from "@/components/dashboard";

export const metadata: Metadata = { title: "My applications" };

export default function DashboardPage() {
  return (
    <main id="main-content" className="utility-page">
      <div className="utility-shell">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 26 }}>
          <Link className="auth-link" href="/">← Northstar Careers</Link>
          <Link className="auth-link" href="/#opportunities">Explore roles ↗</Link>
        </div>
        <CandidateDashboard />
      </div>
    </main>
  );
}
