"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { apiAsset, fetcher } from "@/lib/api";
import type {
  FrameManifest,
  FrameRecord,
  RunManifest,
} from "@/lib/types";

const stages = [
  { phase: "compiling_scenario", label: "Compiling scenario" },
  { phase: "building_simulation", label: "Building simulation" },
  { phase: "running_robot_test", label: "Running robot test" },
  { phase: "recording_sensors", label: "Recording sensors" },
  { phase: "generating_labels", label: "Generating labels" },
  { phase: "evaluating_result", label: "Evaluating result" },
  { phase: "packaging_artifacts", label: "Packaging artifacts" },
] as const;

type PlaybackView = "rgb" | "depth" | "labels";

function phaseIndex(phase: RunManifest["phase"]): number {
  if (phase === "queued") return -1;
  if (phase === "completed") return stages.length;
  if (phase === "failed") return stages.length;
  return stages.findIndex((stage) => stage.phase === phase);
}

function formatMetric(value: unknown, suffix = ""): string {
  return typeof value === "number" ? `${value.toFixed(2)}${suffix}` : "—";
}

function currentImage(frame: FrameRecord, view: PlaybackView): string {
  if (view === "depth") return frame.depth_preview_url;
  if (view === "labels") return frame.segmentation_preview_url;
  return frame.rgb_url;
}

