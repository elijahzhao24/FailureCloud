from __future__ import annotations

import hashlib
import html
import json
import os
import threading
from pathlib import Path

import httpx

from .models import ScenarioV01, VisualPreviewStatus
from .store import store


_preview_cache: dict[str, str] = {}


def _scenario_hash(scenario: ScenarioV01) -> str:
    payload = scenario.model_dump_json(by_alias=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:20]


def _fallback_poster(path: Path, scenario: ScenarioV01) -> None:
    box = next(obj for obj in scenario.objects if obj.class_name == "obstacle")
    title = html.escape(scenario.name.upper())
    subtitle = html.escape(
        f"μ {scenario.environment.physics.floor_friction:.2f} · "
        f"{scenario.robot.speed_mps:.2f} M/S · SYNTHETIC WORLD PREVIEW"
    )
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071012"/><stop offset="1" stop-color="#17252a"/></linearGradient>
  <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#315058" stroke-width="1"/></pattern>
  <filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="1280" height="720" fill="url(#bg)"/><rect width="1280" height="720" fill="url(#grid)" opacity=".35"/>
<path d="M120 590 L1130 590 L970 290 L290 290 Z" fill="#142226" stroke="#5d8188" stroke-width="2"/>
<path d="M170 550 C360 545 420 420 610 465 S870 370 1080 355" fill="none" stroke="#44f1db" stroke-width="8" stroke-dasharray="20 18" filter="url(#glow)"/>
<rect x="{420 + box.pose.position.x * 80:.0f}" y="{470 - box.pose.position.y * 70:.0f}" width="95" height="84" rx="4" fill="#ef5b2a" stroke="#ffb28f" stroke-width="3" transform="skewY(-8)"/>
<g transform="translate(275 506)"><rect width="115" height="64" rx="16" fill="#36dbc7"/><rect x="24" y="-35" width="68" height="38" rx="8" fill="#a9fff2"/><circle cx="24" cy="68" r="18" fill="#071012"/><circle cx="92" cy="68" r="18" fill="#071012"/></g>
<g transform="translate(875 300)"><rect width="42" height="120" rx="18" fill="#f2c94c"/><circle cx="21" cy="-17" r="22" fill="#ffe8a3"/></g>
<text x="70" y="92" fill="#e7faf7" font-family="monospace" font-size="50" font-weight="700">{title}</text>
<text x="73" y="135" fill="#58b8b0" font-family="monospace" font-size="20">{subtitle}</text>
<text x="1015" y="665" fill="#efc54a" font-family="monospace" font-size="18">ILLUSTRATIVE · NOT PHYSICS</text>
</svg>"""
    path.write_text(svg)


def create_preview(scenario: ScenarioV01) -> VisualPreviewStatus:
    scenario_key = _scenario_hash(scenario)
    with store.lock:
        cached_id = _preview_cache.get(scenario_key)
        if cached_id and cached_id in store.previews:
            return store.previews[cached_id]
        preview_id = store.new_id("preview")
        status = VisualPreviewStatus(
            preview_id=preview_id,
            status="queued",
            provider="reactor" if os.getenv("REACTOR_API_URL") else "local_fallback",
        )
        store.previews[preview_id] = status
        _preview_cache[scenario_key] = preview_id
    threading.Thread(
        target=_generate_preview, args=(preview_id, scenario), daemon=True
    ).start()
    return status


def _generate_preview(preview_id: str, scenario: ScenarioV01) -> None:
    with store.lock:
        store.previews[preview_id].status = "generating"
    target_dir = store.preview_dir(preview_id)
    poster_path = target_dir / "cinematic-preview.svg"
    try:
        api_url = os.getenv("REACTOR_API_URL")
        api_key = os.getenv("REACTOR_API_KEY")
        if api_url and api_key:
            prompt = (
                "Cinematic industrial warehouse robotics test. A compact cyan mobile "
                "robot carries a cup around an orange dropped box on a visibly wet floor "
                "while a worker crosses the aisle. Technical, realistic, no text overlays."
            )
            response = httpx.post(
                api_url,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "prompt": prompt,
                    "scenario": scenario.model_dump(by_alias=True),
                    "duration_seconds": 5,
                    "aspect_ratio": "16:9",
                },
                timeout=45,
            )
            response.raise_for_status()
            payload = response.json()
            media_url = payload.get("media_url") or payload.get("output_url")
            if not media_url:
                raise ValueError("Reactor response did not contain a media URL")
            _fallback_poster(poster_path, scenario)
            with store.lock:
                current = store.previews[preview_id]
                current.status = "completed"
                current.provider = "reactor"
                current.media_url = media_url
                current.poster_url = f"/artifacts/previews/{preview_id}/{poster_path.name}"
            (target_dir / "normalized-response.json").write_text(
                json.dumps(
                    {
                        "preview_id": preview_id,
                        "provider": "reactor",
                        "media_url": media_url,
                        "illustrative_only": True,
                    },
                    indent=2,
                )
            )
            return

        _fallback_poster(poster_path, scenario)
        with store.lock:
            current = store.previews[preview_id]
            current.status = "completed"
            current.provider = "local_fallback"
            current.media_url = f"/artifacts/previews/{preview_id}/{poster_path.name}"
            current.poster_url = current.media_url
    except Exception as exc:
        _fallback_poster(poster_path, scenario)
        with store.lock:
            current = store.previews[preview_id]
            current.status = "completed"
            current.provider = "local_fallback"
            current.media_url = f"/artifacts/previews/{preview_id}/{poster_path.name}"
            current.poster_url = current.media_url
            current.error = f"Reactor unavailable; generated local cinematic fallback: {exc}"

