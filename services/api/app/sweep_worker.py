from __future__ import annotations

import argparse
import itertools
import json
from pathlib import Path

from .models import RunManifest, ScenarioV01, SweepSpecification
from .sweeps import _local_variant


def execute_sweep(
    scenario_path: Path, specification_path: Path, output_path: Path
) -> None:
    scenario = ScenarioV01.model_validate_json(scenario_path.read_text())
    specification = SweepSpecification.model_validate_json(
        specification_path.read_text()
    )
    run = RunManifest(run_id="cloud_worker", status="running", scenario=scenario)
    first, second = specification.axes
    results = [
        _local_variant(
            run,
            f"variant_{index:03d}",
            {first.name: values[0], second.name: values[1]},
        )
        for index, values in enumerate(
            itertools.product(first.values, second.values)
        )
    ]
    payload = {
        "status": "completed",
        "results": [result.model_dump() for result in results],
        "success_rate": (
            sum(1 for result in results if result.success) / len(results)
            if results
            else 0.0
        ),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Execute a FailureCloud parameter sweep in a cloud worker."
    )
    parser.add_argument("--scenario", type=Path, required=True)
    parser.add_argument("--specification", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    execute_sweep(args.scenario, args.specification, args.output)


if __name__ == "__main__":
    main()
