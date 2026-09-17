"""Zip compress / extract with zip-slip protection."""

from __future__ import annotations

import os
import threading
import zipfile
from pathlib import Path

JOB_LOCK = threading.Lock()
JOB: dict = {
    "active": False,
    "kind": "",
    "done": 0,
    "total": 0,
    "current": "",
    "error": "",
    "ok": False,
    "result": {},
}


def job_snapshot() -> dict:
    with JOB_LOCK:
        return dict(JOB)


def _set_job(**fields) -> None:
    with JOB_LOCK:
        JOB.update(fields)


def _count_zip_entries(abs_paths: list[str]) -> int:
    total = 0
    for abs_path in abs_paths:
        if os.path.isfile(abs_path):
            total += 1
        elif os.path.isdir(abs_path):
            for root, _, files in os.walk(abs_path):
                total += len(files)
    return max(total, 1)


def _unique_zip_path(directory: str, base: str) -> str:
    directory = os.path.abspath(directory)
    base = base if base.lower().endswith(".zip") else f"{base}.zip"
    candidate = os.path.join(directory, base)
    if not os.path.exists(candidate):
        return candidate
    stem = base[:-4] if base.lower().endswith(".zip") else base
    for index in range(1, 1000):
        name = f"{stem} ({index}).zip"
        candidate = os.path.join(directory, name)
        if not os.path.exists(candidate):
            return candidate
    raise RuntimeError("Could not choose a unique archive name")


def _default_zip_name(abs_paths: list[str]) -> str:
    if len(abs_paths) == 1:
        return os.path.basename(abs_paths[0].rstrip(os.sep))
    return "Archive"


def _safe_extract_member(zf: zipfile.ZipFile, member: zipfile.ZipInfo, dest: Path) -> None:
    target = (dest / member.filename).resolve()
    dest_resolved = dest.resolve()
    try:
        target.relative_to(dest_resolved)
    except ValueError as exc:
        raise ValueError(f"Unsafe archive entry: {member.filename}") from exc
    if member.is_dir() or member.filename.endswith("/"):
        target.mkdir(parents=True, exist_ok=True)
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    with zf.open(member, "r") as src, open(target, "wb") as out:
        while True:
            chunk = src.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)


def run_compress(abs_paths: list[str], dest_zip_abs: str) -> dict:
    total = _count_zip_entries(abs_paths)
    _set_job(
        active=True,
        kind="compress",
        done=0,
        total=total,
        current="",
        error="",
        ok=False,
        result={},
    )
    try:
        dest_zip_abs = os.path.abspath(dest_zip_abs)
        os.makedirs(os.path.dirname(dest_zip_abs) or ".", exist_ok=True)
        done = 0
        with zipfile.ZipFile(dest_zip_abs, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for abs_path in abs_paths:
                root_name = os.path.basename(abs_path.rstrip(os.sep))
                if os.path.isfile(abs_path):
                    _set_job(current=root_name)
                    zf.write(abs_path, root_name)
                    done += 1
                    _set_job(done=done)
                elif os.path.isdir(abs_path):
                    for walk_root, _, files in os.walk(abs_path):
                        for filename in files:
                            full = os.path.join(walk_root, filename)
                            rel = os.path.relpath(full, abs_path)
                            arc = os.path.join(root_name, rel).replace("\\", "/")
                            _set_job(current=arc)
                            zf.write(full, arc)
                            done += 1
                            _set_job(done=done)
                else:
                    raise ValueError(f"Not a file or folder: {abs_path}")
        _set_job(active=False, ok=True, current="", result={"path": dest_zip_abs})
        return {"ok": True, "path": dest_zip_abs}
    except Exception as exc:
        _set_job(active=False, ok=False, error=str(exc))
        return {"ok": False, "error": str(exc)}


def run_extract(zip_abs: str, dest_dir_abs: str) -> dict:
    _set_job(
        active=True,
        kind="extract",
        done=0,
        total=1,
        current="",
        error="",
        ok=False,
        result={},
    )
    try:
        dest = Path(dest_dir_abs).resolve()
        dest.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_abs, "r") as zf:
            members = [m for m in zf.infolist() if m.filename]
            total = max(len(members), 1)
            _set_job(total=total, done=0)
            for index, member in enumerate(members, start=1):
                _set_job(current=member.filename, done=index - 1)
                _safe_extract_member(zf, member, dest)
                _set_job(done=index)
        _set_job(active=False, ok=True, current="", result={"path": str(dest)})
        return {"ok": True, "path": str(dest)}
    except Exception as exc:
        _set_job(active=False, ok=False, error=str(exc))
        return {"ok": False, "error": str(exc)}


def start_compress_thread(abs_paths: list[str], dest_zip_abs: str) -> dict:
    with JOB_LOCK:
        if JOB["active"]:
            return {"ok": False, "error": "Another archive task is already running"}
    threading.Thread(
        target=run_compress,
        args=(abs_paths, dest_zip_abs),
        daemon=True,
        name="kuusi-compress",
    ).start()
    return {"ok": True}


def start_extract_thread(zip_abs: str, dest_dir_abs: str) -> dict:
    with JOB_LOCK:
        if JOB["active"]:
            return {"ok": False, "error": "Another archive task is already running"}
    threading.Thread(
        target=run_extract,
        args=(zip_abs, dest_dir_abs),
        daemon=True,
        name="kuusi-extract",
    ).start()
    return {"ok": True}


def plan_compress(
    abs_paths: list[str],
    dest_dir_abs: str,
    dest_name: str | None,
) -> str:
    name = (dest_name or _default_zip_name(abs_paths)).strip()
    if not name:
        name = "Archive"
    if name.lower().endswith(".zip"):
        name = name[:-4]
    return _unique_zip_path(dest_dir_abs, name)


def plan_extract_dest(zip_abs: str) -> str:
    parent = os.path.dirname(os.path.abspath(zip_abs))
    stem = os.path.splitext(os.path.basename(zip_abs))[0] or "archive"
    candidate = os.path.join(parent, f"{stem}_extracted")
    if not os.path.exists(candidate):
        return candidate
    for index in range(1, 1000):
        path = os.path.join(parent, f"{stem}_extracted ({index})")
        if not os.path.exists(path):
            return path
    raise RuntimeError("Could not choose a unique extract folder")
