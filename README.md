# FailureCloud

FailureCloud turns natural-language robot failure cases into executable simulation tests with sensor data, labels, rewards, and exportable artifacts.

The hackathon MVP currently supports:

- Prompt-to-scenario compilation using Claude or a deterministic fallback.
- Editable, versioned `scenario.json`.
- Interactive Three.js warehouse preview.
- Deterministic PyBullet execution.
- RGB, metric depth, segmentation, LiDAR, object labels, and telemetry.
- Water-retention, collision, reward, and pass/fail evaluation.
- OpenPCDet, ROS-style, PyBullet, Isaac-config, and Nebius-manifest exports.
- Reactor Helios live cinematic preview with a local SVG fallback.
- Nebius-compatible parameter sweeps with a local execution fallback.

## Local setup

Requirements:

- Node.js 22+
- Python 3.12+
- Docker, optionally

Install:

```bash
cp .env.example .env
make install
```

Start the backend:

```bash
make api
```

Start the frontend in another terminal:

```bash
make web
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Claude is optional. Without a key, scenario compilation uses a deterministic template.

```env
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5
```

Reactor is optional. When configured, the backend exchanges the API key for a short-lived browser token and the frontend connects to Helios over WebRTC.

```env
REACTOR_API_URL=https://api.reactor.inc
REACTOR_API_KEY=
```

Nebius currently requires an authorized service account, the official CLI, and a published worker image:

```env
NEBIUS_PROJECT_ID=
NEBIUS_REGION=eu-north1
NEBIUS_EXECUTION_ENDPOINT=api.nebius.cloud:443
NEBIUS_SERVICE_ACCOUNT_KEY_FILE=
NEBIUS_CLI_PATH=nebius
NEBIUS_PROFILE=failurecloud
NEBIUS_JOB_IMAGE=
```

Never commit `.env` or service-account credential files.

## Verification

```bash
.venv/bin/pytest -q services/api/tests
npm run build
npm --workspace apps/web run test:e2e
```

The browser test executes:

1. Prompt compilation
2. Scenario validation
3. Three.js preview
4. PyBullet simulation
5. Failure report
6. Local parameter sweep and heatmap

## API

Primary endpoints:

- `POST /v1/scenarios/compile`
- `POST /v1/scenarios/validate`
- `POST /v1/runs`
- `GET /v1/runs/{run_id}`
- `GET /v1/runs/{run_id}/events`
- `POST /v1/runs/{run_id}/exports`
- `GET /v1/runs/{run_id}/bundle`
- `POST /v1/previews/reactor`
- `POST /v1/integrations/reactor/token`
- `POST /v1/runs/{run_id}/sweeps/nebius`
- `GET /health/integrations`

Generated data is written to `artifacts/runs/<run_id>/`.

## Sponsor integrations

Reactor is used only for an illustrative cinematic preview. PyBullet remains authoritative for physics, labels, and evaluation.

Nebius is intended to execute the parameter-sweep worker at scale. The worker entry point is:

```bash
python -m app.sweep_worker \
  --scenario /work/input/scenario.json \
  --specification /work/input/sweep.json \
  --output /work/output/results.json
```

Until project IAM and a worker image are configured, the same normalized sweep runs locally.

## Demo

Use the default warehouse prompt. Compile the scenario, inspect the world, run the test, show the water-retention failure, open the cloud-sweep heatmap, select a difficult variant, and download the complete test bundle.
