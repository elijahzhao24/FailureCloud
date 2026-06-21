from __future__ import annotations

import json
import os
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class NebiusStatus:
    project_configured: bool
    region: str
    endpoint: str
    credentials_file_configured: bool
    credentials_file_exists: bool
    credentials_file_valid: bool
    cli_available: bool
    job_image_configured: bool
    auth_ready: bool
    submission_ready: bool
    message: str

    def public_dict(self) -> dict[str, str | bool]:
        return asdict(self)


def _credentials_file_valid(path: Path) -> bool:
    try:
        payload = json.loads(path.read_text())
        credentials = payload["subject-credentials"]
        required = {"type", "alg", "private-key", "kid", "iss", "sub"}
        return isinstance(credentials, dict) and required.issubset(credentials)
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return False


def nebius_status() -> NebiusStatus:
    project_id = os.getenv("NEBIUS_PROJECT_ID", "").strip()
    region = os.getenv("NEBIUS_REGION", "eu-north1").strip()
    endpoint = os.getenv(
        "NEBIUS_EXECUTION_ENDPOINT", "api.nebius.cloud:443"
    ).strip()
    endpoint = endpoint.removeprefix("https://").removeprefix("http://").rstrip("/")
    if ":" not in endpoint:
        endpoint = f"{endpoint}:443"
    key_value = os.getenv("NEBIUS_SERVICE_ACCOUNT_KEY_FILE", "").strip()
    key_path = Path(key_value).expanduser() if key_value else None
    key_exists = bool(key_path and key_path.is_file())
    key_valid = bool(key_path and key_exists and _credentials_file_valid(key_path))
    cli_path = os.getenv("NEBIUS_CLI_PATH", "nebius").strip() or "nebius"
    cli_available = shutil.which(cli_path) is not None
    job_image = os.getenv("NEBIUS_JOB_IMAGE", "").strip()
    auth_ready = bool(project_id and region and key_valid)
    submission_ready = bool(auth_ready and cli_available and job_image)

    if submission_ready:
        message = "Nebius CLI authentication and job image are configured."
    elif not auth_ready:
        message = (
            "Set a project, region, and valid service-account credentials file."
        )
    elif not cli_available:
        message = "Credentials are valid; install the Nebius CLI next."
    else:
        message = (
            "Authentication is ready; publish the worker image and set "
            "NEBIUS_JOB_IMAGE before submitting jobs."
        )

    return NebiusStatus(
        project_configured=bool(project_id),
        region=region,
        endpoint=endpoint,
        credentials_file_configured=bool(key_value),
        credentials_file_exists=key_exists,
        credentials_file_valid=key_valid,
        cli_available=cli_available,
        job_image_configured=bool(job_image),
        auth_ready=auth_ready,
        submission_ready=submission_ready,
        message=message,
    )