export default function RunExecution() {
  const params = useParams<{ id: string }>();
  const runId = decodeURIComponent(params.id);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<PlaybackView>("rgb");

  const { data: run, error: runError } = useSWR<RunManifest>(
    `/v1/runs/${runId}`,
    fetcher,
    {
      refreshInterval: (latest) =>
        latest?.status === "queued" || latest?.status === "running" ? 300 : 0,
    },
  );
  const { data: frames } = useSWR<FrameManifest>(
    run?.status === "completed" ? `/v1/runs/${runId}/frames` : null,
    fetcher,
  );

  const maxFrame = Math.max(0, (frames?.frame_count ?? 1) - 1);
  const selectedFrame = frames?.frames[Math.min(frameIndex, maxFrame)] ?? null;
  const liveFrame =
    typeof run?.latest_telemetry.frame === "number"
      ? Math.max(0, Math.floor(run.latest_telemetry.frame))
      : 0;
  const liveImage =
    run && run.status === "running"
      ? apiAsset(
          `/artifacts/runs/${runId}/sensor_data/rgb/${String(liveFrame).padStart(6, "0")}.png`,
        )
      : "";
  const displayedImage = selectedFrame
    ? apiAsset(currentImage(selectedFrame, view))
    : liveImage;
  const telemetry = selectedFrame?.telemetry ?? run?.latest_telemetry ?? {};
  const activePhase = phaseIndex(run?.phase ?? "queued");
  const completed = run?.status === "completed";

  useEffect(() => {
    if (!playing || !frames || frames.frame_count < 2) return;
    const delay = Math.max(80, 1000 / frames.capture_rate_hz);
    const timer = window.setInterval(() => {
      setFrameIndex((current) => {
        if (current >= frames.frame_count - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, delay);
    return () => window.clearInterval(timer);
  }, [frames, playing]);

  useEffect(() => {
    if (frames) setFrameIndex(0);
  }, [frames]);

  const verdict = useMemo(() => {
    if (!run?.summary) return null;
    return {
      label: run.summary.success ? "PASSED" : "FAILED",
      reason:
        run.summary.failure_reason ??
        "The robot satisfied every configured success criterion.",
    };
  }, [run?.summary]);

  if (runError) {
    return (
      <div className="fc-page">
        <div className="fc-empty-state">
          <span className="fc-kicker">Step 5 of 7 · Run</span>
          <h1>Run could not be loaded.</h1>
          <p>{runError instanceof Error ? runError.message : "Unknown API error"}</p>
          <Link className="fc-button fc-button--primary" href="/app/tests">
            Return to tests
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fc-page fc-page--run">
      <div className="fc-run-header">
        <div className="fc-page__intro">
          <span className="fc-kicker">Step 5 of 7 · Run</span>
          <h1>{completed ? "Recorded simulation ready." : "Running robot test."}</h1>
          <p>
            PyBullet is executing the canonical scenario and recording
            synchronized sensor evidence.
          </p>
        </div>
        <div className="fc-run-header__status">
          <span className={`fc-run-state fc-run-state--${run?.status ?? "queued"}`}>
            <i />
            {run?.status ?? "connecting"}
          </span>
          <code>{runId}</code>
        </div>
      </div>

      <section className="fc-run-stages">
        <div className="fc-run-stages__progress">
          <i style={{ width: `${Math.round((run?.progress ?? 0) * 100)}%` }} />
        </div>
        <ol>
          {stages.map((stage, index) => {
            const status =
              completed || index < activePhase
                ? "complete"
                : index === activePhase
                  ? "active"
                  : "pending";
            return (
              <li className={`is-${status}`} key={stage.phase}>
                <i>{status === "complete" ? "✓" : String(index + 1).padStart(2, "0")}</i>
                <span>{stage.label}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="fc-run-layout">
        <section className="fc-playback">
          <div className="fc-playback__toolbar">
            <div>
              {(["rgb", "depth", "labels"] as PlaybackView[]).map((item) => (
                <button
                  className={view === item ? "is-active" : ""}
                  disabled={!frames && item !== "rgb"}
                  key={item}
                  onClick={() => setView(item)}
                  type="button"
                >
                  {item === "labels" ? "Labels" : item.toUpperCase()}
                </button>
              ))}
            </div>
            <span>
              {selectedFrame
                ? `Frame ${selectedFrame.index + 1} / ${frames?.frame_count}`
                : `Recording frame ${liveFrame + 1}`}
            </span>
          </div>
          <div className={`fc-playback__viewport fc-playback__viewport--${view}`}>
            {displayedImage ? (
              <img
                alt={`${view} simulation frame`}
                key={`${view}-${selectedFrame?.frame_id ?? liveFrame}`}
                src={displayedImage}
              />
            ) : (
              <div className="fc-playback__waiting">
                <i />
                <strong>Initializing PyBullet renderer…</strong>
                <span>The first recorded frame will appear here.</span>
              </div>
            )}
            <span className="fc-playback__stamp">
              PYBULLET · {view.toUpperCase()} ·{" "}
              {formatMetric(telemetry.time_s, "s")}
            </span>
          </div>
          <div className="fc-player-controls">
            <button
              aria-label={playing ? "Pause playback" : "Play playback"}
              disabled={!frames}
              onClick={() => {
                if (frameIndex >= maxFrame) setFrameIndex(0);
                setPlaying((value) => !value);
              }}
              type="button"
            >
              {playing ? "Ⅱ" : "▶"}
            </button>
            <span>{formatMetric(telemetry.time_s, "s")}</span>
            <input
              aria-label="Simulation timeline"
              disabled={!frames}
              max={maxFrame}
              min="0"
              onChange={(event) => {
                setPlaying(false);
                setFrameIndex(Number(event.target.value));
              }}
              step="1"
              type="range"
              value={Math.min(frameIndex, maxFrame)}
            />
            <span>{frames ? `${run?.summary?.duration_s.toFixed(2)}s` : "—"}</span>
          </div>
          <div className="fc-frame-timeline">
            <span>START</span>
            <i />
            <span>HAZARD</span>
            <i />
            <span>GOAL</span>
          </div>
        </section>

        <aside className="fc-run-metrics">
          <div className="fc-run-metrics__heading">
            <span>Frame telemetry</span>
            <i className="fc-status-dot" />
          </div>
          <div className="fc-run-metric fc-run-metric--water">
            <span>Water remaining</span>
            <strong>{formatMetric(telemetry.water_left_percent, "%")}</strong>
            <div>
              <i
                style={{
                  width: `${Math.max(0, Number(telemetry.water_left_percent ?? 0))}%`,
                }}
              />
            </div>
          </div>
          <dl>
            <div>
              <dt>Cup tilt</dt>
              <dd>{formatMetric(telemetry.cup_tilt_deg, "°")}</dd>
            </div>
            <div>
              <dt>Collisions</dt>
              <dd>{formatMetric(telemetry.collisions)}</dd>
            </div>
            <div>
              <dt>Distance to goal</dt>
              <dd>{formatMetric(telemetry.distance_to_goal_m, "m")}</dd>
            </div>
            <div>
              <dt>Total reward</dt>
              <dd>{formatMetric(telemetry.reward)}</dd>
            </div>
            <div>
              <dt>LiDAR returns</dt>
              <dd>{selectedFrame ? selectedFrame.lidar_points : "—"}</dd>
            </div>
            <div>
              <dt>Simulation progress</dt>
              <dd>{Math.round(Number(telemetry.progress ?? run?.progress ?? 0) * 100)}%</dd>
            </div>
          </dl>
          <div className="fc-run-threshold">
            <span>Pass threshold</span>
            <strong>
              Water ≥ {run?.scenario.task.success.min_water_left_percent ?? "—"}%
            </strong>
            <small>
              Collisions ≤ {run?.scenario.task.success.max_collisions ?? "—"}
            </small>
          </div>
        </aside>
      </div>

      {verdict ? (
        <section
          className={`fc-run-verdict ${run?.summary?.success ? "is-pass" : "is-fail"}`}
        >
          <div>
            <span>Simulation complete</span>
            <strong>{verdict.label}</strong>
          </div>
          <p>{verdict.reason}</p>
          <Link
            className="fc-button fc-button--primary"
            href={`/app/runs/${encodeURIComponent(runId)}/results`}
          >
            Review results <span aria-hidden="true">→</span>
          </Link>
        </section>
      ) : null}
    </div>
  );
}
