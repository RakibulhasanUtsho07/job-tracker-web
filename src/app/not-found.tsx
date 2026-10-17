import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="utility-page">
      <div className="utility-shell">
        <section className="application-empty">
          <span aria-hidden="true">⌁</span>
          <p className="page-kicker">404 · WRONG TURN, NO WORRIES</p>
          <h1 className="page-title">This page went<br />off the map<span style={{ color: "#839e58" }}>.</span></h1>
          <p>The role or page may have moved. Head back to the role directory and choose another next step.</p>
          <Link className="button button-dark" href="/#opportunities">Browse open roles <span aria-hidden="true">↗</span></Link>
        </section>
      </div>
    </main>
  );
}
