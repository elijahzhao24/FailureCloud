"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { apiFetch } from "@/lib/api";
import type {
  ExportName,
  SensorName,
  TestGenerationRequest,
  TestGenerationResponse,
} from "@/lib/types";
import { saveGeneratedTests } from "@/lib/workspace-session";

const examples = [
  "A warehouse robot carries a cup of water across the floor.",
  "A mobile robot navigates a narrow aisle around workers.",
  "A delivery cart moves fragile items through a loading bay.",
];

const sensorOptions: Array<{ value: SensorName; label: string }> = [
  { value: "rgb", label: "RGB" },
  { value: "depth", label: "Depth" },
  { value: "lidar", label: "LiDAR" },
  { value: "collision", label: "Collision" },
  { value: "pose", label: "Pose" },
];

const exportOptions: Array<{ value: ExportName; label: string }> = [
  { value: "pybullet", label: "PyBullet" },
  { value: "ros2_folder", label: "ROS-style" },
  { value: "openpcdet", label: "OpenPCDet" },
  { value: "isaac", label: "Isaac" },
  { value: "nebius", label: "Nebius" },
];

const initialRequest: TestGenerationRequest = {
  task: "A warehouse robot carries a cup of water across the floor.",
  mode: "normal_task",
  robot_type: "mobile_base",
  environment: "warehouse",
  sensors: ["rgb", "depth", "lidar", "collision", "pose"],
  export_targets: [
    "pybullet",
    "ros2_folder",
    "openpcdet",
    "isaac",
    "nebius",
  ],
};

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export default function WorkspaceFoundation() {
  const router = useRouter();
  const [request, setRequest] = useState<TestGenerationRequest>(() => ({
    ...initialRequest,
    sensors: [...initialRequest.sensors],
    export_targets: [...initialRequest.export_targets],
  }));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exactMode = request.mode === "exact_failure";
  const ready =
    request.task.trim().length >= 8 &&
    request.sensors.length > 0 &&
    request.export_targets.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending) return;

    setPending(true);
    setError(null);
    const payload = { ...request, task: request.task.trim() };

    try {
      const response = await apiFetch<TestGenerationResponse>(
        "/v1/tests/generate",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      saveGeneratedTests(payload, response);
      router.push("/app/tests");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Robot test generation failed. Check the API and try again.",
      );
      setPending(false);
    }
  }

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
        <form
          className="fc-surface fc-surface--primary"
          onSubmit={handleSubmit}
        >
          <div className="fc-segmented" aria-label="Input mode">
            <button
              aria-pressed={!exactMode}
              className={`fc-segmented__item${!exactMode ? " is-active" : ""}`}
              onClick={() =>
                setRequest((current) => ({
                  ...current,
                  mode: "normal_task",
                }))
              }
              type="button"
            >
              Generate edge cases
            </button>
            <button
              aria-pressed={exactMode}
              className={`fc-segmented__item${exactMode ? " is-active" : ""}`}
              onClick={() =>
                setRequest((current) => ({
                  ...current,
                  mode: "exact_failure",
                }))
              }
              type="button"
            >
              Build an exact failure
            </button>
          </div>

          <label className="fc-field" htmlFor="foundation-task">
            <span className="fc-field__label">
              {exactMode ? "Failure case" : "Robot task"}
            </span>
            <textarea
              id="foundation-task"
              onChange={(event) =>
                setRequest((current) => ({
                  ...current,
                  task: event.target.value,
                }))
              }
              placeholder={
                exactMode
                  ? "Describe the exact hazard and failure you want to reproduce…"
                  : "Describe what the robot needs to do…"
              }
              value={request.task}
            />
            <span className="fc-field__hint">
              {exactMode
                ? "We will preserve the requested hazard and build one directly executable test."
                : "Describe the goal in plain language. We will generate the hazards, sensors, and evaluation logic."}
            </span>
          </label>

          <div className="fc-example-list">
            <span>Try an example</span>
            {examples.map((example) => (
              <button
                key={example}
                onClick={() =>
                  setRequest((current) => ({ ...current, task: example }))
                }
                type="button"
              >
                {example}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>

          <button
            aria-expanded={advancedOpen}
            className="fc-disclosure"
            onClick={() => setAdvancedOpen((open) => !open)}
            type="button"
          >
            <span>
              <i aria-hidden="true">{advancedOpen ? "−" : "＋"}</i>
              Advanced options
            </span>
            <span>
              Mobile robot · Warehouse · {request.sensors.length} sensors
            </span>
          </button>

          {advancedOpen ? (
            <div className="fc-advanced">
              <div className="fc-advanced__fixed">
                <label>
                  <span>Robot type</span>
                  <select aria-label="Robot type" disabled value="mobile_base">
                    <option value="mobile_base">Mobile robot</option>
                  </select>
                  <small>More robot types are coming later.</small>
                </label>
                <label>
                  <span>Environment</span>
                  <select aria-label="Environment" disabled value="warehouse">
                    <option value="warehouse">Warehouse</option>
                  </select>
                  <small>Current simulation domain.</small>
                </label>
              </div>

              <fieldset>
                <legend>Sensors</legend>
                <div className="fc-option-grid">
                  {sensorOptions.map((option) => (
                    <label key={option.value}>
                      <input
                        checked={request.sensors.includes(option.value)}
                        onChange={() =>
                          setRequest((current) => ({
                            ...current,
                            sensors: toggleValue(
                              current.sensors,
                              option.value,
                            ),
                          }))
                        }
                        type="checkbox"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>Export targets</legend>
                <div className="fc-option-grid">
                  {exportOptions.map((option) => (
                    <label key={option.value}>
                      <input
                        checked={request.export_targets.includes(option.value)}
                        onChange={() =>
                          setRequest((current) => ({
                            ...current,
                            export_targets: toggleValue(
                              current.export_targets,
                              option.value,
                            ),
                          }))
                        }
                        type="checkbox"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}

          {error ? (
            <div className="fc-form-error" role="alert">
              <strong>Could not generate tests.</strong>
              <span>{error}</span>
            </div>
          ) : null}

          <div className="fc-form-actions">
            <span>
              <i
                className={`fc-status-dot${error ? " is-error" : ""}`}
                aria-hidden="true"
              />
              {pending
                ? "Generating executable tests…"
                : ready
                  ? "Ready to generate"
                  : "Add a task, sensor, and export"}
            </span>
            <button
              className="fc-button fc-button--primary"
              disabled={!ready || pending}
              type="submit"
            >
              {pending
                ? "Generating…"
                : exactMode
                  ? "Build failure test"
                  : "Generate robot tests"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>

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
