"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { apiAsset, apiFetch, fetcher } from "@/lib/api";
import type {
  RobotTestSuggestion,
  RunManifest,
  VisualPreviewStatus,
} from "@/lib/types";
import {
  loadWorkspaceSession,
  saveRunForTest,
  saveSelectedTest,
} from "@/lib/workspace-session";

const ScenarioSchematic = dynamic(() => import("./ScenarioSchematic"), {
  ssr: false,
  loading: () => (
    <div className="fc-schematic-loading">
      <i />
      <span>Preparing scene geometry…</span>
    </div>
  ),
});
const ReactorCinematicSession = dynamic(
  () => import("./ReactorCinematicSession"),
  { ssr: false },
);

type PreviewTab = "layout" | "sensors" | "success";

const tabs: Array<{ id: PreviewTab; label: string }> = [
  { id: "layout", label: "Scene layout" },
  { id: "sensors", label: "Sensor setup" },
  { id: "success", label: "Success logic" },
];

function SensorLegend({ suggestion }: { suggestion: RobotTestSuggestion }) {
  const scenario = suggestion.scenario;
  const rows = [
    {
      name: "RGB camera",
      enabled: scenario.sensors.rgb_camera.enabled,
      color: "blue",
      detail: `${scenario.sensors.rgb_camera.fov_deg}° field of view`,
    },
    {
      name: "Depth camera",
      enabled: scenario.sensors.depth_camera.enabled,
      color: "amber",
      detail: `${scenario.sensors.depth_camera.fov_deg}° field of view`,
    },
    {
      name: "LiDAR",
      enabled: scenario.sensors.lidar.enabled,
      color: "mint",
      detail: `${scenario.sensors.lidar.num_rays} rays · ${scenario.sensors.lidar.range_m}m`,
    },
    {
      name: "Collision + pose",
      enabled: true,
      color: "black",
      detail: `${scenario.sensors.capture_rate_hz} Hz telemetry`,
    },
  ];
  return (
    <div className="fc-preview-legend">
      {rows.map((row) => (
        <div className={!row.enabled ? "is-disabled" : ""} key={row.name}>
          <i className={`fc-preview-swatch fc-preview-swatch--${row.color}`} />
          <span>
            <strong>{row.name}</strong>
            <small>{row.enabled ? row.detail : "Disabled in scenario"}</small>
          </span>
          <em>{row.enabled ? "On" : "Off"}</em>
        </div>
      ))}
    </div>
  );
}

