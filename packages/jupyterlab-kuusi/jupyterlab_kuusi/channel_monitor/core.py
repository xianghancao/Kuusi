#!/usr/bin/env python3
"""Local dashboard: channel stats, toggles, dual-pane copy."""

from __future__ import annotations

import json
import os
import plistlib
import re
import socket
import subprocess
import threading
import time
from pathlib import Path
from urllib.parse import quote, urlencode
import urllib.error
import urllib.request
import sys

from .i18n import LANG_LABELS, LANGS, STRINGS, lang, set_lang, t

IS_WIN = sys.platform == "win32"
if IS_WIN:
    from . import winops

HERE = Path(__file__).resolve().parent
STATIC_DIR = HERE / "static"
HOME = Path.home().resolve()
VOLUMES = Path("C:/") if IS_WIN else Path("/Volumes").resolve()


def _data_dir() -> Path:
    root = Path.home() / ".kuusi" / "channel-monitor"
    root.mkdir(parents=True, exist_ok=True)
    return root


PEER_FILE = _data_dir() / "peer.json"
LOCAL_VOLUMES = {"Macintosh HD", "Macintosh HD - Data"}
IFACE_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9]*$")
SKIP = {
    "lo0",
    "gif0",
    "stf0",
    "ap1",
    "awdl0",
    "llw0",
    "utun0",
    "utun1",
    "utun2",
    "utun3",
    "anpi0",
    "anpi1",
    "en1",
    "en2",
}

JOB_LOCK = threading.Lock()
JOB = {
    "active": False,
    "direction": "",
    "current": "",
    "done": 0,
    "total": 0,
    "error": "",
    "ok": False,
    "warning": "",
}
POWER_CACHE = {"t": 0.0, "v": {}}
DISK_IO = {"t": 0.0, "mb": {}}
USB_CACHE = {"t": 0.0, "map": {}}
NSMB_BODY = "[default]\nsigning_required=no\nprotocol_vers_map=6\nport445=no_netbios\n"


def sh(*args: str, timeout: float | None = None) -> str:
    r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    return r.stdout


def classify(name: str) -> tuple[str, str]:
    if name == "bridge0":
        return "thunderbolt", t("role.thunderbolt")
    if name == "en0":
        return "wifi", t("role.wifi")
    if name.startswith("en"):
        return "usb", t("role.usb")
    return "other", name


def iface_ip(name: str) -> str:
    if IS_WIN:
        return winops.iface_ip(name)
    r = subprocess.run(["ipconfig", "getifaddr", name], capture_output=True, text=True)
    return r.stdout.strip()


def iface_status(name: str) -> str:
    if IS_WIN:
        return winops.iface_status(name)
    out = sh("ifconfig", name)
    if "status: active" in out:
        return "active"
    if "status: inactive" in out:
        return "inactive"
    return "unknown"


def stats() -> dict:
    if IS_WIN:
        return {
            "interfaces": winops.iface_stats(),
            "disks": disks(),
            "power": power(),
            "smb": smb_status(),
            "os": "windows",
        }
    rows = []
    for line in sh("netstat", "-ibn").splitlines():
        parts = line.split()
        if len(parts) < 10 or "<Link" not in parts[2]:
            continue
        name = parts[0]
        if name in SKIP or name.startswith("utun"):
            continue
        try:
            ibytes = int(parts[6])
            obytes = int(parts[9])
        except ValueError:
            continue
        role, label = classify(name)
        status = iface_status(name)
        ip = iface_ip(name)
        if name not in {"bridge0", "en0"} and status != "active" and not ip and ibytes == 0 and obytes == 0:
            continue
        rows.append(
            {
                "id": name,
                "label": label,
                "role": role,
                "status": status,
                "ip": ip,
                "ibytes": ibytes,
                "obytes": obytes,
            }
        )
    order = {"thunderbolt": 0, "usb": 1, "wifi": 2, "other": 3}
    rows.sort(key=lambda r: (order.get(r["role"], 9), r["id"]))
    return {"interfaces": rows, "disks": disks(), "power": power(), "smb": smb_status(), "os": "mac"}


def _plist(*args: str):
    r = subprocess.run(["diskutil", *args], capture_output=True, timeout=8)
    if r.returncode != 0 or not r.stdout:
        return None
    try:
        return plistlib.loads(r.stdout)
    except Exception:
        return None


def iostat_cum_mb() -> dict[str, float]:
    out = sh("iostat", "-I", "-d", timeout=2)
    lines = [ln for ln in out.splitlines() if ln.strip()]
    if len(lines) < 3:
        return {}
    names = re.findall(r"disk\d+", lines[0])
    nums = re.findall(r"\d+\.\d+|\d+", lines[-1])
    got: dict[str, float] = {}
    if names and len(nums) >= 3 * len(names):
        for i, name in enumerate(names):
            try:
                got[name] = float(nums[i * 3 + 2])
            except (ValueError, IndexError):
                pass
    return got


def disk_rates() -> dict[str, float]:
    now = time.time()
    cur = iostat_cum_mb()
    prev_t = DISK_IO["t"]
    prev = DISK_IO["mb"]
    DISK_IO["t"] = now
    DISK_IO["mb"] = cur
    dt = (now - prev_t) if prev_t else 0
    rates: dict[str, float] = {}
    for name, mb in cur.items():
        if dt > 0.2 and name in prev:
            rates[name] = max(0.0, (mb - prev[name]) * 1024 * 1024 / dt)
        else:
            rates[name] = 0.0
    return rates


