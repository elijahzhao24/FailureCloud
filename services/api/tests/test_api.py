from __future__ import annotations

from fastapi.testclient import TestClient

from app.compiler import compile_prompt
from app.main import app
from app.models import RunManifest
from app.simulator import run_simulation
from app.store import store


client = TestClient(app)

SIMPLE_ROBOT_URDF = b"""<?xml version="1.0"?>
<robot name="failurecloud_test_robot">
  <link name="base_link">
    <inertial>
      <origin xyz="0 0 0"/>
      <mass value="5"/>
      <inertia ixx="0.1" ixy="0" ixz="0" iyy="0.1" iyz="0" izz="0.1"/>
    </inertial>
    <visual>
      <geometry><box size="0.5 0.4 0.25"/></geometry>
      <material name="mint"><color rgba="0.1 0.9 0.7 1"/></material>
    </visual>
    <collision>
      <geometry><box size="0.5 0.4 0.25"/></geometry>
    </collision>
  </link>
</robot>
"""


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


def test_upload_custom_urdf_and_use_it_in_generated_scenario():
    upload = client.post(
        "/v1/assets/robots",
        files={"file": ("test_robot.urdf", SIMPLE_ROBOT_URDF, "application/xml")},
    )

    assert upload.status_code == 200
    asset = upload.json()
    assert asset["format"] == "urdf"
    assert asset["asset_ref"].startswith("asset://robots/")
    assert client.get("/v1/assets/robots").json() == [asset]

    generated = client.post(
        "/v1/tests/generate",
        json={
            "task": "Carry a cup across an empty test floor.",
            "robot_type": "custom_urdf",
            "custom_robot_asset_ref": asset["asset_ref"],
            "custom_robot_name": asset["name"],
            "environment": "white_test_floor",
        },
    )

    assert generated.status_code == 200
    scenario = generated.json()["suggestions"][0]["scenario"]
    assert scenario["robot"]["type"] == "custom_urdf"
    assert scenario["robot"]["asset_ref"] == asset["asset_ref"]
    assert scenario["environment"]["type"] == "white_test_floor"


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
    assert payload["frames"][0]["lidar_preview_url"].endswith(".png")
