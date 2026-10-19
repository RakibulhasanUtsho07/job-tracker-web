import Link from "next/link";
import { JobDirectory } from "@/components/job-directory";
import { getPublicJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function Home() {
  const roles = await getPublicJobs();
  return (
    <main id="main-content">
      <section className="hero-section">
        <div className="hero-orb hero-orb-one" aria-hidden="true" />
        <div className="hero-orb hero-orb-two" aria-hidden="true" />
        <div className="hero-layout page-shell">
          <div className="hero-copy">
            <p className="eyebrow hero-eyebrow"><span className="eyebrow-dot" /> A BETTER WAY TO FIND YOUR PLACE</p>
            <h1>Your next chapter<br />starts <span>right here.</span></h1>
            <p className="hero-description">Good work starts with good people. Explore meaningful roles, meet a team that cares, and take the next step on your own terms.</p>
            <div className="hero-actions">
              <Link className="button button-lime" href="#opportunities">Find your next role <span aria-hidden="true">↗</span></Link>
              <Link className="button button-glass" href="/dashboard">Track an application <span aria-hidden="true">→</span></Link>
            </div>
            <div className="hero-proof">
              <div className="proof-avatars" aria-hidden="true"><span>A</span><span>M</span><span>J</span><span>+</span></div>
              <p><strong>People first, always.</strong><br /><span>Built around a thoughtful candidate experience.</span></p>
            </div>
          </div>
          <div className="hero-art" aria-label="Illustration of a candidate journey from application to next step">
            <div className="art-label"><span className="live-dot" /> THE JOURNEY, MADE CLEAR</div>
            <div className="journey-card journey-card-back">
              <div className="journey-mini-icon" aria-hidden="true">✳</div>
              <div><span className="mini-kicker">YOUR NEXT STEP</span><strong>Meet the team</strong></div>
              <span className="mini-arrow" aria-hidden="true">↗</span>
            </div>
            <div className="journey-card journey-card-main">
              <div className="application-card-top"><span className="application-badge">APPLICATION</span><span className="more-dots" aria-hidden="true">•••</span></div>
              <div className="profile-art">
                <div className="profile-avatar" aria-hidden="true"><span /></div>
                <div className="profile-lines"><span /><span /></div>
                <span className="verified-mark" aria-label="Submitted">✓</span>
              </div>
              <span className="art-subtitle">WEB DEVELOPER</span>
              <h2>One good move<br />can change everything.</h2>
              <div className="journey-progress" aria-label="Application progress: submitted">
                <span className="journey-progress-done" /><span className="journey-progress-done" /><span /><span />
              </div>
              <div className="progress-captions"><span>Application sent</span><span>Step 1 of 4</span></div>
            </div>
            <div className="orbit-sticker orbit-sticker-top" aria-hidden="true">↗</div>
            <div className="orbit-sticker orbit-sticker-bottom" aria-hidden="true"><span>✳</span><strong>MAKE<br />IT MATTER</strong></div>
            <div className="art-footnote">A fictional careers portal · Thoughtfully designed for real-world flows</div>
          </div>
        </div>
        <div className="hero-bottom-line page-shell">
          <span>BUILT FOR THE WAY PEOPLE WORK TODAY</span>
          <div><span>✳</span> Meaningful work <i /> <span>↗</span> Clear next steps <i /> <span>◌</span> People over process</div>
        </div>
      </section>

      <div className="stats-strip page-shell" aria-label="Portal overview">
        <div><strong>06</strong><span>Fictional open roles</span></div>
        <div><strong>03</strong><span>Ways to work</span></div>
        <div><strong>05 MB</strong><span>Private PDF resume limit</span></div>
        <div><strong>01</strong><span>Clear place to track it all</span></div>
      </div>

      <JobDirectory roles={roles} />

      <section className="culture-section" id="culture">
        <div className="culture-card page-shell">
          <div className="culture-topline"><span className="culture-symbol" aria-hidden="true">✳</span><span className="culture-overline">A LITTLE ABOUT HOW WE WORK</span><span className="culture-number">01 / 03</span></div>
          <div className="culture-layout">
            <h2>Ambition is good.<br /><span>Feeling supported</span><br />is better.</h2>
            <div className="culture-copy">
              <p>We believe the best work happens when expectations are clear, curiosity is welcome, and people can bring their whole problem-solving selves to the table.</p>
              <div className="culture-values">
                <div><span>01</span><strong>Room to grow</strong><p>Stretch with support, not guesswork.</p></div>
                <div><span>02</span><strong>Thoughtful by default</strong><p>Accessibility and respect are part of the work.</p></div>
                <div><span>03</span><strong>Progress, not theatre</strong><p>Useful feedback beats mysterious process.</p></div>
              </div>
            </div>
          </div>
          <div className="culture-footer"><span>FICTIONAL COMPANY · DEMO ENVIRONMENT</span><Link href="#opportunities">Explore the opportunities <span aria-hidden="true">↗</span></Link></div>
        </div>
      </section>

      <section className="final-cta page-shell">
        <div><p className="eyebrow"><span className="eyebrow-dot" /> YOUR NEXT CHAPTER</p><h2>Curiosity looks good<br />on <span>you.</span></h2></div>
        <div><p>Take a look around. A thoughtful next step can start with a simple search.</p><Link href="#opportunities" className="button button-dark">Browse open roles <span aria-hidden="true">↗</span></Link></div>
      </section>

      <footer className="site-footer">
        <div className="footer-inner page-shell">
          <Link className="brand brand-footer" href="/"><span className="brand-mark" aria-hidden="true">n<span>✳</span></span><span className="brand-word">northstar<span>careers</span></span></Link>
          <p>Thoughtful work. Clear next steps.</p>
          <span>© 2026 Northstar Careers <i /> Fictional demo</span>
        </div>
      </footer>
    </main>
  );
}
