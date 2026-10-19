import Link from "next/link";
import type { Metadata } from "next";
import { CandidateApplicationHistory } from "@/components/application-history";

export const instant = false;
export const metadata: Metadata = { title: "Application status history" };
export default async function CandidateApplicationHistoryPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return <main id="main-content" className="utility-page"><div className="utility-shell">
    <div style={{display:"flex",justifyContent:"space-between",gap:20,marginBottom:26}}><Link className="auth-link" href="/dashboard">← My applications</Link><Link className="auth-link" href="/#opportunities">Explore roles ↗</Link></div>
    <CandidateApplicationHistory applicationId={id}/>
  </div></main>;
}