def walk_profiler(obj, acc: dict, speed=None, name=None) -> None:
    if isinstance(obj, dict):
        speed = obj.get("speed") or obj.get("current_speed_key") or speed
        name = obj.get("_name") or obj.get("device_name_key") or name
        bsd = obj.get("bsd_name")
        if isinstance(bsd, str) and bsd.startswith("disk"):
            acc[bsd] = {"speed": speed or "", "name": name or ""}
            whole = re.match(r"(disk\d+)", bsd)
            if whole and whole.group(1) not in acc:
                acc[whole.group(1)] = acc[bsd]
        for val in obj.values():
            walk_profiler(val, acc, speed, name)
    elif isinstance(obj, list):
        for item in obj:
            walk_profiler(item, acc, speed, name)


def usb_thunder_map() -> dict:
    now = time.time()
    if USB_CACHE["t"] and now - USB_CACHE["t"] < 6:
        return USB_CACHE["map"]
    acc: dict = {}
    for typ in ("SPUSBDataType", "SPThunderboltDataType"):
        try:
            r = subprocess.run(
                ["system_profiler", typ, "-json"],
                capture_output=True,
                timeout=12,
            )
            data = json.loads(r.stdout or b"{}")
            walk_profiler(data.get(typ) or [], acc)
        except Exception:
            pass
    USB_CACHE.update(t=now, map=acc)
    return acc


def parse_link(speed: str, proto: str, ssd: bool) -> tuple[str, str, int, str]:
    """role, label, cap_mbs, link_text."""
    text = (speed or proto or "").strip()
    low = text.lower()
    if "480" in low and "mb" in low:
        return "usb2", "USB 2.0", 35, text
    if re.search(r"\b12\s*mb", low):
        return "usb2", "USB 2.0", 1, text
    gb = None
    m = re.search(r"([\d.]+)\s*gb/s", low)
    if m:
        try:
            gb = float(m.group(1))
        except ValueError:
            gb = None
    if gb is not None and gb <= 5.5 and ("usb" in low or proto == "USB"):
        return "usb3", "USB 3.0", 400 if ssd else 150, text
    if gb is not None and gb <= 10.5 and ("usb" in low or proto == "USB"):
        return "usb3", "USB 3.1", 800 if ssd else 150, text
    if gb is not None and gb <= 20.5 and proto == "USB":
        return "usb3", "USB 3.2", 1200 if ssd else 150, text
    if proto in {"Apple Fabric", "PCI", "PCI-Express"}:
        return ("internal", t("role.internal") if ssd else t("role.internal_hdd"), 2500 if ssd else 150, proto)
    if "thunder" in proto.lower() or (gb is not None and gb >= 20):
        return "disk_tb", t("role.disk_tb"), 2000 if ssd else 150, text or proto
    if proto == "USB":
        if ssd:
            return "usb3", "USB", 400, text or "USB"
        return "usb2", "USB", 35, text or "USB"
    if not ssd:
        return "hdd", t("role.hdd"), 150, proto or text
    return "other", proto or t("role.other"), 500, proto or text


def disk_note(role: str, ssd: bool, cap: int, rate_mbs: float) -> str:
    if role == "usb2":
        return t("note.usb2")
    if not ssd:
        return t("note.hdd")
    if role == "internal":
        return t("note.internal")
    if role == "disk_tb":
        return t("note.tb")
    if cap and rate_mbs > 2 and rate_mbs < cap * 0.2:
        return t("note.slow_cap", cap=cap)
    if role == "usb3":
        return t("note.usb3")
    return ""


