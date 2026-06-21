from __future__ import annotations

from app.compiler import compile_prompt, validate_payload


def test_deterministic_compiler_emits_valid_scenario():
    response = compile_prompt(
        "Create a fast warehouse robot carrying water over a very slippery floor."
    )

    assert response.compiler == "deterministic"
    assert response.validation_report.valid
    assert response.scenario.environment.physics.floor_friction == 0.1
    assert response.scenario.robot.speed_mps == 1.2
    assert response.scenario.schema_version == "0.1.0"
    assert {item.id for item in response.scenario.objects} == {"cup_1", "box_1"}


def test_validation_rejects_duplicate_instance_ids():
    scenario = compile_prompt("Create a warehouse robot carry task.").scenario
    payload = scenario.model_dump(by_alias=True)
    payload["dynamic_actors"][0]["id"] = "cup_1"

    normalized, report = validate_payload(payload)

    assert normalized is None
    assert not report.valid
    assert any("globally unique" in issue.message for issue in report.issues)

