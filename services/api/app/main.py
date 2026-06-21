from __future__ import annotations

import asyncio
import json
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .compiler import compile_prompt, validate_payload
from .exports import generate_exports
from .models import (
    CompileRequest,
    CompileResponse,
    ReactorTokenResponse,
    RunCreateRequest,
    RunManifest,
    SweepCreateRequest,
    SweepSummary,
    ValidationReport,
    VisualPreviewRequest,
    VisualPreviewStatus,
)
from .nebius import nebius_status
from .simulator import run_simulation
from .store import store
from .sweeps import create_sweep
from .vendors import create_preview, create_reactor_token


app = FastAPI(
    title="FailureCloud API",
    version="0.1.0",
    description="Natural-language robot edge cases compiled into executable tests.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/artifacts", StaticFiles(directory=store.artifact_root), name="artifacts")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}


@app.get("/health/integrations")
def integration_health() -> dict[str, dict[str, str | bool]]:
    return {"nebius": nebius_status().public_dict()}


@app.post("/v1/scenarios/compile", response_model=CompileResponse)
def compile_scenario(request: CompileRequest) -> CompileResponse:
    return compile_prompt(request.prompt)


@app.post("/v1/scenarios/validate")
def validate_scenario(payload: dict[str, Any]) -> dict[str, Any]:
    scenario, report = validate_payload(payload)
    return {
        "scenario": scenario.model_dump(by_alias=True) if scenario else None,
        "validation_report": report.model_dump(),
    }


@app.post("/v1/runs", response_model=RunManifest)
def create_run(request: RunCreateRequest) -> RunManifest:
    run_id = store.new_id("run")
    manifest = RunManifest(run_id=run_id, status="queued", scenario=request.scenario)
    with store.lock:
        store.runs[run_id] = manifest
    threading.Thread(target=run_simulation, args=(run_id,), daemon=True).start()
    return manifest


@app.get("/v1/runs/{run_id}", response_model=RunManifest)
def get_run(run_id: str) -> RunManifest:
    with store.lock:
        if run_id not in store.runs:
            raise HTTPException(status_code=404, detail="Run not found")
        return store.runs[run_id]


@app.get("/v1/runs/{run_id}/events")
async def run_events(run_id: str) -> StreamingResponse:
    async def stream():
        last_payload = ""
        while True:
            with store.lock:
                manifest = store.runs.get(run_id)
                if manifest is None:
                    yield 'event: error\ndata: {"detail":"Run not found"}\n\n'
                    return
                payload = manifest.model_dump_json()
            if payload != last_payload:
                yield f"data: {payload}\n\n"
                last_payload = payload
            if manifest.status in {"completed", "failed"}:
                return
            await asyncio.sleep(0.4)

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.post("/v1/runs/{run_id}/exports")
def create_exports(run_id: str) -> dict[str, str]:
    try:
        path = generate_exports(run_id)
        return {"status": "completed", "bundle_url": f"/v1/runs/{run_id}/bundle", "file": path.name}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/v1/runs/{run_id}/bundle")
def download_bundle(run_id: str) -> FileResponse:
    run_dir = store.run_dir(run_id)
    path = run_dir / f"{run_id}.zip"
    if not path.exists():
        try:
            path = generate_exports(run_id)
        except (KeyError, ValueError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    return FileResponse(path, filename=f"failurecloud-{run_id}.zip")


@app.post("/v1/previews/reactor", response_model=VisualPreviewStatus)
def start_reactor_preview(request: VisualPreviewRequest) -> VisualPreviewStatus:
    return create_preview(request.scenario)


@app.get("/v1/previews/reactor/{preview_id}", response_model=VisualPreviewStatus)
def get_reactor_preview(preview_id: str) -> VisualPreviewStatus:
    with store.lock:
        if preview_id not in store.previews:
            raise HTTPException(status_code=404, detail="Preview not found")
        return store.previews[preview_id]


@app.post("/v1/integrations/reactor/token", response_model=ReactorTokenResponse)
def reactor_token() -> ReactorTokenResponse:
    try:
        return create_reactor_token()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail="Reactor token exchange failed"
        ) from exc


@app.post("/v1/runs/{run_id}/sweeps/nebius", response_model=SweepSummary)
def start_nebius_sweep(run_id: str, request: SweepCreateRequest) -> SweepSummary:
    with store.lock:
        if run_id not in store.runs:
            raise HTTPException(status_code=404, detail="Run not found")
    return create_sweep(run_id, request.specification)


@app.get("/v1/runs/{run_id}/sweeps/{sweep_id}", response_model=SweepSummary)
def get_sweep(run_id: str, sweep_id: str) -> SweepSummary:
    with store.lock:
        sweep = store.sweeps.get(sweep_id)
        if not sweep or sweep.run_id != run_id:
            raise HTTPException(status_code=404, detail="Sweep not found")
        return sweep


@app.get("/v1/runs/{run_id}/sweeps/{sweep_id}/results")
def get_sweep_results(run_id: str, sweep_id: str) -> dict[str, Any]:
    sweep = get_sweep(run_id, sweep_id)
    return {
        "sweep_id": sweep.sweep_id,
        "provider": sweep.provider,
        "success_rate": sweep.success_rate,
        "results": [result.model_dump() for result in sweep.results],
    }