def disks() -> list[dict]:
    if IS_WIN:
        return winops.disks()
    rates = disk_rates()
    links = usb_thunder_map()
    listed = _plist("list", "-plist") or {}
    rows = []
    seen = set()
    candidates = []
    for item in listed.get("AllDisksAndPartitions") or []:
        ident = item.get("DeviceIdentifier")
        if ident:
            candidates.append(ident)
    for child in sorted(VOLUMES.iterdir()) if VOLUMES.exists() else []:
        if child.name.startswith("."):
            continue
        info = _plist("info", "-plist", str(child))
        parent = (info or {}).get("ParentWholeDisk")
        if parent:
            candidates.append(parent)
    for ident in candidates:
        if ident in seen:
            continue
        seen.add(ident)
        info = _plist("info", "-plist", ident)
        if not info:
            continue
        if info.get("BusProtocol") in {"Disk Image"}:
            continue
        if str(info.get("VirtualOrPhysical") or "") == "Virtual":
            continue
        size = int(info.get("TotalSize") or 0)
        internal = bool(info.get("Internal"))
        external = bool(info.get("RemovableMediaOrExternalDevice"))
        if internal and not external and size < 16 * 1024 ** 3:
            continue
        if internal and not external and info.get("BusProtocol") not in {"Apple Fabric", "PCI", "PCI-Express"}:
            if info.get("BusProtocol") == "Apple File System":
                continue
        ssd = bool(info.get("SolidState"))
        proto = str(info.get("BusProtocol") or "")
        media_name = str(info.get("MediaName") or "")
        if internal and not external and "APFS" in media_name.upper():
            continue
        link = links.get(ident) or {}
        role, label, cap, link_text = parse_link(str(link.get("speed") or ""), proto, ssd)
        if internal and not external and role != "internal":
            if proto in {"Apple Fabric", "PCI", "PCI-Express"}:
                role, label, cap, link_text = parse_link("", proto, ssd)
        if internal and not external and role != "internal":
            continue
        vols = []
        mp = str(info.get("MountPoint") or "")
        vn = str(info.get("VolumeName") or "")
        if vn and mp.startswith("/Volumes/"):
            vols.append(vn)
        if VOLUMES.exists():
            for child in VOLUMES.iterdir():
                if child.name.startswith(".") or child.name in LOCAL_VOLUMES:
                    continue
                inf = _plist("info", "-plist", str(child))
                if inf and inf.get("ParentWholeDisk") == ident:
                    if child.name not in vols:
                        vols.append(child.name)
        name = link.get("name") or media_name or (vols[0] if vols else ident)
        rate = rates.get(ident, 0.0)
        rate_mbs = rate / 1024 / 1024
        note = disk_note(role, ssd, cap, rate_mbs)
        rows.append(
            {
                "id": ident,
                "kind": "disk",
                "label": str(name)[:40],
                "role": role,
                "status": "active",
                "volumes": vols,
                "media": "ssd" if ssd else "hdd",
                "link": link_text,
                "cap": cap * 1024 * 1024,
                "rate": int(rate),
                "total": int(rate),
                "note": note,
                "internal": internal and not external,
            }
        )
    order = {"usb2": 0, "hdd": 1, "usb3": 2, "disk_tb": 3, "internal": 4, "other": 5}
    rows.sort(key=lambda r: (0 if not r["internal"] else 1, order.get(r["role"], 9), r["id"]))
    return rows


def _adapter_label(item: dict) -> str:
    name = str(item.get("Name") or item.get("Description") or "")
    if name.lower() in {"pd charger", "pd"}:
        return t("power.peer_src")
    return name or t("power.unknown")


def power() -> dict:
    if IS_WIN:
        return winops.power()
    now = time.time()
    if now - POWER_CACHE["t"] < 2 and POWER_CACHE.get("lang") == lang() and POWER_CACHE["v"]:
        return POWER_CACHE["v"]
    out = {
        "ok": False,
        "percent": None,
        "charging": False,
        "external": False,
        "primary": None,
        "adapters": [],
        "peer_watts": None,
        "can_toggle": False,
        "note": t("power.note"),
    }
    try:
        r = subprocess.run(
            ["ioreg", "-rw0", "-c", "AppleSmartBattery", "-a"],
            capture_output=True,
            timeout=2,
        )
        if r.returncode != 0 or not r.stdout:
            POWER_CACHE.update(t=now, v=out, lang=lang())
            return out
        data = plistlib.loads(r.stdout)
        batt = data[0] if data else {}
        details = batt.get("AdapterDetails") or {}
        raw = batt.get("AppleRawAdapterDetails") or []
        battery_data = batt.get("BatteryData") or {}
        adapters = []
        peer_watts = None
        for item in raw:
            if not isinstance(item, dict):
                continue
            watts = item.get("Watts")
            name = str(item.get("Name") or item.get("Description") or "")
            is_peer = name.lower() in {"pd charger", "pd"} or (
                not item.get("Name") and "pd" in name.lower()
            )
            if is_peer and isinstance(watts, int):
                peer_watts = watts
            adapters.append(
                {
                    "label": _adapter_label(item),
                    "watts": watts,
                    "peer": is_peer,
                    "voltage_mv": item.get("AdapterVoltage"),
                    "current_ma": item.get("Current"),
                }
            )
        out.update(
            {
                "ok": True,
                "percent": battery_data.get("StateOfCharge", batt.get("CurrentCapacity")),
                "charging": bool(batt.get("IsCharging")),
                "external": bool(batt.get("ExternalConnected")),
                "primary": {
                    "label": details.get("Name") or t("power.external"),
                    "watts": details.get("Watts"),
                }
                if details
                else None,
                "adapters": adapters,
                "peer_watts": peer_watts,
            }
        )
    except Exception:
        pass
    POWER_CACHE.update(t=now, v=out, lang=lang())
    return out


def smb_status() -> dict:
    if IS_WIN:
        return winops.smb_status()
    conf = Path("/etc/nsmb.conf")
    text = ""
    try:
        text = conf.read_text() if conf.exists() else ""
    except OSError:
        text = ""
    compact = text.replace(" ", "")
    signing_required = "signing_required=no" not in compact
    signing_live = None
    share_count = 0
    try:
        raw = sh("smbutil", "statshares", "-a", timeout=2)
    except subprocess.TimeoutExpired:
        raw = ""
    if "SIGNING_ON" in raw:
        signing_live = bool(re.search(r"SIGNING_ON\s+TRUE", raw))
        share_count = raw.count("SERVER_NAME")
    return {
        "conf_exists": bool(text),
        "signing_required": signing_required,
        "signing_on": signing_live,
        "shares": share_count,
        "note": t("smb.note"),
    }


