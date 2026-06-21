"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SensorName } from "@/lib/types";
import {
  loadWorkspaceSession,
  saveSelectedTest,
  selectedSuggestion,
  type WorkspaceSession,
} from "@/lib/workspace-session";

const sensorLabels: Record<SensorName, string> = {
  rgb: "RGB",
  depth: "Depth",
  lidar: "LiDAR",
  collision: "Collision",
  pose: "Pose",
};

export default function TestSuggestions() {
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSession(loadWorkspaceSession());
    setLoaded(true);
  }, []);

  if (!loaded) {
    return (
      <div className="fc-page">
        <div className="fc-loading-card" aria-label="Loading generated tests">
          <i />
          <span>Loading generated tests…</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="fc-page">
        <div className="fc-empty-state">
          <span className="fc-kicker">Step 2 of 7 · Choose</span>
          <h1>No generated tests yet.</h1>
          <p>Describe a robot task first, then return here to choose a test.</p>
          <Link className="fc-button fc-button--primary" href="/app">
            Describe a task <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    );
  }

  const selected = selectedSuggestion(session);
  const isExact = session.response.mode === "exact_failure";

  function selectTest(testId: string) {
    const next = saveSelectedTest(testId);
    if (next) setSession(next);
  }

  return (
    <div className="fc-page fc-page--suggestions">
      <div className="fc-suggestions-header">
        <div className="fc-page__intro">
          <span className="fc-kicker">Step 2 of 7 · Choose</span>
          <h1>{isExact ? "Your failure test is ready." : "Choose an edge case."}</h1>
          <p>
            {isExact
              ? "Review the executable test generated from your exact failure case."
              : "Each option is a complete scenario with sensors, evaluation logic, and export settings."}
          </p>
        </div>
        <Link className="fc-text-link" href="/app">
          ← Refine task
        </Link>
      </div>

      <div className="fc-source-task">
        <span>Source task</span>
        <p>{session.response.source_task}</p>
        <small>
          {session.response.generator === "anthropic"
            ? "Suggestions generated with Claude · scenarios normalized by FailureCloud"
            : "Deterministic scenario templates · available offline"}
        </small>
      </div>

      <div className="fc-test-grid">
        {session.response.suggestions.map((suggestion, index) => {
          const active = suggestion.test_id === session.selectedTestId;
          return (
            <article
              className={`fc-test-card${active ? " is-selected" : ""}`}
              key={suggestion.test_id}
            >
              <div className="fc-test-card__topline">
                <span className="fc-test-card__number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className={`fc-difficulty fc-difficulty--${suggestion.difficulty}`}
                >
                  {suggestion.difficulty}
                </span>
              </div>

              <div className="fc-test-card__copy">
                <h2>{suggestion.title}</h2>
                <p>{suggestion.summary}</p>
              </div>

              <dl className="fc-test-card__metrics">
                <div>
                  <dt>Friction</dt>
                  <dd>
                    {suggestion.scenario.environment.physics.floor_friction.toFixed(
                      2,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Robot speed</dt>
                  <dd>{suggestion.scenario.robot.speed_mps.toFixed(2)} m/s</dd>
                </div>
                <div>
                  <dt>Sensors</dt>
                  <dd>{suggestion.sensors.length}</dd>
                </div>
              </dl>

              <div className="fc-test-card__section">
                <span>Success</span>
                <p>{suggestion.success_criteria}</p>
              </div>

              <div className="fc-test-card__section">
                <span>Failure risks</span>
                <div className="fc-risk-list">
                  {suggestion.failure_risks.map((risk) => (
                    <i key={risk}>{risk}</i>
                  ))}
                </div>
              </div>

              <div className="fc-test-card__footer">
                <div aria-label="Configured sensors">
                  {suggestion.sensors.map((sensor) => (
                    <span key={sensor}>{sensorLabels[sensor]}</span>
                  ))}
                </div>
                <button
                  aria-label={`Select ${suggestion.title}`}
                  className={
                    active
                      ? "fc-button fc-button--selected"
                      : "fc-button fc-button--secondary"
                  }
                  onClick={() => selectTest(suggestion.test_id)}
                  type="button"
                >
                  {active ? "Selected ✓" : "Select test"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {selected ? (
        <div className="fc-selection-bar" role="status">
          <div>
            <span>Selected test</span>
            <strong>{selected.title}</strong>
          </div>
          <p>Selection saved as a canonical ScenarioV0_1.</p>
          <Link
            className="fc-button fc-button--light"
            href={`/app/tests/${encodeURIComponent(selected.test_id)}/edit`}
          >
            Edit scenario <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : (
        <div className="fc-selection-hint">
          Select one test to carry its canonical scenario into the editor.
        </div>
      )}
    </div>
  );
}
