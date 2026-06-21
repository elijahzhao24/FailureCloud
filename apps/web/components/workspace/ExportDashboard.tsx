"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { API_URL, apiFetch, fetcher } from "@/lib/api";
import type { RunManifest, SweepSummary } from "@/lib/types";

const exportTargets = [
  {
    id: "pybullet",
    title: "PyBullet Replay",
    description: "Replay this canonical scenario through the FailureCloud simulator.",
    status: "Ready",
    files: "run_sim.py · scenario.json",
  },
  {
    id: "ros",
    title: "ROS-style Sensor Folder",
    description: "RGB, depth, LiDAR, calibration, transforms, and a topic manifest.",
    status: "Ready",
    files: "topic_manifest.json · sensor streams",
  },
  {
    id: "openpcdet",
    title: "OpenPCDet Dataset",
    description: "Float32 point clouds and per-frame 3D detection labels.",
    status: "Ready",
    files: "points/*.npy · labels/*.txt",
  },
  {
    id: "isaac",
    title: "Isaac Sim Config",
    description: "Scenario and sensor configuration for a future USD adapter.",
    status: "Preview",
    files: "scene_config.json",
  },
  {
    id: "nebius",
    title: "Nebius Job Manifest",
    description: "Cloud sweep task definition for scalable physical-AI evaluation.",
    status: "Preview",
    files: "job_manifest.json",
  },
] as const;

export default function ExportDashboard() {
  const params = useParams<{ id: string }>();
  const runId = decodeURIComponent(params.id);
  const [bundlePending, setBundlePending] = useState(false);
  const [bundleReady, setBundleReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sweepId, setSweepId] = useState<string | null>(null);
  const [sweepPending, setSweepPending] = useState(false);
  const { data: run } = useSWR<RunManifest>(`/v1/runs/${runId}`, fetcher);
  const { data: sweep } = useSWR<SweepSummary>(
    sweepId ? `/v1/runs/${runId}/sweeps/${sweepId}` : null,
    fetcher,
    {
      refreshInterval: (latest) =>
        latest?.status === "queued" || latest?.status === "running" ? 700 : 0,
    },
  );

  async function createBundle() {
    setBundlePending(true);
    setError(null);
    try {
      await apiFetch<{ status: string; bundle_url: string }>(
        `/v1/runs/${runId}/exports`,
        { method: "POST" },
      );
      setBundleReady(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export failed.");
    } finally {
      setBundlePending(false);
    }
  }

  async function launchSweep() {
    setSweepPending(true);
    setError(null);
    try {
      const result = await apiFetch<SweepSummary>(
        `/v1/runs/${runId}/sweeps/nebius`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setSweepId(result.sweep_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sweep launch failed.");
    } finally {
      setSweepPending(false);
    }
  }

  return (
    <div className="fc-page fc-page--export">
      <div className="fc-export-header">
        <div className="fc-page__intro">
          <span className="fc-kicker">Step 7 of 7 · Export</span>
          <h1>Package the complete robot test.</h1>
          <p>
            Download the scenario, synchronized evidence, evaluation, and
            integration-ready artifacts as one reproducible bundle.
          </p>
        </div>
        <Link className="fc-button fc-button--secondary" href={`/app/runs/${runId}/results`}>
          ← Results
        </Link>
      </div>

      <section className="fc-bundle-card">
        <div>
          <span className="fc-badge">Complete test bundle</span>
          <h2>failurecloud-{runId}.zip</h2>
          <p>
            Canonical scenario, RGB/depth/LiDAR streams, labels, telemetry,
            verdict, and every generated export target.
          </p>
        </div>
        <dl>
          <div><dt>Frames</dt><dd>{run?.summary?.frame_count ?? "—"}</dd></div>
          <div><dt>Verdict</dt><dd>{run?.summary?.success ? "Passed" : "Failed"}</dd></div>
          <div><dt>Schema</dt><dd>{run?.scenario.schema_version ?? "—"}</dd></div>
        </dl>
        <div className="fc-bundle-card__actions">
          {!bundleReady ? (
            <button
              className="fc-button fc-button--primary"
              disabled={bundlePending || !run?.summary}
              onClick={createBundle}
              type="button"
            >
              {bundlePending ? "Packaging bundle…" : "Generate test bundle"}
            </button>
          ) : (
            <a
              className="fc-button fc-button--primary"
              href={`${API_URL}/v1/runs/${runId}/bundle`}
            >
              Download ZIP ↓
            </a>
          )}
          <small>{bundleReady ? "Bundle ready to download" : "Generated locally on demand"}</small>
        </div>
      </section>

      <div className="fc-export-grid">
        {exportTargets.map((target, index) => (
          <article key={target.id}>
            <div>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <i className={target.status === "Ready" ? "is-ready" : "is-preview"}>
                {target.status}
              </i>
            </div>
            <h2>{target.title}</h2>
            <p>{target.description}</p>
            <code>{target.files}</code>
          </article>
        ))}
      </div>

      <section className="fc-nebius-export">
        <div>
          <span className="fc-badge">Optional cloud evaluation</span>
          <h2>Stress-test this scenario on Nebius.</h2>
          <p>
            Sweep friction and robot speed, then compare where the task fails.
            The local reduced sweep remains available if cloud submission is unavailable.
          </p>
        </div>
        <div className="fc-nebius-export__action">
          {!sweepId ? (
            <button
              className="fc-button fc-button--secondary"
              disabled={sweepPending}
              onClick={launchSweep}
              type="button"
            >
              {sweepPending ? "Submitting sweep…" : "Launch stress test"}
            </button>
          ) : (
            <>
              <span className={`fc-run-state fc-run-state--${sweep?.status ?? "queued"}`}>
                <i /> {sweep?.status ?? "queued"}
              </span>
              <strong>
                {sweep?.status === "completed"
                  ? `${Math.round(sweep.success_rate * 100)}% success rate`
                  : "Evaluating variants…"}
              </strong>
              <small>{sweep?.provider?.replace("_", " ") ?? "Preparing provider"}</small>
            </>
          )}
        </div>
      </section>

      <section className="fc-package-tree">
        <div>
          <span>Bundle structure</span>
          <h2>A tangible test artifact.</h2>
        </div>
        <pre>{`scenario.json
frames.json
sensor_data/
  rgb/ · depth/ · lidar/ · segmentation/
labels/
eval/
  telemetry.json · summary.json
exports/
  pybullet/ · ros2_folder/ · openpcdet/
  isaac/ · nebius/`}</pre>
      </section>

      {error ? (
        <div className="fc-form-error" role="alert">
          <strong>Operation failed.</strong><span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
