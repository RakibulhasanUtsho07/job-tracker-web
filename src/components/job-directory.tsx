"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { JobRole } from "@/lib/roles";

type Props = { roles: JobRole[] };

export function JobDirectory({ roles }: Props) {
  const [query, setQuery] = useState("");
  const [workMode, setWorkMode] = useState("All work styles");
  const [department, setDepartment] = useState("All teams");

  const departments = useMemo(() => ["All teams", ...Array.from(new Set(roles.map((role) => role.department)))], [roles]);
  const visibleRoles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return roles.filter((role) => {
      const searchable = [role.title, role.department, role.location, role.description, role.level].join(" ").toLowerCase();
      return (!normalizedQuery || searchable.includes(normalizedQuery))
        && (workMode === "All work styles" || role.workMode === workMode)
        && (department === "All teams" || role.department === department);
    });
  }, [department, query, roles, workMode]);

  return (
    <section className="opportunities-section" id="opportunities" aria-labelledby="roles-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow"><span className="eyebrow-dot" /> THE OPPORTUNITIES</p>
          <h2 id="roles-heading">Work that moves<br className="desktop-break" /> you <span>forward.</span></h2>
        </div>
        <p className="section-description">Small teams, meaningful problems, and room to do your best work. Find the role that fits your next chapter.</p>
      </div>

      <div className="directory-toolbar">
        <label className="search-box">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <span className="sr-only">Search roles</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Role, skill, or keyword..." type="search" />
          {query && <button className="clear-search" type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>
        <label className="select-box">
          <span className="sr-only">Filter by work style</span>
          <select value={workMode} onChange={(event) => setWorkMode(event.target.value)}>
            <option>All work styles</option>
            <option>Remote</option>
            <option>Hybrid</option>
            <option>On-site</option>
          </select>
        </label>
        <label className="select-box">
          <span className="sr-only">Filter by team</span>
          <select value={department} onChange={(event) => setDepartment(event.target.value)}>
            {departments.map((team) => <option key={team}>{team}</option>)}
          </select>
        </label>
      </div>

      <div className="results-meta">
        <span><strong>{visibleRoles.length.toString().padStart(2, "0")}</strong> open {visibleRoles.length === 1 ? "role" : "roles"}</span>
        <span>Fictional roles · Updated for this demo</span>
      </div>

      {visibleRoles.length > 0 ? (
        <div className="job-grid">
          {visibleRoles.map((role, index) => (
            <article className="job-card" key={role.id}>
              <div className="job-card-topline">
                <span className={`team-symbol team-symbol-${role.teamColor}`} aria-hidden="true">{role.department === "Design" ? "◈" : role.department === "Data" ? "⌁" : role.department === "Customer Experience" ? "↗" : "✳"}</span>
                <span className="posted-label">{role.postedLabel}</span>
              </div>
              <div className="job-card-copy">
                <p className="job-department">{role.department} <span>·</span> {role.employmentType}</p>
                <h3>{role.title}</h3>
                <p className="job-description">{role.description}</p>
              </div>
              <div className="job-tags" aria-label="Role details">
                <span>{role.workMode}</span><span>{role.level}</span>
              </div>
              <div className="job-card-bottom">
                <div>
                  <span className="salary-label">ESTIMATED PAY</span>
                  <p className="salary-value">{role.salary}</p>
                </div>
                <Link className="job-arrow" href={`/apply/${role.id}`} aria-label={`View and apply for ${role.title}`}>
                  <span aria-hidden="true">↗</span>
                </Link>
              </div>
              <span className="job-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-search">
          <span className="empty-search-icon" aria-hidden="true">⌕</span>
          <h3>No roles match just yet.</h3>
          <p>Try a different keyword or clear your filters to see every opportunity.</p>
          <button className="button button-outline" onClick={() => { setQuery(""); setWorkMode("All work styles"); setDepartment("All teams"); }} type="button">Clear all filters</button>
        </div>
      )}
    </section>
  );
}