def smb_tune() -> dict:
    if IS_WIN:
        return winops.smb_tune()
    tmp = Path("/tmp/phd-os-nsmb.conf")
    try:
        tmp.write_text(NSMB_BODY)
    except OSError as e:
        return {"ok": False, "error": str(e)}
    script = (
        'do shell script "cp /tmp/phd-os-nsmb.conf /etc/nsmb.conf && chmod 644 /etc/nsmb.conf" '
        "with administrator privileges"
    )
    r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if r.returncode != 0:
        err = (r.stderr or r.stdout or t("err.cancelled")).strip()
        return {"ok": False, "error": err}
    return {
        "ok": True,
        "message": t("smb.tuned"),
    }


def cloud_note(*paths: Path) -> str:
    for path in paths:
        s = str(path)
        if "GoogleDrive" in s or "CloudStorage" in s or "OneDrive" in s:
            return t("cloud.warn")
    return ""


def toggle(name: str, action: str) -> dict:
    if IS_WIN:
        return winops.toggle(name, action)
    if not IFACE_RE.match(name) or name in SKIP or name.startswith("utun"):
        return {"ok": False, "error": t("err.bad_iface")}
    if action not in {"up", "down"}:
        return {"ok": False, "error": t("err.bad_action")}
    script = f'do shell script "ifconfig {name} {action}" with administrator privileges'
    r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if r.returncode != 0:
        err = (r.stderr or r.stdout or t("err.cancelled")).strip()
        return {"ok": False, "error": err}
    return {"ok": True}


def allowed_roots() -> list[Path]:
    if IS_WIN:
        return winops.drive_roots() or [HOME]
    roots = [HOME]
    if VOLUMES.exists():
        roots.append(VOLUMES)
    return roots


def allowed(path: Path) -> bool:
    try:
        p = path.expanduser().resolve()
    except OSError:
        return False
    for root in allowed_roots():
        try:
            p.relative_to(root)
            return True
        except ValueError:
            continue
    return False


def list_dir(raw: str) -> dict:
    path = Path(raw).expanduser()
    if not raw:
        path = HOME
    if not allowed(path):
        return {"ok": False, "error": t("err.bad_path")}
    path = path.resolve()
    if not path.exists():
        return {"ok": False, "error": t("err.no_path")}
    if not path.is_dir():
        return {"ok": False, "error": t("err.not_dir")}
    items = []
    try:
        entries = list(path.iterdir())
    except OSError as e:
        return {"ok": False, "error": str(e)}
    for child in entries:
        name = child.name
        if name.startswith("."):
            continue
        try:
            st = child.stat()
        except OSError:
            continue
        items.append(
            {
                "name": name,
                "is_dir": child.is_dir(),
                "size": 0 if child.is_dir() else st.st_size,
                "mtime": int(st.st_mtime),
            }
        )
    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    parent = str(path.parent) if allowed(path.parent) and path != path.parent else ""
    return {
        "ok": True,
        "path": str(path),
        "parent": parent,
        "items": items,
    }


def our_ips() -> set[str]:
    if IS_WIN:
        return winops.our_ips()
    found = set()
    for name in ("bridge0", "en0", "en12", "en13"):
        ip = iface_ip(name)
        if ip:
            found.add(ip)
    found.update({"127.0.0.1", "::1"})
    return found


def our_names() -> set[str]:
    names = set()
    host = socket.gethostname()
    names.add(host.lower())
    names.add(host.split(".")[0].lower())
    if not IS_WIN:
        for key in ("LocalHostName", "ComputerName", "HostName"):
            val = sh("scutil", "--get", key).strip()
            if val:
                names.add(val.lower())
                names.add(val.replace(" ", "").lower())
    return {n for n in names if n}


def load_peer() -> dict:
    try:
        return json.loads(PEER_FILE.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def save_peer(info: dict) -> None:
    keep = {k: info[k] for k in ("ip", "host", "share", "name") if info.get(k)}
    try:
        PEER_FILE.write_text(json.dumps(keep, ensure_ascii=False, indent=2) + "\n")
    except OSError:
        pass


def run_timed(args: list[str], seconds: float) -> str:
    p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        out, _ = p.communicate(timeout=seconds)
    except subprocess.TimeoutExpired:
        p.kill()
        out, _ = p.communicate()
    return out or ""


def port_open(ip: str, port: int = 445, timeout: float = 0.45) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except OSError:
        return False


def client_allowed(ip: str) -> bool:
    return ip.startswith("127.") or ip.startswith("169.254.") or ip in {"::1", "::ffff:127.0.0.1"}


def hello() -> dict:
    tb = ""
    if IS_WIN:
        for row in winops.iface_stats():
            if row["role"] == "thunderbolt" and row.get("ip"):
                tb = row["ip"]
                break
    else:
        tb = iface_ip("bridge0")
    return {
        "ok": True,
        "app": "channelmonitor",
        "host": socket.gethostname(),
        "home": str(HOME),
        "tb": tb,
        "os": "windows" if IS_WIN else "mac",
    }


def http_json(ip: str, path: str, params: dict | None = None, payload: dict | None = None, timeout: float = 12) -> dict:
    url = f"http://{ip}:8767{path}"
    params = dict(params or {})
    params["lang"] = lang()
    url += "?" + urlencode(params)
    data = None
    headers = {"X-Lang": lang()}
    if payload is not None:
        body = dict(payload)
        body["lang"] = lang()
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode() or "{}")
    except Exception as e:
        return {"ok": False, "error": str(e)}


