from __future__ import annotations

import json
import re
import shutil
import zipfile
from pathlib import Path
from xml.etree import ElementTree

import pybullet as p
from fastapi import UploadFile

from .models import RobotAsset
from .store import store


MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_EXTRACTED_BYTES = 100 * 1024 * 1024
MAX_ARCHIVE_FILES = 200
ALLOWED_PACKAGE_SUFFIXES = {
    ".urdf",
    ".obj",
    ".stl",
    ".dae",
    ".mtl",
    ".png",
    ".jpg",
    ".jpeg",
}
ASSET_REF_PATTERN = re.compile(
    r"^asset://robots/(?P<asset_id>[a-zA-Z0-9_-]+)/(?P<entrypoint>.+\.urdf)$"
)


def _safe_name(value: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip("-._")
    return clean[:96] or "robot.urdf"


def _safe_archive_path(root: Path, member_name: str) -> Path:
    target = (root / member_name).resolve()
    if root.resolve() not in target.parents:
        raise ValueError("Robot package contains an unsafe path")
    return target


def _validate_urdf(entrypoint: Path) -> None:
    try:
        root = ElementTree.parse(entrypoint).getroot()
    except ElementTree.ParseError as exc:
        raise ValueError(f"URDF XML is invalid: {exc}") from exc
    if root.tag != "robot":
        raise ValueError("URDF entrypoint must contain a <robot> root element")

    client = p.connect(p.DIRECT)
    try:
        p.setAdditionalSearchPath(str(entrypoint.parent))
        body_id = p.loadURDF(str(entrypoint), useFixedBase=True)
        if body_id < 0:
            raise ValueError("PyBullet could not load the URDF")
    except p.error as exc:
        raise ValueError(
            "PyBullet could not load this URDF. Include referenced meshes and "
            "textures in a ZIP using relative paths."
        ) from exc
    finally:
        p.disconnect(client)


def _write_metadata(asset_dir: Path, asset: RobotAsset) -> None:
    (asset_dir / "asset.json").write_text(asset.model_dump_json(indent=2))


def list_robot_assets() -> list[RobotAsset]:
    root = store.artifact_root / "robot_assets"
    if not root.is_dir():
        return []
    assets = []
    for metadata_path in sorted(root.glob("*/asset.json")):
        try:
            assets.append(RobotAsset.model_validate_json(metadata_path.read_text()))
        except (OSError, ValueError):
            continue
    return assets


async def save_robot_asset(upload: UploadFile) -> RobotAsset:
    filename = _safe_name(upload.filename or "robot.urdf")
    suffix = Path(filename).suffix.lower()
    if suffix not in {".urdf", ".zip"}:
        raise ValueError("Upload a .urdf file or a .zip containing one URDF package")

    payload = await upload.read(MAX_UPLOAD_BYTES + 1)
    if len(payload) > MAX_UPLOAD_BYTES:
        raise ValueError("Robot packages must be 25 MB or smaller")

    asset_id = store.new_id("robot")
    asset_dir = store.robot_asset_dir(asset_id)
    package_dir = asset_dir / "package"
    package_dir.mkdir()
    try:
        if suffix == ".urdf":
            entrypoint = package_dir / filename
            entrypoint.write_bytes(payload)
        else:
            archive_path = asset_dir / "upload.zip"
            archive_path.write_bytes(payload)
            with zipfile.ZipFile(archive_path) as archive:
                files = [item for item in archive.infolist() if not item.is_dir()]
                if len(files) > MAX_ARCHIVE_FILES:
                    raise ValueError("Robot package contains too many files")
                if sum(item.file_size for item in files) > MAX_EXTRACTED_BYTES:
                    raise ValueError("Expanded robot package must be 100 MB or smaller")
                for item in files:
                    item_suffix = Path(item.filename).suffix.lower()
                    if item_suffix not in ALLOWED_PACKAGE_SUFFIXES:
                        raise ValueError(
                            f"Unsupported file in robot package: {item.filename}"
                        )
                    destination = _safe_archive_path(package_dir, item.filename)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(item) as source, destination.open("wb") as target:
                        shutil.copyfileobj(source, target)
            urdf_files = sorted(package_dir.rglob("*.urdf"))
            if len(urdf_files) != 1:
                raise ValueError("Robot ZIP must contain exactly one .urdf entrypoint")
            entrypoint = urdf_files[0]

        _validate_urdf(entrypoint)
        relative_entrypoint = entrypoint.relative_to(package_dir).as_posix()
        asset = RobotAsset(
            asset_id=asset_id,
            name=Path(relative_entrypoint).stem.replace("_", " ").replace("-", " ").title(),
            format="urdf",
            asset_ref=f"asset://robots/{asset_id}/{relative_entrypoint}",
            entrypoint=relative_entrypoint,
            file_count=sum(1 for path in package_dir.rglob("*") if path.is_file()),
        )
        _write_metadata(asset_dir, asset)
        return asset
    except Exception:
        shutil.rmtree(asset_dir, ignore_errors=True)
        raise


def resolve_robot_asset(asset_ref: str) -> Path:
    match = ASSET_REF_PATTERN.fullmatch(asset_ref)
    if not match:
        raise ValueError("Invalid robot asset reference")
    package_dir = (
        store.artifact_root / "robot_assets" / match.group("asset_id") / "package"
    ).resolve()
    entrypoint = (package_dir / match.group("entrypoint")).resolve()
    if package_dir not in entrypoint.parents or not entrypoint.is_file():
        raise ValueError("Robot asset is missing")
    return entrypoint
