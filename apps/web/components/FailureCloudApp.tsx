"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { API_URL, apiAsset, apiFetch, fetcher } from "@/lib/api";
import type {
  CompileResponse,
  RunManifest,
  Scenario,
  SweepSummary,
  SweepVariant,
  VisualPreviewStatus,
} from "@/lib/types";

const ScenePreview = dynamic(() => import("./ScenePreview"), {
  ssr: false,
  loading: () => <div className="scene-loading">INITIALIZING WORLD VIEW…</div>,
});

const DEFAULT_PROMPT =
  "Generate a warehouse robot test where a mobile robot must carry a cup of water across a slippery floor while avoiding a dropped box and a human crossing the aisle.";

const tabs = ["Scene", "RGB", "Depth", "LiDAR", "Labels", "Reward", "Cloud Sweep", "Export"] as const;
type Tab = (typeof tabs)[number];

function StatusDot({ active }: { active: boolean }) {
  return <span className={active ? "status-dot active" : "status-dot"} />;
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "warn" | "good";
}) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Heatmap({
  sweep,
  onSelect,
}: {
  sweep: SweepSummary;
  onSelect: (variant: SweepVariant) => void;
}) {
  const [xAxis, yAxis] = sweep.specification.axes;
  const map = useMemo(
    () =>
      new Map(
        sweep.results.map((result) => [
          `${result.parameters[xAxis.name]}:${result.parameters[yAxis.name]}`,
          result,
        ]),
      ),
    [sweep.results, xAxis.name, yAxis.name],
  );
  return (
    <div className="heatmap-shell">
      <div className="heatmap-y-label">{yAxis.name.replaceAll("_", " ")}</div>
      <div className="heatmap">
        <div className="heatmap-corner" />
        {xAxis.values.map((value) => (
          <div className="axis-label" key={`x-${value}`}>{value}</div>
        ))}
        {yAxis.values.map((y) => (
          <div className="heatmap-row" key={y}>
            <div className="axis-label">{y}</div>
            {xAxis.values.map((x) => {
              const variant = map.get(`${x}:${y}`);
              const water = variant?.water_left_percent ?? 0;
              return (
                <button
                  key={`${x}-${y}`}
                  className={`heat-cell ${variant?.success ? "pass" : "fail"}`}
                  style={{ "--water": water / 100 } as React.CSSProperties}
                  onClick={() => variant && onSelect(variant)}
                  title={variant?.failure_reason ?? "Passed"}
                >
                  <strong>{water.toFixed(0)}%</strong>
                  <span>{variant?.success ? "PASS" : "FAIL"}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="heatmap-x-label">{xAxis.name.replaceAll("_", " ")}</div>
    </div>
  );
}

export default function FailureCloudApp() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [draft, setDraft] = useState("");
  const [compiler, setCompiler] = useState<string>("");
  const [compileWarning, setCompileWarning] = useState<string>("");
  const [runId, setRunId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [sweepId, setSweepId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Scene");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<SweepVariant | null>(null);

  const { data: run } = useSWR<RunManifest>(
    runId ? `/v1/runs/${runId}` : null,
    fetcher,
    {
      refreshInterval: (data) =>
        data?.status === "completed" || data?.status === "failed" ? 0 : 650,
    },
  );
  const { data: preview } = useSWR<VisualPreviewStatus>(
    previewId ? `/v1/previews/reactor/${previewId}` : null,
    fetcher,
    {
      refreshInterval: (data) =>
        data?.status === "completed" || data?.status === "failed" ? 0 : 900,
    },
  );
  const { data: sweep } = useSWR<SweepSummary>(
    runId && sweepId ? `/v1/runs/${runId}/sweeps/${sweepId}` : null,
    fetcher,
    {
      refreshInterval: (data) =>
        data?.status === "completed" || data?.status === "failed" ? 0 : 750,
    },
  );

  const displayScenario = useMemo(() => {
    if (!scenario || !selectedVariant) return scenario;
    const clone = structuredClone(scenario);
    const parameters = selectedVariant.parameters;
    if (parameters.floor_friction !== undefined) {
      clone.environment.physics.floor_friction = parameters.floor_friction;
    }
    if (parameters.robot_speed !== undefined) {
      clone.robot.speed_mps = parameters.robot_speed;
    }
    return clone;
  }, [scenario, selectedVariant]);

  async function generateScenario() {
    setBusy("compile");
    setError(null);
    try {
      const response = await apiFetch<CompileResponse>("/v1/scenarios/compile", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
      setScenario(response.scenario);
      setDraft(JSON.stringify(response.scenario, null, 2));
      setCompiler(response.compiler);
      setCompileWarning(response.validation_report.issues.map((issue) => issue.message).join(" "));
      setRunId(null);
      setPreviewId(null);
      setSweepId(null);
      setSelectedVariant(null);
      setActiveTab("Scene");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scenario compilation failed");
    } finally {
      setBusy(null);
    }
  }

  async function applyDraft() {
    setBusy("validate");
    setError(null);
    try {
      const payload = JSON.parse(draft) as Scenario;
      const response = await apiFetch<{
        scenario: Scenario | null;
        validation_report: { valid: boolean; issues: Array<{ message: string }> };
      }>("/v1/scenarios/validate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!response.validation_report.valid || !response.scenario) {
        throw new Error(response.validation_report.issues.map((issue) => issue.message).join("; "));
      }
      setScenario(response.scenario);
      setDraft(JSON.stringify(response.scenario, null, 2));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invalid scenario JSON");
    } finally {
      setBusy(null);
    }
  }

  async function startPreview() {
    if (!scenario) return;
    setBusy("preview");
    setError(null);
    try {
      const response = await apiFetch<VisualPreviewStatus>("/v1/previews/reactor", {
        method: "POST",
        body: JSON.stringify({ scenario }),
      });
      setPreviewId(response.preview_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preview generation failed");
    } finally {
      setBusy(null);
    }
  }

  async function startRun() {
    if (!scenario) return;
    setBusy("run");
    setError(null);
    try {
      const response = await apiFetch<RunManifest>("/v1/runs", {
        method: "POST",
        body: JSON.stringify({ scenario }),
      });
      setRunId(response.run_id);
      setSweepId(null);
      setActiveTab("Scene");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Simulation failed to start");
    } finally {
      setBusy(null);
    }
  }

  async function startSweep() {
    if (!runId) return;
    setBusy("sweep");
    setError(null);
    try {
      const response = await apiFetch<SweepSummary>(`/v1/runs/${runId}/sweeps/nebius`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSweepId(response.sweep_id);
      setActiveTab("Cloud Sweep");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sweep failed to start");
    } finally {
      setBusy(null);
    }
  }

  async function buildBundle() {
    if (!runId) return;
    setBusy("export");
    setError(null);
    try {
      await apiFetch(`/v1/runs/${runId}/exports`, { method: "POST" });
      window.location.assign(`${API_URL}/v1/runs/${runId}/bundle`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  const telemetry = run?.latest_telemetry ?? {};
  const hasResults = run?.status === "completed";
  const imageUrl = run?.artifacts.last_rgb ? apiAsset(run.artifacts.last_rgb) : "";

  return (
    <main className="app-shell">
      <div className="noise" />
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>FAILURE<span>CLOUD</span></span>
        </a>
        <div className="mission">ROBOT TEST COMPILER <em>/</em> FC-LAB-01</div>
        <div className="system-state"><StatusDot active /> SYSTEM READY</div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">PHYSICAL AI / EDGE-CASE INFRASTRUCTURE</div>
          <h1>UNIT TESTS<br /><span>FOR ROBOTS.</span></h1>
        </div>
        <p>
          Describe the failure. Compile the world. Run the test. Inspect every sensor,
          label, and decision that pushed the machine past its limits.
        </p>
      </section>

      {error ? <div className="error-banner"><strong>PIPELINE ERROR</strong>{error}</div> : null}

      <section className="prompt-console">
        <div className="console-label">
          <span>01 / FAILURE CASE</span>
          <span>NATURAL LANGUAGE INPUT</span>
        </div>
        <div className="prompt-row">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            aria-label="Failure case prompt"
          />
          <button className="primary-action" onClick={generateScenario} disabled={Boolean(busy)}>
            <span>{busy === "compile" ? "COMPILING…" : "COMPILE TEST"}</span>
            <b>↗</b>
          </button>
        </div>
        <div className="prompt-meta">
          <span>EXAMPLE LOADED · WAREHOUSE / CARRY TASK / DYNAMIC HAZARD</span>
          <span>{prompt.length.toString().padStart(3, "0")} CHARS</span>
        </div>
      </section>

      {scenario && displayScenario ? (
        <>
          <section className="workbench">
            <div className="panel scenario-panel">
              <div className="panel-header">
                <div><span>02</span><strong>SCENARIO CONTRACT</strong></div>
                <div className="tag">{compiler.toUpperCase()}</div>
              </div>
              <div className="scenario-summary">
                <div>
                  <span>TEST ID</span>
                  <strong>{scenario.scenario_id}</strong>
                </div>
                <div>
                  <span>ENVIRONMENT</span>
                  <strong>{scenario.environment.type}</strong>
                </div>
                <div>
                  <span>HAZARD INDEX</span>
                  <strong>03</strong>
                </div>
                <div>
                  <span>SEED</span>
                  <strong>{scenario.seed}</strong>
                </div>
              </div>
              <textarea
                className="json-editor"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                spellCheck={false}
              />
              <div className="panel-footer">
                <span className="validation"><StatusDot active /> SCHEMA 0.1.0 VALID</span>
                <button className="text-action" onClick={applyDraft} disabled={Boolean(busy)}>
                  {busy === "validate" ? "VALIDATING…" : "APPLY JSON"}
                </button>
              </div>
              {compileWarning ? <p className="warning-note">{compileWarning}</p> : null}
            </div>

            <div className="panel scene-panel">
              <div className="panel-header">
                <div><span>03</span><strong>WORLD PREVIEW</strong></div>
                <div className="scene-tools"><span>ORBIT</span><span>SCROLL</span><span>DRAG</span></div>
              </div>
              <div className="scene-canvas">
                <ScenePreview scenario={displayScenario} running={run?.status === "running"} />
                <div className="scene-hud top-left">
                  <span>WORLD / WAREHOUSE_A</span>
                  <strong>μ {displayScenario.environment.physics.floor_friction.toFixed(2)}</strong>
                </div>
                <div className="scene-hud bottom-right">
                  <span>LIDAR</span>
                  <strong>{displayScenario.sensors.lidar.num_rays} RAYS</strong>
                </div>
                {selectedVariant ? (
                  <button className="variant-badge" onClick={() => setSelectedVariant(null)}>
                    VARIANT {selectedVariant.variant_id} · RESET
                  </button>
                ) : null}
              </div>
              <div className="scene-actions">
                <button className="secondary-action" onClick={startPreview} disabled={Boolean(busy)}>
                  <span className="provider-mark reactor">R</span>
                  {busy === "preview" ? "GENERATING…" : "REACTOR CINEMATIC"}
                </button>
                <button className="run-action" onClick={startRun} disabled={Boolean(busy)}>
                  <span>▶</span>{busy === "run" ? "STARTING…" : "RUN TEST"}
                </button>
              </div>
            </div>
          </section>

          {previewId ? (
            <section className="cinematic-strip">
              <div className="section-index">04</div>
              <div className="cinematic-copy">
                <span>ILLUSTRATIVE WORLD MODEL</span>
                <h2>REACTOR CINEMATIC</h2>
                <p>Visual communication layer only. PyBullet remains the physics and label authority.</p>
                <div className="provider-status">
                  <StatusDot active={preview?.status === "completed"} />
                  {(preview?.status ?? "queued").toUpperCase()} · {(preview?.provider ?? "reactor").replace("_", " ").toUpperCase()}
                </div>
              </div>
              <div className="cinematic-media">
                {preview?.media_url ? (
                  preview.media_url.endsWith(".mp4") ? (
                    <video controls autoPlay muted loop poster={apiAsset(preview.poster_url)}>
                      <source src={apiAsset(preview.media_url)} />
                    </video>
                  ) : (
                    <img src={apiAsset(preview.media_url)} alt="Illustrative generated warehouse scenario" />
                  )
                ) : (
                  <div className="generation-scan"><i /><span>WORLD MODEL PROCESSING</span></div>
                )}
                <span className="illustrative-label">ILLUSTRATIVE / NOT PHYSICS</span>
              </div>
            </section>
          ) : null}

          {runId ? (
            <section className="results-section">
              <div className="results-heading">
                <div>
                  <span>05 / EXECUTION</span>
                  <h2>TEST TELEMETRY</h2>
                </div>
                <div className={`result-seal ${run?.summary?.success ? "pass" : "fail"}`}>
                  {run?.status === "completed"
                    ? run.summary?.success ? "PASSED" : "FAILED"
                    : `${Math.round((run?.progress ?? 0) * 100)}%`}
                </div>
              </div>

              <div className="telemetry-grid">
                <Metric label="WATER LEFT" value={`${Number(telemetry.water_left_percent ?? 100).toFixed(1)}%`} tone={Number(telemetry.water_left_percent ?? 100) < 70 ? "warn" : "good"} />
                <Metric label="CUP TILT" value={`${Number(telemetry.cup_tilt_deg ?? 0).toFixed(1)}°`} tone={Number(telemetry.cup_tilt_deg ?? 0) > 20 ? "warn" : undefined} />
                <Metric label="COLLISIONS" value={Number(telemetry.collisions ?? 0)} tone={Number(telemetry.collisions ?? 0) > 0 ? "warn" : "good"} />
                <Metric label="DISTANCE" value={`${Number(telemetry.distance_to_goal_m ?? 5.4).toFixed(2)}m`} />
                <Metric label="REWARD" value={Number(telemetry.reward ?? 0).toFixed(2)} />
              </div>
              <div className="progress-track"><i style={{ width: `${(run?.progress ?? 0) * 100}%` }} /></div>

              <div className="result-tabs">
                {tabs.map((tab) => (
                  <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
                    {tab}
                  </button>
                ))}
              </div>

              <div className="result-content">
                {activeTab === "Scene" ? (
                  <div className="result-scene">
                    <ScenePreview scenario={displayScenario} running={run?.status === "running"} />
                  </div>
                ) : null}
                {activeTab === "RGB" ? (
                  <div className="sensor-view">
                    {imageUrl ? <img src={imageUrl} alt="Final PyBullet RGB sensor frame" /> : <div className="sensor-placeholder">CAPTURING RGB FRAMES…</div>}
                    <div className="sensor-caption">FRONT CAMERA · FINAL FRAME · RGB8</div>
                  </div>
                ) : null}
                {activeTab === "Depth" ? (
                  <div className="sensor-view depth-view">
                    {imageUrl ? <img src={imageUrl} alt="Depth sensor visualization" /> : <div className="sensor-placeholder">LINEARIZING DEPTH BUFFER…</div>}
                    <div className="depth-scale"><span>0.02M</span><i /><span>20M</span></div>
                    <div className="sensor-caption">METRIC FLOAT32 DEPTH AVAILABLE IN BUNDLE</div>
                  </div>
                ) : null}
                {activeTab === "LiDAR" ? (
                  <div className="lidar-view">
                    <div className="lidar-sweep"><i /><b /></div>
                    <div className="lidar-points">
                      {Array.from({ length: 75 }, (_, index) => (
                        <i key={index} style={{
                          left: `${8 + ((index * 47) % 86)}%`,
                          top: `${10 + ((index * 31) % 78)}%`,
                          opacity: 0.25 + ((index * 13) % 70) / 100,
                        }} />
                      ))}
                    </div>
                    <div className="sensor-caption">XYZI + SEMANTIC + INSTANCE · {scenario.sensors.lidar.num_rays} RAYS</div>
                  </div>
                ) : null}
                {activeTab === "Labels" ? (
                  <div className="label-table">
                    <div className="table-head"><span>INSTANCE</span><span>CLASS</span><span>TRACK</span><span>STATUS</span></div>
                    {[
                      ["robot_1", "mobile_base", "02", "ACTIVE"],
                      ["cup_1", "cup", "03", "TRACKED"],
                      ["box_1", "obstacle", "04", "STATIC"],
                      ["worker_1", "pedestrian", "05", "DYNAMIC"],
                    ].map((row) => (
                      <div className="table-row" key={row[0]}>{row.map((cell) => <span key={cell}>{cell}</span>)}</div>
                    ))}
                  </div>
                ) : null}
                {activeTab === "Reward" ? (
                  <div className="reward-view">
                    <div className="failure-card">
                      <span>{run?.summary?.failure_code ?? "EVALUATION IN PROGRESS"}</span>
                      <h3>{run?.summary?.success ? "TASK PASSED" : "WATER RETENTION FAILURE"}</h3>
                      <p>{run?.summary?.failure_reason ?? "The evaluator is calculating deterministic task metrics."}</p>
                    </div>
                    <div className="reward-bars">
                      <div><span>GOAL PROGRESS</span><i style={{ width: "100%" }} /><b>+1.00</b></div>
                      <div><span>SPILL PENALTY</span><i className="negative" style={{ width: `${Math.min(100, 100 - (run?.summary?.water_left_percent ?? 100))}%` }} /><b>{run?.summary ? (-(100 - run.summary.water_left_percent) * 0.08).toFixed(2) : "—"}</b></div>
                      <div><span>COLLISION</span><i className="negative" style={{ width: `${(run?.summary?.collisions ?? 0) * 25}%` }} /><b>{run?.summary?.collisions ?? 0}</b></div>
                    </div>
                  </div>
                ) : null}
                {activeTab === "Cloud Sweep" ? (
                  <div className="sweep-view">
                    {!sweepId ? (
                      <div className="sweep-intro">
                        <span className="provider-mark nebius">N</span>
                        <div>
                          <h3>MAP THE FAILURE ENVELOPE</h3>
                          <p>Evaluate friction × speed variants as one Nebius-compatible cloud job.</p>
                        </div>
                        <button onClick={startSweep} disabled={!hasResults || Boolean(busy)}>
                          {busy === "sweep" ? "SUBMITTING…" : "LAUNCH SWEEP"}
                        </button>
                      </div>
                    ) : sweep?.status === "completed" ? (
                      <>
                        <div className="sweep-stats">
                          <div><span>EXECUTOR</span><strong>{sweep.provider.replace("_", " ").toUpperCase()}</strong></div>
                          <div><span>VARIANTS</span><strong>{sweep.results.length}</strong></div>
                          <div><span>SUCCESS RATE</span><strong>{(sweep.success_rate * 100).toFixed(0)}%</strong></div>
                          <div><span>SELECTED</span><strong>{selectedVariant?.variant_id ?? "—"}</strong></div>
                        </div>
                        <Heatmap sweep={sweep} onSelect={setSelectedVariant} />
                      </>
                    ) : (
                      <div className="generation-scan sweep-scan"><i /><span>EXECUTING PARAMETER MATRIX…</span></div>
                    )}
                  </div>
                ) : null}
                {activeTab === "Export" ? (
                  <div className="export-view">
                    {[
                      ["OPENPCDET", ".NPY + LABELS", "TRAINABLE POINT CLOUD"],
                      ["ROS 2 FOLDER", "SENSOR CONTRACT", "REPLAY-READY FILES"],
                      ["PYBULLET", "SCENARIO + RUNNER", "LOCAL REPRODUCTION"],
                      ["ISAAC", "SCENE CONFIG", "FUTURE USD COMPILE"],
                      ["NEBIUS", "JOB MANIFEST", "CLOUD EXECUTION"],
                    ].map((item) => (
                      <div className="export-row" key={item[0]}><strong>{item[0]}</strong><span>{item[1]}</span><em>{item[2]}</em><b>✓</b></div>
                    ))}
                    <button className="download-action" onClick={buildBundle} disabled={!hasResults || Boolean(busy)}>
                      {busy === "export" ? "PACKAGING RUN…" : "DOWNLOAD COMPLETE TEST BUNDLE"} <span>↓</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="empty-state">
          <div className="empty-grid" />
          <span>WAITING FOR SCENARIO CONTRACT</span>
          <p>Compile the loaded failure case to initialize the world.</p>
        </section>
      )}

      <footer>
        <span>FAILURECLOUD / BUILD 0.1.0</span>
        <strong>SCENARIO → SIMULATION → EVIDENCE</strong>
        <span>LOCAL-FIRST · CLOUD-EXTENSIBLE</span>
      </footer>
    </main>
  );
}

