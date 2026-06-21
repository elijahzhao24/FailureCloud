from __future__ import annotations

from fastapi.testclient import TestClient

from app.compiler import compile_prompt
from app.main import app
from app.models import RunManifest
from app.simulator import run_simulation
from app.store import store


client = TestClient(app)


def test_health_and_compile_contract():
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    response = client.post(
        "/v1/scenarios/compile",
        json={
            "prompt": "Generate a warehouse robot carrying a cup across a slippery floor."
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["compiler"] == "deterministic"
    assert payload["scenario"]["objects"][0]["class"] == "cup"
    assert payload["validation_report"]["valid"]


def test_missing_resources_return_404():
    assert client.get("/v1/runs/missing").status_code == 404
    assert client.get("/v1/previews/reactor/missing").status_code == 404


def test_generate_robot_tests_returns_five_executable_suggestions():
    response = client.post(
        "/v1/tests/generate",
        json={
            "task": "A warehouse robot carries a cup of water across the floor.",
            "mode": "normal_task",
            "robot_type": "mobile_base",
            "environment": "warehouse",
            "sensors": ["depth", "collision", "pose"],
            "export_targets": ["pybullet", "openpcdet"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["generator"] == "deterministic"
    assert len(payload["suggestions"]) == 5
    assert len({item["test_id"] for item in payload["suggestions"]}) == 5
    assert all(
        item["scenario"]["schema_version"] == "0.1.0"
        for item in payload["suggestions"]
    )
    assert all(
        item["scenario"]["exports"] == ["pybullet", "openpcdet"]
        for item in payload["suggestions"]
    )
    first_scenario = payload["suggestions"][0]["scenario"]
    assert first_scenario["environment"]["physics"]["floor_friction"] == 0.18
    assert not first_scenario["sensors"]["rgb_camera"]["enabled"]
    assert first_scenario["sensors"]["depth_camera"]["enabled"]
    assert not first_scenario["sensors"]["lidar"]["enabled"]


def test_generate_exact_failure_returns_one_direct_test():
    response = client.post(
        "/v1/tests/generate",
        json={
            "task": "Create a slippery warehouse route with a dropped box.",
            "mode": "exact_failure",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["suggestions"]) == 1
    assert payload["suggestions"][0]["difficulty"] == "hard"
    assert payload["suggestions"][0]["scenario"]["name"] == "Exact requested failure"


def test_harder_variant_increases_constraints_and_remains_valid():
    generated = client.post(
        "/v1/tests/generate",
        json={
            "task": "A warehouse robot carries water around a crossing worker.",
            "mode": "normal_task",
        },
    ).json()
    original = generated["suggestions"][2]["scenario"]

    response = client.post(
        "/v1/scenarios/variant",
        json={"scenario": original, "strategy": "harder"},
    )

    assert response.status_code == 200
    payload = response.json()
    variant = payload["scenario"]
    assert payload["validation_report"]["valid"]
    assert len(payload["changes"]) >= 5
    assert (
        variant["environment"]["physics"]["floor_friction"]
        < original["environment"]["physics"]["floor_friction"]
    )
    assert variant["robot"]["speed_mps"] > original["robot"]["speed_mps"]
    assert (
        variant["dynamic_actors"][0]["speed_mps"]
        > original["dynamic_actors"][0]["speed_mps"]
    )
    assert (
        variant["task"]["success"]["min_water_left_percent"]
        > original["task"]["success"]["min_water_left_percent"]
    )


def test_completed_run_exposes_browser_frame_manifest():
    scenario = compile_prompt("A warehouse robot carries water around a box.").scenario
    scenario.task.termination.timeout_s = 1.0
    scenario.sensors.capture_rate_hz = 2.0
    scenario.sensors.rgb_camera.width = 96
    scenario.sensors.rgb_camera.height = 64
    scenario.sensors.depth_camera.width = 96
    scenario.sensors.depth_camera.height = 64
    scenario.sensors.lidar.num_rays = 64
    run = RunManifest(run_id="run_frames_api", status="queued", scenario=scenario)
    store.runs[run.run_id] = run
    run_simulation(run.run_id)

    response = client.get(f"/v1/runs/{run.run_id}/frames")

    assert response.status_code == 200
    payload = response.json()
    assert payload["frame_count"] == 8
    assert payload["width"] == 96
    assert payload["frames"][0]["depth_preview_url"].endswith(".png")
    assert payload["frames"][0]["segmentation_preview_url"].endswith(".png")
