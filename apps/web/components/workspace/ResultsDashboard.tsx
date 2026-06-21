"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { apiAsset, fetcher } from "@/lib/api";
import type { FrameManifest, FrameRecord, RunManifest } from "@/lib/types";

type ResultTab =
  | "overview"
  | "rgb"
  | "depth"
  | "lidar"
  | "labels"
  | "reward";

type LabelsPayload = {
  frame_id: string;
  timestamp_s: number;
  objects: Array<{
    instance_id: string;
    class_name: string;
    position_xyz: number[];
    bbox_3d: number[];
  }>;
};

const tabs: Array<{ id: ResultTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "rgb", label: "RGB" },
  { id: "depth", label: "Depth" },
  { id: "lidar", label: "LiDAR" },
  { id: "labels", label: "Labels" },
  { id: "reward", label: "Reward" },
];

function ResultImage({
  frame,
  kind,
}: {
  frame: FrameRecord;
  kind: "rgb" | "depth" | "lidar";
}) {
  const url =
    kind === "depth"
      ? frame.depth_preview_url
      : kind === "lidar"
        ? frame.lidar_preview_url
        : frame.rgb_url;
  const assetUrl = apiAsset(url);
  return (
    <div className={`fc-result-image fc-result-image--${kind}`}>
      <img
        alt={`${kind} result frame`}
        src={kind === "lidar" ? `${assetUrl}?fit=observed-v2` : assetUrl}
      />
      <span>
        {kind.toUpperCase()} · FRAME {frame.frame_id} ·{" "}
        {frame.timestamp_s.toFixed(2)}s
      </span>
    </div>
  );
}

