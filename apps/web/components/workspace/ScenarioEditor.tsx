"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type {
  RobotTestSuggestion,
  Scenario,
  ScenarioValidationResponse,
  ScenarioVariantResponse,
  ValidationReport,
} from "@/lib/types";
import {
  loadWorkspaceSession,
  saveSelectedTest,
  updateSuggestionScenario,
} from "@/lib/workspace-session";

type EditorTab = "controls" | "json";
type MutateScenario = (draft: Scenario) => void;

function prettyJson(scenario: Scenario): string {
  return JSON.stringify(scenario, null, 2);
}

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ScenarioEditor() {
  const params = useParams<{ id: string }>();
  const testId = decodeURIComponent(params.id);
  const [suggestion, setSuggestion] = useState<RobotTestSuggestion | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<EditorTab>("controls");
  const [jsonText, setJsonText] = useState("");
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [variantChanges, setVariantChanges] = useState<string[]>([]);
  const [variantPending, setVariantPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const session = loadWorkspaceSession();
    const found = session?.response.suggestions.find(
      (item) => item.test_id === testId,
    );
    if (found) {
      saveSelectedTest(testId);
      setSuggestion(found);
      setJsonText(prettyJson(found.scenario));
      setValidation({ valid: true, normalized: true, issues: [] });
    }
    setLoaded(true);
  }, [testId]);

  function persistScenario(next: Scenario) {
    const updated = updateSuggestionScenario(testId, next);
    if (!updated) return;
    setSuggestion(updated);
    setJsonText(prettyJson(next));
    setValidation({ valid: true, normalized: true, issues: [] });
    setJsonError(null);
    setSavedAt(
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date()),
    );
  }

  function mutateScenario(mutate: MutateScenario) {
    if (!suggestion) return;
    const next = structuredClone(suggestion.scenario);
    mutate(next);
    persistScenario(next);
    setVariantChanges([]);
  }

  async function applyJson() {
    setJsonError(null);
    let payload: unknown;
    try {
      payload = JSON.parse(jsonText);
    } catch (error) {
      setJsonError(
        error instanceof Error ? error.message : "The JSON could not be parsed.",
      );
      return;
    }

    try {
      const result = await apiFetch<ScenarioValidationResponse>(
        "/v1/scenarios/validate",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      setValidation(result.validation_report);
      if (result.scenario && result.validation_report.valid) {
        persistScenario(result.scenario);
      }
    } catch (error) {
      setJsonError(
        error instanceof Error ? error.message : "Scenario validation failed.",
      );
    }
  }

  async function generateHarderVariant() {
    if (!suggestion || variantPending) return;
    setVariantPending(true);
    setJsonError(null);
    try {
      const result = await apiFetch<ScenarioVariantResponse>(
        "/v1/scenarios/variant",
        {
          method: "POST",
          body: JSON.stringify({
            scenario: suggestion.scenario,
            strategy: "harder",
          }),
        },
      );
      persistScenario(result.scenario);
      setValidation(result.validation_report);
      setVariantChanges(result.changes);
      setTab("controls");
    } catch (error) {
      setJsonError(
        error instanceof Error
          ? error.message
          : "The harder variant could not be generated.",
      );
    } finally {
      setVariantPending(false);
    }
  }

  if (!loaded) {
    return (
      <div className="fc-page">
        <div className="fc-loading-card" aria-label="Loading scenario editor">
          <i />
          <span>Loading canonical scenario…</span>
        </div>
      </div>
    );
  }

  if (!suggestion) {
    return (
      <div className="fc-page">
        <div className="fc-empty-state">
          <span className="fc-kicker">Step 3 of 7 · Edit</span>
          <h1>Scenario not found.</h1>
          <p>Choose a generated robot test before opening the editor.</p>
          <Link className="fc-button fc-button--primary" href="/app/tests">
            Choose a test <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    );
  }

  const scenario = suggestion.scenario;
  const obstacle = scenario.objects.find((item) => item.class === "obstacle");
  const cup = scenario.objects.find((item) => item.class === "cup");
  const actor = scenario.dynamic_actors[0];
  const enabledSensors = [
    scenario.sensors.rgb_camera.enabled ? "RGB" : null,
    scenario.sensors.depth_camera.enabled ? "Depth" : null,
    scenario.sensors.lidar.enabled ? "LiDAR" : null,
    "Collision",
    "Pose",
  ].filter(Boolean);

  return (
    <div className="fc-page fc-page--editor">
      <div className="fc-editor-header">
        <div className="fc-page__intro">
          <span className="fc-kicker">Step 3 of 7 · Edit</span>
          <h1>{suggestion.title}</h1>
          <p>
            Tune the executable scenario without losing the schema used by the
            simulator, preview, and exports.
          </p>
        </div>
        <div className="fc-editor-header__actions">
          <Link className="fc-text-link" href="/app/tests">
            ← Choose another test
          </Link>
          <button
            className="fc-button fc-button--secondary"
            disabled={variantPending}
            onClick={generateHarderVariant}
            type="button"
          >
            {variantPending ? "Generating…" : "Generate harder variant"}
          </button>
        </div>
      </div>

      {variantChanges.length > 0 ? (
        <div className="fc-variant-notice" role="status">
          <div>
            <span className="fc-badge">Harder variant applied</span>
            <strong>The scenario constraints were tightened.</strong>
          </div>
          <ul>
            {variantChanges.slice(0, 4).map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          <button onClick={() => setVariantChanges([])} type="button">
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="fc-editor-tabs" role="tablist" aria-label="Editor view">
        <button
          aria-selected={tab === "controls"}
          className={tab === "controls" ? "is-active" : ""}
          onClick={() => setTab("controls")}
          role="tab"
          type="button"
        >
          Scenario controls
        </button>
        <button
          aria-selected={tab === "json"}
          className={tab === "json" ? "is-active" : ""}
          onClick={() => {
            setJsonText(prettyJson(scenario));
            setTab("json");
          }}
          role="tab"
          type="button"
        >
          JSON
        </button>
        <span>
          <i className="fc-status-dot" />
          {savedAt ? `Saved locally at ${savedAt}` : "Canonical schema valid"}
        </span>
      </div>

      {tab === "controls" ? (
        <div className="fc-editor-layout">
          <div className="fc-editor-sections">
            <section className="fc-editor-section">
              <div className="fc-editor-section__heading">
                <span>01</span>
                <div>
                  <h2>Environment</h2>
                  <p>Physical conditions used by PyBullet.</p>
                </div>
              </div>
              <div className="fc-editor-fields fc-editor-fields--three">
                <label className="fc-control">
                  <span>Environment</span>
                  <select disabled value={scenario.environment.type}>
                    <option value="warehouse">Warehouse</option>
                  </select>
                  <small>Current supported domain</small>
                </label>
                <label className="fc-control">
                  <span>Lighting</span>
                  <select
                    onChange={(event) =>
                      mutateScenario((draft) => {
                        draft.environment.lighting = event.target.value;
                      })
                    }
                    value={scenario.environment.lighting}
                  >
                    <option value="warehouse_day">Warehouse daylight</option>
                    <option value="industrial_night">Industrial night</option>
                    <option value="low_light_reflective">
                      Low light + reflective
                    </option>
                  </select>
                </label>
                <label className="fc-control fc-control--range">
                  <span>
                    Floor friction <output>{scenario.environment.physics.floor_friction.toFixed(2)}</output>
                  </span>
                  <input
                    aria-label="Floor friction"
                    max="1"
                    min="0.02"
                    onChange={(event) =>
                      mutateScenario((draft) => {
                        draft.environment.physics.floor_friction = numberValue(
                          event.target.value,
                        );
                      })
                    }
                    step="0.01"
                    type="range"
                    value={scenario.environment.physics.floor_friction}
                  />
                  <small>Lower values produce less traction</small>
                </label>
              </div>
            </section>

            <section className="fc-editor-section">
              <div className="fc-editor-section__heading">
                <span>02</span>
                <div>
                  <h2>Robot and route</h2>
                  <p>Motion settings and task endpoints.</p>
                </div>
              </div>
              <div className="fc-editor-fields fc-editor-fields--three">
                <label className="fc-control fc-control--range">
                  <span>
                    Robot speed <output>{scenario.robot.speed_mps.toFixed(2)} m/s</output>
                  </span>
                  <input
                    aria-label="Robot speed"
                    max="3"
                    min="0.1"
                    onChange={(event) =>
                      mutateScenario((draft) => {
                        draft.robot.speed_mps = numberValue(event.target.value);
                      })
                    }
                    step="0.05"
                    type="range"
                    value={scenario.robot.speed_mps}
                  />
                  <small>Commanded route speed</small>
                </label>
                <label className="fc-control">
                  <span>Start position</span>
                  <div className="fc-coordinate">
                    <input
                      aria-label="Start X"
                      onChange={(event) =>
                        mutateScenario((draft) => {
                          draft.robot.start_pose.position.x = numberValue(
                            event.target.value,
                          );
                        })
                      }
                      step="0.1"
                      type="number"
                      value={scenario.robot.start_pose.position.x}
                    />
                    <input
                      aria-label="Start Y"
                      onChange={(event) =>
                        mutateScenario((draft) => {
                          draft.robot.start_pose.position.y = numberValue(
                            event.target.value,
                          );
                        })
                      }
                      step="0.1"
                      type="number"
                      value={scenario.robot.start_pose.position.y}
                    />
                  </div>
                  <small>X / Y coordinates in meters</small>
                </label>
                <label className="fc-control">
                  <span>Goal position</span>
                  <div className="fc-coordinate">
                    <input
                      aria-label="Goal X"
                      onChange={(event) =>
                        mutateScenario((draft) => {
                          draft.robot.goal_pose.position.x = numberValue(
                            event.target.value,
                          );
                        })
                      }
                      step="0.1"
                      type="number"
                      value={scenario.robot.goal_pose.position.x}
                    />
                    <input
                      aria-label="Goal Y"
                      onChange={(event) =>
                        mutateScenario((draft) => {
                          draft.robot.goal_pose.position.y = numberValue(
                            event.target.value,
                          );
                        })
                      }
                      step="0.1"
                      type="number"
                      value={scenario.robot.goal_pose.position.y}
                    />
                  </div>
                  <small>X / Y coordinates in meters</small>
                </label>
              </div>
            </section>

            <section className="fc-editor-section">
              <div className="fc-editor-section__heading">
                <span>03</span>
                <div>
                  <h2>Hazards and actors</h2>
                  <p>Objects that create the edge case.</p>
                </div>
              </div>
              <div className="fc-object-list">
                {cup ? (
                  <div className="fc-object-row">
                    <i className="fc-object-icon fc-object-icon--cup" />
                    <div>
                      <strong>Cup of water</strong>
                      <span>Payload · {String(cup.properties.initial_water_percent ?? 100)}% initial fill</span>
                    </div>
                    <small>Attached to robot</small>
                  </div>
                ) : null}
                {obstacle ? (
                  <div className="fc-object-row">
                    <i className="fc-object-icon fc-object-icon--box" />
                    <div>
                      <strong>Dropped box obstacle</strong>
                      <span>Static collision object</span>
                    </div>
                    <label>
                      X
                      <input
                        aria-label="Obstacle X"
                        onChange={(event) =>
                          mutateScenario((draft) => {
                            const item = draft.objects.find(
                              (candidate) => candidate.id === obstacle.id,
                            );
                            if (item) {
                              item.pose.position.x = numberValue(
                                event.target.value,
                              );
                            }
                          })
                        }
                        step="0.05"
                        type="number"
                        value={obstacle.pose.position.x}
                      />
                    </label>
                    <label>
                      Y
                      <input
                        aria-label="Obstacle Y"
                        onChange={(event) =>
                          mutateScenario((draft) => {
                            const item = draft.objects.find(
                              (candidate) => candidate.id === obstacle.id,
                            );
                            if (item) {
                              item.pose.position.y = numberValue(
                                event.target.value,
                              );
                            }
                          })
                        }
                        step="0.05"
                        type="number"
                        value={obstacle.pose.position.y}
                      />
                    </label>
                  </div>
                ) : null}
                {actor ? (
                  <div className="fc-object-row">
                    <i className="fc-object-icon fc-object-icon--actor" />
                    <div>
                      <strong>Crossing worker</strong>
                      <span>Dynamic actor · {actor.trajectory.length}-point path</span>
                    </div>
                    <label className="fc-object-row__speed">
                      Speed
                      <input
                        aria-label="Actor speed"
                        max="3"
                        min="0.1"
                        onChange={(event) =>
                          mutateScenario((draft) => {
                            draft.dynamic_actors[0].speed_mps = numberValue(
                              event.target.value,
                            );
                          })
                        }
                        step="0.05"
                        type="number"
                        value={actor.speed_mps}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="fc-object-row fc-object-row--muted">
                    <i className="fc-object-icon fc-object-icon--actor" />
                    <div>
                      <strong>No dynamic actor</strong>
                      <span>This test isolates static hazards.</span>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="fc-editor-section">
              <div className="fc-editor-section__heading">
                <span>04</span>
                <div>
                  <h2>Sensor setup</h2>
                  <p>Evidence recorded during the simulation.</p>
                </div>
              </div>
              <div className="fc-sensor-editor">
                {(
                  [
                    ["RGB camera", "rgb_camera"],
                    ["Depth camera", "depth_camera"],
                  ] as const
                ).map(([label, key]) => (
                  <label key={key}>
                    <input
                      checked={scenario.sensors[key].enabled}
                      onChange={(event) =>
                        mutateScenario((draft) => {
                          draft.sensors[key].enabled = event.target.checked;
                        })
                      }
                      type="checkbox"
                    />
                    <span>
                      <strong>{label}</strong>
                      <small>
                        {scenario.sensors[key].width} × {scenario.sensors[key].height} · {scenario.sensors[key].fov_deg}° FOV
                      </small>
                    </span>
                    <i />
                  </label>
                ))}
                <label>
                  <input
                    checked={scenario.sensors.lidar.enabled}
                    onChange={(event) =>
                      mutateScenario((draft) => {
                        draft.sensors.lidar.enabled = event.target.checked;
                      })
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong>LiDAR</strong>
                    <small>
                      {scenario.sensors.lidar.num_rays} rays · {scenario.sensors.lidar.range_m}m range
                    </small>
                  </span>
                  <i />
                </label>
                <div>
                  <span>
                    <strong>Collision + pose</strong>
                    <small>Required evaluation telemetry</small>
                  </span>
                  <em>Always on</em>
                </div>
              </div>
            </section>

            <section className="fc-editor-section">
              <div className="fc-editor-section__heading">
                <span>05</span>
                <div>
                  <h2>Success and termination</h2>
                  <p>Rules that determine the final verdict.</p>
                </div>
              </div>
              <div className="fc-editor-fields fc-editor-fields--three">
                <label className="fc-control fc-control--range">
                  <span>
                    Minimum water <output>{scenario.task.success.min_water_left_percent.toFixed(0)}%</output>
                  </span>
                  <input
                    aria-label="Minimum water remaining"
                    max="100"
                    min="0"
                    onChange={(event) =>
                      mutateScenario((draft) => {
                        draft.task.success.min_water_left_percent = numberValue(
                          event.target.value,
                        );
                      })
                    }
                    step="1"
                    type="range"
                    value={scenario.task.success.min_water_left_percent}
                  />
                </label>
                <label className="fc-control">
                  <span>Maximum collisions</span>
                  <select
                    aria-label="Maximum collisions"
                    onChange={(event) =>
                      mutateScenario((draft) => {
                        draft.task.success.max_collisions = numberValue(
                          event.target.value,
                        );
                      })
                    }
                    value={scenario.task.success.max_collisions}
                  >
                    {[0, 1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="fc-control fc-control--range">
                  <span>
                    Timeout <output>{scenario.task.termination.timeout_s.toFixed(0)}s</output>
                  </span>
                  <input
                    aria-label="Timeout"
                    max="60"
                    min="1"
                    onChange={(event) =>
                      mutateScenario((draft) => {
                        draft.task.termination.timeout_s = numberValue(
                          event.target.value,
                        );
                      })
                    }
                    step="1"
                    type="range"
                    value={scenario.task.termination.timeout_s}
                  />
                </label>
              </div>
              <div className="fc-pass-rule">
                <span>PASS IF</span>
                <code>
                  goal_reached AND water ≥ {scenario.task.success.min_water_left_percent.toFixed(0)}% AND collisions ≤ {scenario.task.success.max_collisions} AND time ≤ {scenario.task.termination.timeout_s.toFixed(0)}s
                </code>
              </div>
            </section>

            <section className="fc-editor-section">
              <div className="fc-editor-section__heading">
                <span>06</span>
                <div>
                  <h2>Reward function</h2>
                  <p>Signals used to explain and score the run.</p>
                </div>
              </div>
              <div className="fc-reward-grid">
                {(
                  [
                    ["Goal progress", "goal_progress", "Per meter"],
                    ["Collision penalty", "collision_penalty", "Per collision"],
                    ["Spill penalty", "spill_penalty", "Per % lost"],
                    ["Success bonus", "success_bonus", "On pass"],
                  ] as const
                ).map(([label, key, hint]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      aria-label={label}
                      onChange={(event) =>
                        mutateScenario((draft) => {
                          draft.task.reward[key] = numberValue(event.target.value);
                        })
                      }
                      step="0.01"
                      type="number"
                      value={scenario.task.reward[key]}
                    />
                    <small>{hint}</small>
                  </label>
                ))}
              </div>
            </section>
          </div>

          <aside className="fc-editor-summary">
            <div>
              <span className="fc-badge">ScenarioV0_1</span>
              <h2>Executable contract</h2>
              <p>
                These values are saved directly to the scenario used by every
                downstream stage.
              </p>
            </div>
            <dl>
              <div>
                <dt>Schema</dt>
                <dd>{scenario.schema_version}</dd>
              </div>
              <div>
                <dt>Objects</dt>
                <dd>{scenario.objects.length}</dd>
              </div>
              <div>
                <dt>Actors</dt>
                <dd>{scenario.dynamic_actors.length}</dd>
              </div>
              <div>
                <dt>Sensors</dt>
                <dd>{enabledSensors.length}</dd>
              </div>
            </dl>
            <div className="fc-editor-summary__sensors">
              <span>Recorded evidence</span>
              <p>{enabledSensors.join(" · ")}</p>
            </div>
            <div className="fc-editor-summary__status">
              <i className="fc-status-dot" />
              <span>
                <strong>Schema valid</strong>
                <small>Changes persist in this browser</small>
              </span>
            </div>
          </aside>
        </div>
      ) : (
        <section className="fc-json-editor">
          <div className="fc-json-editor__header">
            <div>
              <h2>Canonical scenario JSON</h2>
              <p>
                Advanced edits are validated by the backend before replacing
                the scenario.
              </p>
            </div>
            <span>{scenario.scenario_id}</span>
          </div>
          <textarea
            aria-label="Scenario JSON"
            onChange={(event) => setJsonText(event.target.value)}
            spellCheck={false}
            value={jsonText}
          />
          {jsonError ? (
            <div className="fc-json-message fc-json-message--error" role="alert">
              <strong>Invalid JSON</strong>
              <span>{jsonError}</span>
            </div>
          ) : null}
          {validation && validation.issues.length > 0 ? (
            <div
              className={`fc-json-message${validation.valid ? "" : " fc-json-message--error"}`}
            >
              {validation.issues.map((issue) => (
                <span key={`${issue.path}-${issue.message}`}>
                  <code>{issue.path}</code> {issue.message}
                </span>
              ))}
            </div>
          ) : null}
          <div className="fc-json-editor__actions">
            <span>
              Backend validation prevents unsupported fields and invalid ranges.
            </span>
            <button
              className="fc-button fc-button--primary"
              onClick={applyJson}
              type="button"
            >
              Apply and validate JSON
            </button>
          </div>
        </section>
      )}

      <div className="fc-editor-footer">
        <div>
          <span className="fc-kicker">Next stage</span>
          <strong>Inspect the test before running physics.</strong>
          <p>The schematic Three.js preview is the next checkpoint.</p>
        </div>
        <button className="fc-button fc-button--secondary" disabled type="button">
          Preview scene · next
        </button>
        <button className="fc-button fc-button--primary" disabled type="button">
          Run simulation
        </button>
      </div>
    </div>
  );
}
