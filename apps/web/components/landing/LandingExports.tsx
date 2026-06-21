const exports = [
  {
    name: "PyBullet Replay",
    desc: "Replay this exact simulation locally.",
    format: ".py + scenario.json",
    status: "ready" as const,
  },
  {
    name: "ROS-style Folder",
    desc: "RGB, depth, LiDAR, and transforms as sensor streams.",
    format: "topic_manifest.json",
    status: "ready" as const,
  },
  {
    name: "OpenPCDet Dataset",
    desc: "Point clouds and labels for 3D detector training.",
    format: "Kitti-style labels",
    status: "ready" as const,
  },
  {
    name: "Isaac Sim Config",
    desc: "Scenario spec for high-fidelity simulation.",
    format: "scenario_config.yaml",
    status: "preview" as const,
  },
  {
    name: "Nebius Manifest",
    desc: "Task, reward, and success criteria for physical AI.",
    format: "task_manifest.yaml",
    status: "preview" as const,
  },
] as const;

const badgeClass = {
  ready: "landing-badge landing-badge--ready",
  preview: "landing-badge landing-badge--preview",
  soon: "landing-badge landing-badge--soon",
} as const;

const badgeLabel = {
  ready: "Ready",
  preview: "Preview",
  soon: "Coming soon",
} as const;

export default function LandingExports() {
  return (
    <section className="landing-section" id="exports">
      <div className="landing-section__header">
        <span className="landing-section__label">Exports</span>
        <h2>Package tests for your toolchain.</h2>
        <p>
          Honest status labels — we only mark integrations as ready when they
          actually work.
        </p>
      </div>
      <div className="landing-exports">
        {exports.map((item) => (
          <div className="landing-export-row" key={item.name}>
            <div>
              <div className="landing-export-row__name">{item.name}</div>
              <div className="landing-export-row__desc">{item.desc}</div>
            </div>
            <span className="landing-export-row__format">{item.format}</span>
            <span className={badgeClass[item.status]}>
              {badgeLabel[item.status]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
