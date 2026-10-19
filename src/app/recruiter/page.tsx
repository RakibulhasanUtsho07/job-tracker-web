import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentSession } from "@/lib/auth";
import { RecruiterConsole } from "@/components/recruiter-console";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recruiter workspace" };

export default async function RecruiterPage() {
  const session = await getCurrentSession();
  if (!session) return <main id="main-content" className="utility-page"><div className="utility-shell"><h1>Sign in to continue</h1><p>The recruiter workspace needs an authorized account.</p><Link className="button button-dark" href="/sign-in?returnTo=%2Frecruiter">Sign in</Link></div></main>;
  if (session.user.role !== "RECRUITER" && session.user.role !== "ADMIN") {
    return <main id="main-content" className="utility-page"><div className="utility-shell"><h1>Recruiter access required</h1><p>This account is a candidate account. Recruiter access is assigned through trusted setup, not public signup.</p><Link className="button button-outline" href="/">Back to careers</Link></div></main>;
  }
  return <RecruiterConsole recruiterName={session.user.name} />;
}
