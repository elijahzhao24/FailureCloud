from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


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

