const artifacts = [
  {
    icon: "01",
    title: "Executable scenarios",
    description:
      "Structured scene layouts with physics parameters, object placements, and hazard zones — not just images.",
    items: ["Warehouse layout", "Floor friction", "Obstacle positions"],
  },
  {
    icon: "02",
    title: "Sensor configuration",
    description:
      "RGB camera, depth camera, LiDAR, collision, and pose sensors configured per test.",
    items: ["720-ray LiDAR", "Depth preview", "Transform tree"],
  },
  {
    icon: "03",
    title: "Evaluation logic",
    description:
      "Auto-generated success criteria, reward functions, and failure thresholds you can edit.",
    items: ["Water threshold", "Collision limit", "Timeout rule"],
  },
] as const;

export default function LandingArtifacts() {
  return (
    <section className="landing-section" id="artifacts">
      <div className="landing-section__header">
        <span className="landing-section__label">Generated artifacts</span>
        <h2>Complete robot test cases, not just scenes.</h2>
        <p>
          Every suggestion includes everything needed to preview, run, evaluate,
          and export a robot test.
        </p>
      </div>
      <div className="landing-artifacts">
        {artifacts.map((item) => (
          <article className="landing-card" key={item.icon}>
            <div className="landing-card__icon">{item.icon}</div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <ul>
              {item.items.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
