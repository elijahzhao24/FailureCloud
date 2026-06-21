import Link from "next/link";

const flow: Array<{
  label: string;
  text: string;
  highlight?: boolean;
}> = [
  {
    label: "INPUT",
    text: "A warehouse robot carries a cup of water across the floor.",
  },
  {
    label: "EDGE CASES",
    text: "Slippery floor · Dropped box · Human crossing · Low light · Sudden stop",
    highlight: true,
  },
  {
    label: "SIMULATION",
    text: "PyBullet run with RGB, depth, LiDAR, and collision sensors.",
  },
  {
    label: "VERDICT",
    text: "FAILED — 48% water remaining. Threshold: 70%.",
    highlight: true,
  },
];

export default function ProductDiagram() {
  return (
    <div className="landing-diagram">
      <div className="landing-diagram__pulse" aria-hidden="true" />
      <div className="landing-diagram__frame">
        <div className="landing-diagram__header">
          <span>failurecloud · test pipeline</span>
          <div className="landing-diagram__dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="landing-diagram__flow">
          {flow.map((node, i) => (
            <div key={node.label}>
              <div
                className={`landing-diagram__node${node.highlight ? " landing-diagram__node--active" : ""}`}
              >
                <span className="landing-diagram__node-label">{node.label}</span>
                <span
                  className={
                    node.highlight
                      ? "landing-diagram__node-text landing-diagram__node-text--mint"
                      : "landing-diagram__node-text"
                  }
                >
                  {node.text}
                </span>
              </div>
              {i < flow.length - 1 && (
                <div className="landing-diagram__connector" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingHero() {
  return (
    <section className="landing-hero">
      <div className="landing-hero__content">
        <span className="landing-hero__eyebrow">Unit tests for robots</span>
        <h1>
          Find failures
          <br />
          before robots <em>do.</em>
        </h1>
        <p className="landing-hero__sub">
          Turn natural-language tasks into edge-case simulations with sensors,
          labels, rewards, and exportable test data.
        </p>
        <div className="landing-hero__actions">
          <Link className="landing-btn landing-btn--primary" href="/app">
            Start a test
            <span aria-hidden="true">→</span>
          </Link>
          <a className="landing-btn landing-btn--ghost" href="#workflow">
            See workflow
          </a>
        </div>
      </div>
      <ProductDiagram />
    </section>
  );
}