function SuccessLogic({ suggestion }: { suggestion: RobotTestSuggestion }) {
  const { scenario } = suggestion;
  const success = scenario.task.success;
  const termination = scenario.task.termination;
  const rules = [
    {
      label: "Goal reached",
      value: `distance_to_goal < 0.30m`,
      required: success.goal_reached,
    },
    {
      label: "Water remaining",
      value: `water_left ≥ ${success.min_water_left_percent.toFixed(0)}%`,
      required: true,
    },
    {
      label: "Collision limit",
      value: `collisions ≤ ${success.max_collisions}`,
      required: true,
    },
    {
      label: "Time limit",
      value: `elapsed_time ≤ ${termination.timeout_s.toFixed(0)}s`,
      required: true,
    },
  ];
  return (
    <div className="fc-success-preview">
      <div className="fc-success-formula">
        <span>PASS IF</span>
        <code>
          goal_reached AND water_ok AND collision_ok AND time_ok
        </code>
      </div>
      <div className="fc-success-rules">
        {rules.map((rule, index) => (
          <div key={rule.label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{rule.label}</strong>
              <code>{rule.value}</code>
            </div>
            <i>{rule.required ? "Required" : "Observed"}</i>
          </div>
        ))}
      </div>
      <div className="fc-reward-preview">
        <div>
          <span>Goal progress</span>
          <strong>+{scenario.task.reward.goal_progress}</strong>
        </div>
        <div>
          <span>Collision</span>
          <strong>{scenario.task.reward.collision_penalty}</strong>
        </div>
        <div>
          <span>Spill</span>
          <strong>{scenario.task.reward.spill_penalty}</strong>
        </div>
        <div>
          <span>Success</span>
          <strong>+{scenario.task.reward.success_bonus}</strong>
        </div>
      </div>
    </div>
  );
}

function ReactorPreview({ suggestion }: { suggestion: RobotTestSuggestion }) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const { data } = useSWR<VisualPreviewStatus>(
    previewId ? `/v1/previews/reactor/${previewId}` : null,
    fetcher,
    {
      refreshInterval: (latest) =>
        latest?.status === "queued" || latest?.status === "generating" ? 700 : 0,
    },
  );

  const launchFallback = useCallback(async () => {
    setLaunching(true);
    setLaunchError(null);
    setLive(false);
    try {
      const response = await apiFetch<VisualPreviewStatus>(
        "/v1/previews/reactor",
        {
          method: "POST",
          body: JSON.stringify({ scenario: suggestion.scenario }),
        },
      );
      setPreviewId(response.preview_id);
    } catch (error) {
      setLaunchError(
        error instanceof Error ? error.message : "Preview generation failed.",
      );
    } finally {
      setLaunching(false);
    }
  }, [suggestion.scenario]);

  const imageUrl = apiAsset(data?.media_url ?? data?.poster_url);
  const working =
    launching || data?.status === "queued" || data?.status === "generating";
  const obstacleCount = suggestion.scenario.objects.filter(
    (item) => item.class === "obstacle",
  ).length;
  const movingObstacleCount = suggestion.scenario.dynamic_actors.length;
  const prompt = useMemo(
    () =>
      [
        "Photorealistic cinematic visualization of one compact autonomous mobile robot in a completely empty white infinity studio.",
        "The world is only a seamless matte-white floor merging into a seamless matte-white background, with a soft horizon and realistic pale-gray contact shadows.",
        "Show the robot clearly from a low rear three-quarter tracking camera, like a polished robotics product demonstration. The camera follows smoothly behind the robot at a constant distance.",
        "The robot has four small wheels, a clean dark-gray body, and carries one visible cup of water securely on its top platform.",
        "The robot drives forward along a gentle curved path. Its wheels steer naturally and the camera follows the turn.",
        obstacleCount > 0
          ? `Exactly ${obstacleCount} simple bright-orange rectangular box obstacle${obstacleCount === 1 ? " is" : "s are"} placed well to the robot's front-right side, offset from the center of its path. The robot visibly curves left and passes safely beside the orange obstacle without touching it. The obstacle remains stationary and solid; the robot never intersects, clips through, drives through, or drives over it.`
          : "The white path ahead of the robot is empty.",
        movingObstacleCount > 0
          ? `Exactly ${movingObstacleCount} simple yellow upright rectangular obstacle${movingObstacleCount === 1 ? " remains" : "s remain"} far to the right side of the scene, safely outside the robot's path.`
          : "",
        "Nothing else exists in the scene. No warehouse, no factory, no shelves, no walls, no ceiling, no doors, no road, no outdoor landscape, no other vehicles, no people, no animals, no decorations, no signs, no text, and no logos.",
        "Keep the white studio, robot, cup, and obstacle geometrically stable for the entire continuous shot. No cuts, no first-person view, no aerial view, and no changing environment.",
      ]
        .filter(Boolean)
        .join(" "),
    [movingObstacleCount, obstacleCount],
  );
  const handleLiveError = useCallback(
    (message: string) => {
      setLaunchError(message);
      setLive(false);
      void launchFallback();
    },
    [launchFallback],
  );
  const handleLiveStop = useCallback(() => setLive(false), []);

  return (
    <section className="fc-reactor-card">
      <div className="fc-reactor-card__copy">
        <div>
          <span className="fc-badge">Optional · illustrative</span>
          <h2>Reactor cinematic preview</h2>
          <p>
            A cinematic robot demonstration inside a minimal white test world. It
            cannot alter scenario geometry, physics, labels, or evaluation metrics.
          </p>
        </div>
        <div className="fc-reactor-card__actions">
          {!live ? (
            <button
              className="fc-button fc-button--secondary"
              onClick={() => {
                setLaunchError(null);
                setLive(true);
              }}
              type="button"
            >
              Start live Reactor
            </button>
          ) : null}
          {!previewId && !live ? (
            <button
              disabled={launching}
              onClick={launchFallback}
              type="button"
            >
              {launching ? "Generating fallback…" : "Use local fallback"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="fc-reactor-card__media">
        {live ? (
          <ReactorCinematicSession
            onError={handleLiveError}
            onStop={handleLiveStop}
            prompt={prompt}
          />
        ) : imageUrl ? (
          <img alt="Illustrative Reactor warehouse preview" src={imageUrl} />
        ) : (
          <div className="fc-reactor-placeholder">
            {working ? (
              <>
                <i />
                <strong>Generating illustrative world…</strong>
                <span>This continues independently from the physics test.</span>
              </>
            ) : (
              <>
                <div className="fc-reactor-placeholder__scene" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <strong>Optional cinematic layer</strong>
                <span>
                  The deterministic schematic above is already ready to use.
                </span>
              </>
            )}
          </div>
        )}
        <span className="fc-reactor-card__label">
          ILLUSTRATIVE AI PREVIEW · NOT PHYSICS
        </span>
      </div>
      {data?.status === "completed" ? (
        <div className="fc-reactor-card__status">
          <i className="fc-status-dot" />
          <span>
            {data.provider === "reactor"
              ? "Reactor preview ready"
              : "Local fallback preview ready"}
          </span>
        </div>
      ) : null}
      {launchError ? (
        <div className="fc-form-error" role="alert">
          <strong>Cinematic preview unavailable.</strong>
          <span>{launchError}</span>
        </div>
      ) : null}
    </section>
  );
}

export default function ScenarioPreview() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const testId = decodeURIComponent(params.id);
  const [suggestion, setSuggestion] = useState<RobotTestSuggestion | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<PreviewTab>("layout");
  const [runPending, setRunPending] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    const session = loadWorkspaceSession();
    const found = session?.response.suggestions.find(
      (item) => item.test_id === testId,
    );
    if (found) {
      saveSelectedTest(testId);
      setSuggestion(found);
    }
    setLoaded(true);
  }, [testId]);

  const sceneStats = useMemo(() => {
    if (!suggestion) return null;
    const scenario = suggestion.scenario;
    return [
      {
        label: "Floor friction",
        value: scenario.environment.physics.floor_friction.toFixed(2),
      },
      { label: "Robot speed", value: `${scenario.robot.speed_mps.toFixed(2)} m/s` },
      { label: "Objects", value: String(scenario.objects.length) },
      { label: "Dynamic actors", value: String(scenario.dynamic_actors.length) },
    ];
  }, [suggestion]);

  async function startRun() {
    if (!suggestion || runPending) return;
    setRunPending(true);
    setRunError(null);
    try {
      const run = await apiFetch<RunManifest>("/v1/runs", {
        method: "POST",
        body: JSON.stringify({ scenario: suggestion.scenario }),
      });
      saveRunForTest(testId, run.run_id);
      router.push(`/app/runs/${encodeURIComponent(run.run_id)}`);
    } catch (error) {
      setRunError(
        error instanceof Error ? error.message : "Simulation could not start.",
      );
      setRunPending(false);
    }
  }

  if (!loaded) {
    return (
      <div className="fc-page">
        <div className="fc-loading-card" aria-label="Loading scenario preview">
          <i />
          <span>Loading preview geometry…</span>
        </div>
      </div>
    );
  }

  if (!suggestion || !sceneStats) {
    return (
      <div className="fc-page">
        <div className="fc-empty-state">
          <span className="fc-kicker">Step 4 of 7 · Preview</span>
          <h1>Scenario not found.</h1>
          <p>Choose and edit a robot test before opening the preview.</p>
          <Link className="fc-button fc-button--primary" href="/app/tests">
            Choose a test <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    );
  }

  const scenario = suggestion.scenario;
  const obstacle = scenario.objects.find((item) => item.class === "obstacle");
  const actor = scenario.dynamic_actors[0];

  return (
    <div className="fc-page fc-page--preview">
      <div className="fc-preview-header">
        <div className="fc-page__intro">
          <span className="fc-kicker">Step 4 of 7 · Preview</span>
          <h1>Inspect the test before physics.</h1>
          <p>
            Verify geometry, sensor coverage, and pass criteria derived from
            the canonical scenario.
          </p>
        </div>
        <div className="fc-preview-header__actions">
          <Link
            className="fc-button fc-button--secondary"
            href={`/app/tests/${encodeURIComponent(testId)}/edit`}
          >
            ← Edit scenario
          </Link>
          <button
            className="fc-button fc-button--primary"
            disabled={runPending}
            onClick={startRun}
            type="button"
          >
            {runPending ? "Starting simulation…" : "Run simulation →"}
          </button>
        </div>
      </div>

      <div className="fc-preview-stage">
        <div className="fc-preview-tabs" role="tablist" aria-label="Preview view">
          {tabs.map((item) => (
            <button
              aria-selected={tab === item.id}
              className={tab === item.id ? "is-active" : ""}
              key={item.id}
              onClick={() => setTab(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
          <span>
            <i className="fc-status-dot" />
            Scenario synced
          </span>
        </div>

        {tab === "success" ? (
          <SuccessLogic suggestion={suggestion} />
        ) : (
          <div className="fc-schematic-frame">
            <ScenarioSchematic
              mode={tab === "sensors" ? "sensors" : "layout"}
              scenario={scenario}
            />
            <div className="fc-schematic-overlay">
              <span>TOP-DOWN SCHEMATIC</span>
              <small>Drag to pan · scroll to zoom</small>
            </div>
            <div className="fc-schematic-compass" aria-hidden="true">
              <span>N</span>
              <i />
            </div>
          </div>
        )}

        {tab === "layout" ? (
          <div className="fc-scene-legend">
            <div><i className="is-robot" /><span>Robot + payload</span></div>
            <div><i className="is-route" /><span>Planned route</span></div>
            <div><i className="is-hazard" /><span>Obstacle</span></div>
            <div><i className="is-zone" /><span>Low-friction zone</span></div>
            <div><i className="is-actor" /><span>Human trajectory</span></div>
            <div><i className="is-goal" /><span>Goal zone</span></div>
          </div>
        ) : null}
        {tab === "sensors" ? <SensorLegend suggestion={suggestion} /> : null}
      </div>

      <div className="fc-preview-details">
        <section className="fc-preview-contract">
          <div className="fc-preview-contract__heading">
            <div>
              <span className="fc-badge">Canonical scene</span>
              <h2>{suggestion.title}</h2>
            </div>
            <code>{scenario.scenario_id}</code>
          </div>
          <dl>
            {sceneStats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
          <div className="fc-preview-contract__objects">
            <span>Scene composition</span>
            <p>
              Mobile base carrying water
              {obstacle ? ` · obstacle at x ${obstacle.pose.position.x.toFixed(2)}` : ""}
              {actor ? ` · crossing actor at ${actor.speed_mps.toFixed(2)} m/s` : ""}
              {" · "}goal at x {scenario.robot.goal_pose.position.x.toFixed(2)}
            </p>
          </div>
        </section>
        <aside className="fc-preview-note">
          <span>What this preview proves</span>
          <h2>The test is understandable before it is expensive.</h2>
          <p>
            This view confirms scenario semantics. PyBullet remains responsible
            for motion, collisions, sensor frames, water loss, and the verdict.
          </p>
          <ul>
            <li>Geometry comes from ScenarioV0_1</li>
            <li>Sensor overlays reflect enabled configuration</li>
            <li>Success rules match evaluation thresholds</li>
          </ul>
        </aside>
      </div>

      <ReactorPreview suggestion={suggestion} />

      {runError ? (
        <div className="fc-form-error" role="alert">
          <strong>Simulation could not start.</strong>
          <span>{runError}</span>
        </div>
      ) : null}

      <div className="fc-editor-footer">
        <div>
          <span className="fc-kicker">Next stage</span>
          <strong>Run the deterministic PyBullet test.</strong>
          <p>Recorded playback and synchronized telemetry are next.</p>
        </div>
        <button
          className="fc-button fc-button--primary"
          disabled={runPending}
          onClick={startRun}
          type="button"
        >
          {runPending ? "Starting simulation…" : "Run simulation →"}
        </button>
      </div>
    </div>
  );
}