def http_hello(ip: str) -> dict | None:
    if not ip:
        return None
    data = http_json(ip, "/api/hello", timeout=0.9)
    if data.get("ok") and data.get("app") == "channelmonitor":
        return data
    return None


def explain_smb_error(err: str, ip: str) -> str:
    if IS_WIN:
        return winops.share_help(ip or "")
    text = err or ""
    low = text.lower()
    if "-5014" in text or "连接不存在" in text or "doesn't exist" in low or "not exist" in low:
        return t("share.mac", ip=ip)
    return text or t("err.mount_peer")


def poke_bridge() -> None:
    if IS_WIN:
        return
    if iface_status("bridge0") != "active":
        return
    src = iface_ip("bridge0")
    try:
        subprocess.run(
            ["ping6", "-c", "1", "-W", "1", "ff02::1%bridge0"],
            capture_output=True,
            timeout=2,
        )
    except (subprocess.TimeoutExpired, OSError):
        pass
    if src:
        try:
            subprocess.run(
                ["ping", "-c", "1", "-W", "1000", "-b", "bridge0", "169.254.255.255"],
                capture_output=True,
                timeout=2,
            )
        except (subprocess.TimeoutExpired, OSError):
            pass


def mounted_shares() -> list[dict]:
    if IS_WIN:
        return winops.mounted_shares()
    vols = []
    if not VOLUMES.exists():
        return vols
    for child in VOLUMES.iterdir():
        if child.name in LOCAL_VOLUMES or child.name.startswith("."):
            continue
        if child.name.startswith("com.apple.TimeMachine"):
            continue
        vols.append({"name": child.name, "path": str(child)})
    return vols


def arp_peers() -> list[dict]:
    ours = our_ips()
    found = []
    seen = set()
    try:
        arp = sh("arp", "-an", timeout=2)
    except subprocess.TimeoutExpired:
        arp = ""
    for line in arp.splitlines():
        m = re.search(r"\((\d+\.\d+\.\d+\.\d+)\)", line) or re.search(
            r"\s(\d+\.\d+\.\d+\.\d+)\s", line
        )
        if not m:
            continue
        ip = m.group(1)
        if not ip.startswith("169.254.") or ip in ours or ip in seen:
            continue
        if "incomplete" in line or "invalid" in line.lower():
            continue
        seen.add(ip)
        found.append({"ip": ip, "host": "", "name": ip, "via": "arp", "thunderbolt": True})
    return found


def mdns_smb_peers() -> list[dict]:
    if IS_WIN:
        return []
    ours = our_ips()
    names_us = our_names()
    out = run_timed(["dns-sd", "-B", "_smb._tcp", "local."], 1.6)
    instances = []
    for line in out.splitlines():
        m = re.search(r"\sAdd\s+\d+\s+\d+\s+\S+\s+\S+\s+(.+)$", line)
        if not m:
            continue
        inst = m.group(1).strip()
        if inst and inst not in instances:
            instances.append(inst)
    peers = []
    seen = set()
    for inst in instances:
        look = run_timed(["dns-sd", "-L", inst, "_smb._tcp", "local."], 1.6)
        host = ""
        hm = re.search(r"can be reached at (\S+):(\d+)", look)
        if hm:
            host = hm.group(1).rstrip(".")
        ips = set()
        if host:
            try:
                for item in socket.getaddrinfo(host, 445, socket.AF_INET):
                    ips.add(item[4][0])
            except OSError:
                pass
            g = run_timed(["dns-sd", "-G", "v4", host], 1.2)
            for line in g.splitlines():
                im = re.search(r"(\d+\.\d+\.\d+\.\d+)", line)
                if im:
                    ips.add(im.group(1))
            ig = run_timed(["dns-sd", "-i", "bridge0", "-G", "v4", host], 1.2)
            for line in ig.splitlines():
                im = re.search(r"(\d+\.\d+\.\d+\.\d+)", line)
                if im:
                    ips.add(im.group(1))
        ips.discard("0.0.0.0")
        if ips and ips <= ours:
            continue
        host_l = host.lower().replace(".local", "")
        if host_l in names_us and not (ips - ours):
            continue
        tb_ips = sorted(ip for ip in ips if ip.startswith("169.254.") and ip not in ours)
        other_ips = sorted(ip for ip in ips if ip not in ours and not ip.startswith("169.254."))
        ip = (tb_ips[0] if tb_ips else (other_ips[0] if other_ips else ""))
        key = ip or host or inst
        if not key or key in seen:
            continue
        seen.add(key)
        peers.append(
            {
                "ip": ip,
                "host": host,
                "name": inst,
                "via": "bonjour",
                "thunderbolt": bool(tb_ips),
            }
        )
    return peers


