"use client";
import { useEffect, useState } from "react";

type Event = {fromStatus:string|null;toStatus:string;source:string;occurredAt:string};
const label=(value:string)=>({APPLIED:"Application submitted",SCREENING:"In review",SHORTLISTED:"Shortlisted",INTERVIEW:"Interview",OFFERED:"Offer received",HIRED:"Hired",REJECTED:"Not moving forward",WITHDRAWN:"Withdrawn"}[value]||value);
export function CandidateApplicationHistory({applicationId}:{applicationId:string}) {
  const [events,setEvents]=useState<Event[]>([]);const [error,setError]=useState("");const [loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;fetch("/api/applications/"+encodeURIComponent(applicationId)+"/history",{cache:"no-store"})
    .then(async response=>{const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.message||"Could not load history.");return body;})
    .then(body=>{if(active)setEvents(Array.isArray(body.history)?body.history:[]);})
    .catch(e=>{if(active)setError(e instanceof Error?e.message:"Could not load application history.");})
    .finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[applicationId]);
  return <section aria-labelledby="application-history-heading"><p className="page-kicker"><span className="eyebrow-dot"/> CANDIDATE SPACE</p><h1 className="page-title" id="application-history-heading">Application timeline<span style={{color:"#839e58"}}>.</span></h1><p className="page-lede">Only status changes and dates are displayed here. Private recruiter notes are never shared.</p>
    {loading?<div className="loading-placeholder" aria-busy="true"><div className="loading-line"/></div>:error?<div className="form-notice form-notice-error" role="alert">{error}</div>:events.length===0?<p className="recruiter-empty">There are no recorded status events yet.</p>:<ol className="candidate-timeline">{events.map((event,index)=><li key={event.occurredAt+"-"+index}><span className="timeline-dot"/><div><strong>{label(event.toStatus)}</strong><p>{new Intl.DateTimeFormat("en-BD",{dateStyle:"medium",timeStyle:"short"}).format(new Date(event.occurredAt))}</p><small>{event.source}</small></div></li>)}</ol>}
  </section>;
}
