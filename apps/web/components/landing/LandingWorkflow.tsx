const steps = [
  {
    num: "01",
    label: "Describe",
    desc: "Enter a normal robot task or exact failure case.",
  },
  {
    num: "02",
    label: "Choose",
    desc: "Pick from five generated edge-case tests.",
  },
  {
    num: "03",
    label: "Edit",
    desc: "Adjust hazards, sensors, and success criteria.",
  },
  {
    num: "04",
    label: "Preview",
    desc: "Inspect scene layout, sensors, and pass/fail logic.",
  },
  {
    num: "05",
    label: "Run",
    desc: "Execute PyBullet simulation with sensor recording.",
  },
  {
    num: "06",
    label: "Results",
    desc: "Review playback, metrics, and failure evidence.",
  },
  {
    num: "07",
    label: "Export",
    desc: "Download bundles for PyBullet, ROS, OpenPCDet, and more.",
  },
] as const;

export default function LandingWorkflow() {
  return (
    <section className="landing-section" id="workflow">
      <div className="landing-section__header">
        <span className="landing-section__label">Workflow</span>
        <h2>Seven steps from task to test bundle.</h2>
        <p>
          Describe what the robot should do. FailureCloud generates the
          dangerous edge cases, runs the simulation, and packages everything for
          export.
        </p>
      </div>
      <div className="landing-workflow">
        {steps.map((step) => (
          <article className="landing-workflow__step" key={step.num}>
            <span className="landing-workflow__step-num">{step.num}</span>
            <strong className="landing-workflow__step-label">{step.label}</strong>
            <p className="landing-workflow__step-desc">{step.desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
