const examples = [
  "A warehouse robot carries a cup of water across the floor.",
  "A mobile robot navigates a narrow aisle around workers.",
  "A delivery cart moves fragile items through a loading bay.",
];

export default function WorkspaceFoundation() {
  return (
    <div className="fc-page">
      <div className="fc-page__intro">
        <span className="fc-kicker">Step 1 of 7 · Describe</span>
        <h1>What robot task do you want to test?</h1>
        <p>
          Start with a normal task and FailureCloud will surface the dangerous
          edge cases worth simulating.
        </p>
      </div>

      <div className="fc-page__grid">
        <section className="fc-surface fc-surface--primary">
          <div className="fc-segmented" aria-label="Input mode">
            <button className="fc-segmented__item is-active" type="button">
              Generate edge cases
            </button>
            <button className="fc-segmented__item" type="button">
              Build an exact failure
            </button>
          </div>

          <label className="fc-field" htmlFor="foundation-task">
            <span className="fc-field__label">Robot task</span>
            <textarea
              id="foundation-task"
              placeholder="Describe what the robot needs to do…"
              defaultValue="A warehouse robot carries a cup of water across the floor."
            />
            <span className="fc-field__hint">
              Describe the goal in plain language. We will generate the hazards,
              sensors, and evaluation logic.
            </span>
          </label>

          <div className="fc-example-list">
            <span>Try an example</span>
            {examples.map((example) => (
              <button key={example} type="button">
                {example}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>

          <button className="fc-disclosure" type="button">
            <span>
              <i aria-hidden="true">＋</i>
              Advanced options
            </span>
            <span>Mobile robot · Warehouse · 5 sensors</span>
          </button>

          <div className="fc-form-actions">
            <span>
              <i className="fc-status-dot" aria-hidden="true" />
              Ready to generate
            </span>
            <button className="fc-button fc-button--primary" type="button">
              Generate robot tests
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <aside className="fc-surface fc-outcome-card">
          <span className="fc-badge">What you will get</span>
          <h2>Executable tests, not just scenes.</h2>
          <p>
            Every suggestion is a complete robot test case with everything
            needed to preview, run, evaluate, and export it.
          </p>
          <ul>
            <li>
              <span>01</span>
              <div>
                <strong>Edge-case scenarios</strong>
                <p>Five focused failure modes generated from your task.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Evaluation logic</strong>
                <p>Editable success criteria, rewards, and failure rules.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Simulation evidence</strong>
                <p>RGB, depth, LiDAR, labels, telemetry, and exports.</p>
              </div>
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