function RewardChart({ frames }: { frames: FrameRecord[] }) {
  const width = 900;
  const height = 250;
  const pad = 28;
  const traces = [
    {
      key: "reward",
      label: "Reward",
      color: "#0a0a09",
      values: frames.map((frame) => frame.telemetry.reward),
    },
    {
      key: "water",
      label: "Water left",
      color: "#27a96d",
      values: frames.map((frame) => frame.telemetry.water_left_percent),
    },
    {
      key: "tilt",
      label: "Cup tilt",
      color: "#d97706",
      values: frames.map((frame) => frame.telemetry.cup_tilt_deg),
    },
  ];
  const points = (values: number[]) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const scale = Math.max(max - min, 1);
    return values
      .map((value, index) => {
        const x = pad + (index / Math.max(values.length - 1, 1)) * (width - pad * 2);
        const y = height - pad - ((value - min) / scale) * (height - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };
  return (
    <div className="fc-reward-chart">
      <svg aria-label="Reward, water, and cup tilt over time" viewBox={`0 0 ${width} ${height}`}>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={pad}
            x2={width - pad}
            y1={pad + ratio * (height - pad * 2)}
            y2={pad + ratio * (height - pad * 2)}
          />
        ))}
        {traces.map((trace) => (
          <polyline
            fill="none"
            key={trace.key}
            points={points(trace.values)}
            stroke={trace.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        ))}
      </svg>
      <div>
        {traces.map((trace) => (
          <span key={trace.key}>
            <i style={{ background: trace.color }} />
            {trace.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ResultsDashboard() {
  const params = useParams<{ id: string }>();
  const runId = decodeURIComponent(params.id);
  const [tab, setTab] = useState<ResultTab>("overview");
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const { data: run, error } = useSWR<RunManifest>(
    `/v1/runs/${runId}`,
    fetcher,
  );
  const { data: frames } = useSWR<FrameManifest>(
    run?.status === "completed" ? `/v1/runs/${runId}/frames` : null,
    fetcher,
  );
  const selectedIndex =
    frameIndex ?? Math.max(0, (frames?.frame_count ?? 1) - 1);
  const frame = frames?.frames[selectedIndex] ?? null;
  const { data: labels } = useSWR<LabelsPayload>(
    tab === "labels" && frame ? frame.labels_url : null,
    fetcher,
  );

  const comparison = useMemo(() => {
    if (!run?.summary) return null;
    return [
      {
        label: "Water remaining",
        actual: `${run.summary.water_left_percent.toFixed(1)}%`,
        threshold: `≥ ${run.scenario.task.success.min_water_left_percent.toFixed(0)}%`,
        pass:
          run.summary.water_left_percent >=
          run.scenario.task.success.min_water_left_percent,
      },
      {
        label: "Collisions",
        actual: String(run.summary.collisions),
        threshold: `≤ ${run.scenario.task.success.max_collisions}`,
        pass:
          run.summary.collisions <= run.scenario.task.success.max_collisions,
      },
      {
        label: "Goal reached",
        actual: run.summary.goal_reached ? "Yes" : "No",
        threshold: "Required",
        pass: run.summary.goal_reached,
      },
      {
        label: "Duration",
        actual: `${run.summary.duration_s.toFixed(1)}s`,
        threshold: `≤ ${run.scenario.task.termination.timeout_s.toFixed(0)}s`,
        pass:
          run.summary.duration_s <= run.scenario.task.termination.timeout_s,
      },
    ];
  }, [run]);

  if (error) {
    return (
      <div className="fc-page">
        <div className="fc-empty-state">
          <span className="fc-kicker">Step 6 of 7 · Results</span>
          <h1>Results could not be loaded.</h1>
          <p>{error instanceof Error ? error.message : "Unknown API error"}</p>
        </div>
      </div>
    );
  }

  if (!run?.summary || !frames || !frame || !comparison) {
    return (
      <div className="fc-page">
        <div className="fc-loading-card" aria-label="Loading results">
          <i />
          <span>Loading evaluated sensor bundle…</span>
        </div>
      </div>
    );
  }

  const summary = run.summary;

  return (
    <div className="fc-page fc-page--results">
      <div className="fc-results-header">
        <div>
          <span className="fc-kicker">Step 6 of 7 · Results</span>
          <div className={`fc-results-verdict ${summary.success ? "is-pass" : "is-fail"}`}>
            <span>{summary.success ? "PASSED" : "FAILED"}</span>
            <h1>
              {summary.success
                ? "The robot satisfied every test criterion."
                : summary.failure_reason}
            </h1>
          </div>
        </div>
        <div className="fc-results-header__actions">
          <Link className="fc-button fc-button--secondary" href={`/app/runs/${runId}`}>
            ← Playback
          </Link>
          <Link
            className="fc-button fc-button--primary"
            href={`/app/runs/${runId}/export`}
          >
            Export test case →
          </Link>
        </div>
      </div>

      <nav className="fc-results-tabs" aria-label="Result views">
        {tabs.map((item) => (
          <button
            aria-selected={tab === item.id}
            className={tab === item.id ? "is-active" : ""}
            key={item.id}
            onClick={() => setTab(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
        <Link href={`/app/runs/${runId}/export`}>Exports ↗</Link>
      </nav>

      {tab === "overview" ? (
        <div className="fc-results-overview">
          <section className="fc-results-summary">
            <div className="fc-results-summary__metrics">
              <div>
                <span>Water left</span>
                <strong>{summary.water_left_percent.toFixed(1)}%</strong>
              </div>
              <div>
                <span>Max cup tilt</span>
                <strong>{summary.max_cup_tilt_deg.toFixed(1)}°</strong>
              </div>
              <div>
                <span>Collisions</span>
                <strong>{summary.collisions}</strong>
              </div>
              <div>
                <span>Total reward</span>
                <strong>{summary.total_reward.toFixed(2)}</strong>
              </div>
            </div>
            <div className="fc-results-comparison">
              {comparison.map((item) => (
                <div key={item.label}>
                  <i className={item.pass ? "is-pass" : "is-fail"}>
                    {item.pass ? "✓" : "×"}
                  </i>
                  <span>{item.label}</span>
                  <strong>{item.actual}</strong>
                  <small>{item.threshold}</small>
                </div>
              ))}
            </div>
          </section>
          <aside className="fc-failure-analysis">
            <span>Evaluation</span>
            <h2>{summary.failure_code ?? "ALL_CRITERIA_SATISFIED"}</h2>
            <p>
              {summary.failure_reason ??
                "The canonical success logic evaluated to true for this run."}
            </p>
            <dl>
              <div><dt>Scenario</dt><dd>{run.scenario.name}</dd></div>
              <div><dt>Seed</dt><dd>{run.scenario.seed}</dd></div>
              <div><dt>Frames</dt><dd>{frames.frame_count}</dd></div>
              <div><dt>Capture rate</dt><dd>{frames.capture_rate_hz} Hz</dd></div>
            </dl>
          </aside>
        </div>
      ) : null}

      {tab === "rgb" ? <ResultImage frame={frame} kind="rgb" /> : null}
      {tab === "depth" ? <ResultImage frame={frame} kind="depth" /> : null}
      {tab === "lidar" ? (
        <div>
          <ResultImage frame={frame} kind="lidar" />
          <div className="fc-lidar-stats">
            <span>Point returns</span><strong>{frame.lidar_points}</strong>
            <span>Range</span><strong>{run.scenario.sensors.lidar.range_m}m</strong>
            <span>Configured rays</span><strong>{run.scenario.sensors.lidar.num_rays}</strong>
          </div>
        </div>
      ) : null}
      {tab === "labels" ? (
        <div className="fc-label-results">
          <ResultImage frame={frame} kind="rgb" />
          <div className="fc-label-results__data">
            <div>
              <span>Frame labels</span>
              <strong>{labels?.objects.length ?? "—"} instances</strong>
            </div>
            <pre>{labels ? JSON.stringify(labels, null, 2) : "Loading labels…"}</pre>
          </div>
        </div>
      ) : null}
      {tab === "reward" ? (
        <section className="fc-reward-results">
          <div>
            <span className="fc-badge">Evaluation trace</span>
            <h2>Reward, water retention, and cup stability</h2>
            <p>Recorded simulator telemetry, normalized per trace for comparison.</p>
          </div>
          <RewardChart frames={frames.frames} />
        </section>
      ) : null}

      {tab !== "overview" && tab !== "reward" ? (
        <div className="fc-result-scrubber">
          <span>Frame {selectedIndex + 1}</span>
          <input
            aria-label="Result frame"
            max={frames.frame_count - 1}
            min="0"
            onChange={(event) => setFrameIndex(Number(event.target.value))}
            type="range"
            value={selectedIndex}
          />
          <span>{frame.timestamp_s.toFixed(2)}s</span>
        </div>
      ) : null}
    </div>
  );
}
