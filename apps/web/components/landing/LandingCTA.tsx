import Link from "next/link";

export default function LandingCTA() {
  return (
    <>
      <section className="landing-cta">
        <h2>Ready to break your robot safely?</h2>
        <p>
          Start with a warehouse task. FailureCloud will surface the edge cases
          worth simulating.
        </p>
        <Link className="landing-btn landing-btn--primary" href="/app">
          Launch app
          <span aria-hidden="true">→</span>
        </Link>
      </section>

      <footer className="landing-footer">
        <span>FailureCloud · Unit tests for robots</span>
        <div>
          <Link href="/legacy">Legacy interface</Link>
        </div>
      </footer>
    </>
  );
}
