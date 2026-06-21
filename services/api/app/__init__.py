"""FailureCloud API package."""

from pathlib import Path

from dotenv import load_dotenv


for parent in Path(__file__).resolve().parents:
    env_file = parent / ".env"
    if env_file.is_file():
        load_dotenv(env_file, override=False)
        break