def pick_peer() -> dict | None:
    saved = load_peer()
    if saved.get("ip") and saved["ip"] not in our_ips() and port_open(saved["ip"]):
        return {
            "ip": saved["ip"],
            "host": saved.get("host") or "",
            "name": saved.get("name") or saved["ip"],
            "via": "saved",
            "thunderbolt": str(saved["ip"]).startswith("169.254."),
            "share": saved.get("share") or "",
        }
    poke_bridge()
    candidates: list[dict] = []
    if saved.get("ip"):
        candidates.append(
            {
                "ip": saved["ip"],
                "host": saved.get("host") or "",
                "name": saved.get("name") or saved["ip"],
                "via": "saved",
                "thunderbolt": str(saved["ip"]).startswith("169.254."),
                "share": saved.get("share") or "",
            }
        )
    candidates.extend(arp_peers())
    live_tb = [
        p
        for p in candidates
        if p.get("ip")
        and p["ip"] not in our_ips()
        and (p.get("thunderbolt") or str(p.get("ip")).startswith("169.254."))
        and port_open(p["ip"])
    ]
    if live_tb:
        return live_tb[0]
    candidates.extend(mdns_smb_peers())

    def score(p: dict) -> tuple:
        ip = p.get("ip") or ""
        live = 1 if ip and port_open(ip) else 0
        tb = 1 if p.get("thunderbolt") or ip.startswith("169.254.") else 0
        via = {"arp": 3, "bonjour": 2, "saved": 1}.get(p.get("via"), 0)
        return (live, tb, via)

    ranked = sorted(candidates, key=score, reverse=True)
    for p in ranked:
        ip = p.get("ip") or ""
        if ip and ip in our_ips():
            continue
        if ip and port_open(ip):
            return p
        if p.get("host") and p.get("via") == "bonjour":
            return p
    for p in ranked:
        if (p.get("ip") or p.get("host")) and (p.get("ip") or "") not in our_ips():
            return p
    return None


def list_shares(target: str) -> list[str]:
    if IS_WIN:
        return winops.list_shares(target)
    out = run_timed(["smbutil", "view", "-g", f"//{target}"], 4)
    if "server connection failed" in out.lower() or "unable" in out.lower():
        out = run_timed(["smbutil", "view", f"//{target}"], 4)
    shares = []
    for line in out.splitlines():
        m = re.match(r"^(.+?)\s+(Disk|Pipe)\s+", line.strip())
        if not m:
            continue
        name = m.group(1).strip()
        if name.upper() in {"IPC$", "ADMIN$", "PRINT$", "SHARE"}:
            continue
        if set(name) <= {"-"}:
            continue
        shares.append(name)
    return shares


def mount_volume(url: str) -> tuple[bool, str]:
    if IS_WIN:
        return winops.mount_volume(url)
    try:
        r = subprocess.run(
            ["osascript", "-e", f'mount volume "{url}"'],
            capture_output=True,
            text=True,
            timeout=45,
        )
    except subprocess.TimeoutExpired:
        return False, t("err.mount_timeout")
    if r.returncode != 0:
        return False, (r.stderr or r.stdout or t("err.mount_fail")).strip()
    return True, ""


def connect_auto(payload: dict | None = None) -> dict:
    payload = payload or {}
    existing = mounted_shares()
    saved = load_peer()
    if not payload.get("force"):
        if saved.get("mode") == "http" and saved.get("ip") and http_hello(saved["ip"]):
            return {
                "ok": True,
                "mode": "http",
                "message": t("msg.http_ok"),
                "path": saved.get("home") or "",
                "peer": saved,
                "volumes": existing,
            }
        if existing:
            return {
                "ok": True,
                "mode": "smb",
                "message": t("msg.mounted", name=existing[0]["name"]),
                "path": existing[0]["path"],
                "volumes": existing,
            }
    before = {v["path"] for v in existing}
    ip = str(payload.get("ip") or "").strip()
    host = str(payload.get("host") or "").strip()
    share = str(payload.get("share") or "").strip()
    picked = None
    if not ip and not host:
        picked = pick_peer()
        if not picked:
            tb = iface_status("bridge0") == "active"
            if not tb:
                return {"ok": False, "error": t("err.bridge_down")}
            return {"ok": False, "error": t("err.no_peer_tb")}
        ip = picked.get("ip") or ""
        host = picked.get("host") or ""
        share = share or (picked.get("share") or "")
        if not share:
            share = str(saved.get("share") or "")
    if ip and not re.match(r"^\d{1,3}(\.\d{1,3}){3}$", ip):
        return {"ok": False, "error": t("err.bad_ip")}
    target = ip or host
    if not target:
        return {"ok": False, "error": t("err.no_peer")}

    peer_hello = http_hello(ip) if ip else None
    if peer_hello:
        info = {
            "ip": ip,
            "host": peer_hello.get("host") or host,
            "name": peer_hello.get("host") or ip,
            "home": peer_hello.get("home") or "",
            "mode": "http",
        }
        save_peer(info)
        return {
            "ok": True,
            "mode": "http",
            "message": t("msg.http"),
            "path": info["home"],
            "peer": info,
            "volumes": existing,
        }

    if not (ip and port_open(ip, 445)):
        return {"ok": False, "error": explain_smb_error("连接不存在 (-5014)", ip or target)}

    if not share:
        shares = list_shares(target)
        if shares:
            share = shares[0]
    urls = []
    if share:
        urls.append(f"smb://{target}/{share}")
    last_err = ""
    mounted_ok = False
    for url in urls:
        ok, err = mount_volume(url)
        if ok:
            mounted_ok = True
            break
        last_err = explain_smb_error(err, ip or target)
    if not mounted_ok:
        if IS_WIN:
            winops.open_smb(target)
        else:
            subprocess.run(["open", f"smb://{target}"], capture_output=True, text=True)
        last_err = last_err or t("msg.finder")
    deadline = time.time() + 20
    new = []
    while time.time() < deadline:
        now = mounted_shares()
        new = [v for v in now if v["path"] not in before]
        if new:
            break
        time.sleep(0.4)
    if new:
        info = {
            "ip": ip,
            "host": host,
            "share": new[0]["name"],
            "name": (picked or {}).get("name") or host or ip,
            "mode": "smb",
        }
        save_peer(info)
        return {
            "ok": True,
            "mode": "smb",
            "message": t("msg.tb_mounted", name=new[0]["name"]),
            "path": new[0]["path"],
            "volumes": mounted_shares(),
            "peer": info,
        }
    still = mounted_shares()
    if still:
        return {
            "ok": True,
            "mode": "smb",
            "message": t("msg.mounted", name=still[0]["name"]),
            "path": still[0]["path"],
            "volumes": still,
        }
    return {
        "ok": False,
        "error": last_err or explain_smb_error("连接不存在", ip or target),
        "volumes": still,
    }


