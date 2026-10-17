"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep diagnostic details in the browser console; never render server internals to the page.
    console.error("Careers Portal page error.", error);
  }, [error]);

  return (
    <main id="main-content" className="utility-page">
      <div className="utility-shell">
        <section className="application-empty">
          <span aria-hidden="true">↻</span>
          <h1 className="page-title">That did not go<br />to plan<span style={{ color: "#839e58" }}>.</span></h1>
          <p>Something unexpected happened. Your account and saved applications have not been removed. You can try loading this page again.</p>
          <button className="button button-dark" type="button" onClick={() => reset()}>Try again <span aria-hidden="true">↻</span></button>
        </section>
      </div>
    </main>
  );
}