def peers() -> dict:
    saved = load_peer()
    found = []
    seen = set()
    for p in arp_peers():
        key = p.get("ip") or p.get("host")
        if not key or key in seen:
            continue
        seen.add(key)
        found.append(p)
    return {
        "ours": sorted(ip for ip in our_ips() if not ip.startswith("127") and ip != "::1"),
        "peers": found,
        "saved": saved,
        "volumes": mounted_shares(),
        "home": str(HOME),
        "volumesRoot": str(HOME) if IS_WIN else str(VOLUMES),
        "bridge": iface_status("bridge0"),
        "os": "windows" if IS_WIN else "mac",
    }


def path_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        try:
            return path.stat().st_size
        except OSError:
            return 0
    total = 0
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for name in files:
            if name.startswith("."):
                continue
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                pass
    return total


def copy_one(src: Path, dst: Path, base_done: int) -> int:
    dest = dst / src.name
    with JOB_LOCK:
        JOB["current"] = src.name
    if IS_WIN:
        dest.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            proc = subprocess.Popen(
                [
                    "robocopy",
                    str(src),
                    str(dest),
                    "/E",
                    "/NFL",
                    "/NDL",
                    "/NJH",
                    "/NJS",
                    "/NC",
                    "/NS",
                    "/NP",
                    "/R:1",
                    "/W:1",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                text=True,
            )
            while proc.poll() is None:
                time.sleep(0.35)
                size = path_bytes(dest)
                with JOB_LOCK:
                    JOB["done"] = min(JOB["total"], base_done + size)
            if proc.returncode is not None and proc.returncode >= 8:
                err = (proc.stderr.read() if proc.stderr else "") or ""
                raise RuntimeError(err.strip() or t("err.copy_fail", name=src.name))
            return base_done + max(path_bytes(dest), 1)
        copied = 0
        with src.open("rb") as fsrc, dest.open("wb") as fdst:
            while True:
                buf = fsrc.read(8 * 1024 * 1024)
                if not buf:
                    break
                fdst.write(buf)
                copied += len(buf)
                with JOB_LOCK:
                    JOB["done"] = min(JOB["total"], base_done + copied)
        return base_done + max(copied, 1)
    proc = subprocess.Popen(
        ["ditto", str(src), str(dest)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    while proc.poll() is None:
        time.sleep(0.35)
        size = path_bytes(dest)
        with JOB_LOCK:
            JOB["done"] = min(JOB["total"], base_done + size)
    stderr = (proc.stderr.read() if proc.stderr else "") or ""
    if proc.returncode != 0:
        raise RuntimeError(stderr.strip() or t("err.ditto_fail", name=src.name))
    return base_done + max(path_bytes(dest), 1)


def count_bytes(paths: list[Path]) -> int:
    total = 0
    for p in paths:
        if p.is_file():
            total += p.stat().st_size
        elif p.is_dir():
            for root, dirs, files in os.walk(p):
                dirs[:] = [d for d in dirs if not d.startswith(".")]
                for f in files:
                    if f.startswith("."):
                        continue
                    fp = Path(root) / f
                    try:
                        total += fp.stat().st_size
                    except OSError:
                        pass
    return total


def remote_ls(raw: str) -> dict:
    peer = load_peer()
    if peer.get("mode") != "http" or not peer.get("ip"):
        return {"ok": False, "error": t("err.no_peer_http")}
    path = raw or peer.get("home") or ""
    return http_json(peer["ip"], "/api/ls", {"path": path})


def mkdir_local(raw: str) -> dict:
    if not raw:
        return {"ok": False, "error": t("err.empty_path")}
    path = Path(raw).expanduser()
    if not allowed(path):
        return {"ok": False, "error": t("err.bad_path_short")}
    path.mkdir(parents=True, exist_ok=True)
    return {"ok": True, "path": str(path.resolve())}


def _remote_join(base: str, name: str) -> str:
    if not base:
        return "/" + name
    return base.rstrip("/") + "/" + name


def _http_pull(ip: str, src: str, dst_dir: Path) -> None:
    name = Path(src).name
    with JOB_LOCK:
        JOB["current"] = name
    listing = http_json(ip, "/api/ls", {"path": src})
    if listing.get("ok"):
        target = dst_dir / name
        target.mkdir(parents=True, exist_ok=True)
        for child in listing.get("items") or []:
            _http_pull(ip, _remote_join(src, child["name"]), target)
        return
    dest = dst_dir / name
    url = f"http://{ip}:8767/api/blob?path={quote(src)}"
    with urllib.request.urlopen(url, timeout=600) as resp, open(dest, "wb") as f:
        while True:
            chunk = resp.read(8 * 1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
            with JOB_LOCK:
                JOB["done"] += len(chunk)
                JOB["total"] = max(JOB["total"], JOB["done"])


def _http_push(ip: str, src: Path, dst_dir: str) -> None:
    dest = _remote_join(dst_dir, src.name)
    with JOB_LOCK:
        JOB["current"] = src.name
    if src.is_dir():
        out = http_json(ip, "/api/mkdir", payload={"path": dest})
        if not out.get("ok"):
            raise RuntimeError(out.get("error") or t("err.peer_mkdir", name=src.name))
        for child in src.iterdir():
            if child.name.startswith("."):
                continue
            _http_push(ip, child, dest)
        return
    size = src.stat().st_size
    url = f"http://{ip}:8767/api/blob?path={quote(dest)}"
    with src.open("rb") as f:
        req = urllib.request.Request(url, data=f, method="POST")
        req.add_header("Content-Length", str(size))
        req.add_header("Content-Type", "application/octet-stream")
        urllib.request.urlopen(req, timeout=600)
    with JOB_LOCK:
        JOB["done"] += size
        JOB["total"] = max(JOB["total"], JOB["done"])


def run_copy_http(ip: str, src_dir: str, names: list[str], dst_dir: str, direction: str) -> None:
    with JOB_LOCK:
        JOB.update(
            {
                "active": True,
                "direction": direction,
                "current": "",
                "done": 0,
                "total": 1,
                "error": "",
                "ok": False,
            }
        )
    if direction == "to-local":
        dst_root = Path(dst_dir).expanduser().resolve()
        if not allowed(dst_root) or not dst_root.is_dir():
            raise RuntimeError(t("err.local_dest"))
        for name in names:
            if not name or "/" in name or name in {".", ".."}:
                raise RuntimeError(t("err.bad_name"))
            _http_pull(ip, _remote_join(src_dir, name), dst_root)
    else:
        src_root = Path(src_dir).expanduser().resolve()
        if not allowed(src_root):
            raise RuntimeError(t("err.local_src"))
        for name in names:
            if not name or "/" in name or name in {".", ".."}:
                raise RuntimeError(t("err.bad_name"))
            p = (src_root / name).resolve()
            if p.parent != src_root or not p.exists():
                raise RuntimeError(t("err.not_found", name=name))
            _http_push(ip, p, dst_dir)
    with JOB_LOCK:
        JOB["active"] = False
        JOB["ok"] = True
        JOB["current"] = t("job.done")
        JOB["done"] = max(JOB["total"], JOB["done"])


def run_copy(src_dir: str, names: list[str], dst_dir: str, direction: str) -> None:
    peer = load_peer()
    if peer.get("mode") == "http" and peer.get("ip"):
        try:
            run_copy_http(peer["ip"], src_dir, names, dst_dir, direction)
        except Exception as e:
            with JOB_LOCK:
                JOB["active"] = False
                JOB["ok"] = False
                JOB["error"] = str(e)
        return
    try:
        src_root = Path(src_dir).expanduser().resolve()
        dst_root = Path(dst_dir).expanduser().resolve()
        if not allowed(src_root) or not allowed(dst_root):
            raise RuntimeError(t("err.bad_path_short"))
        if not dst_root.is_dir():
            raise RuntimeError(t("err.dest_not_dir"))
        items = []
        for name in names:
            if not name or "/" in name or name in {".", ".."}:
                raise RuntimeError(t("err.bad_name"))
            p = (src_root / name).resolve()
            if not allowed(p) or p.parent != src_root:
                raise RuntimeError(t("err.cannot_copy", name=name))
            if not p.exists():
                raise RuntimeError(t("err.not_found", name=name))
            items.append(p)
        total = count_bytes(items) or 1
        warning = cloud_note(src_root, dst_root, *items)
        with JOB_LOCK:
            JOB.update(
                {
                    "active": True,
                    "direction": direction,
                    "current": "",
                    "done": 0,
                    "total": total,
                    "error": "",
                    "ok": False,
                    "warning": warning,
                }
            )
        done = 0
        for item in items:
            done = copy_one(item, dst_root, done)
        with JOB_LOCK:
            JOB["active"] = False
            JOB["ok"] = True
            JOB["current"] = t("job.done")
            JOB["done"] = JOB["total"]
    except Exception as e:
        with JOB_LOCK:
            JOB["active"] = False
            JOB["ok"] = False
            JOB["error"] = str(e)


def start_copy(payload: dict) -> dict:
    with JOB_LOCK:
        if JOB["active"]:
            return {"ok": False, "error": t("err.busy")}
    names = payload.get("names") or []
    if not names:
        return {"ok": False, "error": t("err.pick")}
    direction = str(payload.get("direction") or "")
    if direction not in {"to-remote", "to-local"}:
        return {"ok": False, "error": t("err.dir")}
    src = str(payload.get("src") or "")
    dst = str(payload.get("dst") or "")
    warning = cloud_note(Path(src), Path(dst))
    chosen = lang()
    def _run():
        set_lang(chosen)
        run_copy(src, list(names), dst, direction)
    threading.Thread(target=_run, daemon=True).start()
    return {"ok": True, "warning": warning}


def job_status() -> dict:
    with JOB_LOCK:
        return dict(JOB)
