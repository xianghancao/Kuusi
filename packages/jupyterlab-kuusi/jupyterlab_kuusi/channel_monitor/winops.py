"""Windows backends for ChannelMonitor. Stdlib + PowerShell only."""

from __future__ import annotations

import json
import re
import string
import subprocess
import time
from .i18n import lang, t

NET_CACHE = {"t": 0.0, "rows": None, "ips": set()}
DISK_CACHE = {"t": 0.0, "ident": []}
SMB_CACHE = {"t": 0.0, "v": {}}


def as_list(val):
    if val is None:
        return []
    if isinstance(val, list):
        return val
    return [val]


def ps(script: str, timeout: float = 20) -> str:
    r = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); " + script,
        ],
        capture_output=True,
        timeout=timeout,
    )
    raw = r.stdout or b""
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16", errors="replace")
    return raw.decode("utf-8", errors="replace")


def ps_json(script: str, timeout: float = 20):
    out = ps(script + " | ConvertTo-Json -Compress -Depth 6", timeout=timeout).strip()
    if not out:
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return None


def safe_alias(name: str) -> str:
    if not name or len(name) > 80:
        raise ValueError(t("err.bad_iface_name"))
    if re.search(r"['\"`;\n\r|&<>]", name):
        raise ValueError(t("err.bad_iface_name"))
    return name


def classify_adapter(name: str, desc: str) -> tuple[str, str] | None:
    text = f"{name} {desc}".lower()
    skip = (
        "loopback",
        "teredo",
        "isatap",
        "bluetooth",
        "hyper-v",
        "vethernet",
        "vpn",
        "tap-windows",
        "wsl",
        "virtualbox",
        "vmware",
        "wan miniport",
        "debug",
        "pseudo",
    )
    if any(s in text for s in skip):
        return None
    if "thunderbolt" in text:
        return "thunderbolt", t("role.thunderbolt")
    if any(s in text for s in ("wi-fi", "wifi", "wireless", "wlan", "802.11")):
        return "wifi", t("role.wifi")
    if any(s in text for s in ("usb", "rndis", "usbethernet", "usb nic")):
        return "usb", t("role.usb")
    if "ethernet" in text or "以太网" in name or "乙太網" in name:
        return "other", t("role.ethernet")
    return "other", name


def _load_adapters(force: bool = False) -> list[dict]:
    now = time.time()
    if not force and NET_CACHE["rows"] is not None and now - NET_CACHE["t"] < 0.8:
        return NET_CACHE["rows"]
    try:
        data = ps_json(
            r"""
$items = @()
Get-NetAdapter -ErrorAction SilentlyContinue | ForEach-Object {
  $st = Get-NetAdapterStatistics -Name $_.Name -ErrorAction SilentlyContinue
  $ip = (Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
  $items += [pscustomobject]@{
    name = $_.Name
    desc = $_.InterfaceDescription
    status = [string]$_.Status
    ip = $ip
    rx = [int64]($st.ReceivedBytes)
    tx = [int64]($st.SentBytes)
    speed = [string]$_.LinkSpeed
    mac = [string]$_.MacAddress
  }
}
$items
""",
            timeout=12,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        data = []
    rows = []
    ips = set()
    for item in as_list(data):
        name = str(item.get("name") or "")
        desc = str(item.get("desc") or "")
        classified = classify_adapter(name, desc)
        if not classified:
            continue
        role, label = classified
        status_raw = str(item.get("status") or "")
        if status_raw.lower() == "up":
            status = "active"
        elif status_raw.lower() in {"disabled", "not present"}:
            status = "inactive"
        else:
            status = "inactive" if status_raw.lower() in {"disconnected"} else "unknown"
        ip = str(item.get("ip") or "")
        if ip:
            ips.add(ip)
        rx = int(item.get("rx") or 0)
        tx = int(item.get("tx") or 0)
        if status != "active" and not ip and rx == 0 and tx == 0:
            continue
        rows.append(
            {
                "id": name,
                "label": label,
                "role": role,
                "status": status,
                "ip": ip,
                "ibytes": rx,
                "obytes": tx,
                "link": str(item.get("speed") or ""),
            }
        )
    order = {"thunderbolt": 0, "usb": 1, "wifi": 2, "other": 3}
    rows.sort(key=lambda r: (order.get(r["role"], 9), r["id"]))
    NET_CACHE.update(t=now, rows=rows, ips=ips)
    return rows


def iface_stats() -> list[dict]:
    return _load_adapters()


def our_ips() -> set[str]:
    _load_adapters()
    found = set(NET_CACHE["ips"])
    found.update({"127.0.0.1", "::1"})
    return found


def iface_ip(name: str) -> str:
    for row in _load_adapters():
        if row["id"] == name:
            return row.get("ip") or ""
    return ""


def iface_status(name: str) -> str:
    if name in {"bridge0", "en0"}:
        for row in _load_adapters():
            if row["role"] == "thunderbolt":
                return row["status"]
        return "inactive"
    for row in _load_adapters():
        if row["id"] == name:
            return row["status"]
    return "unknown"


def toggle(name: str, action: str) -> dict:
    try:
        alias = safe_alias(name)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    if action not in {"up", "down"}:
        return {"ok": False, "error": t("err.bad_action")}
    cmd = "Enable-NetAdapter" if action == "up" else "Disable-NetAdapter"
    inner = f"{cmd} -InterfaceAlias '{alias}' -Confirm:$false"
    script = (
        f"Start-Process powershell -Verb RunAs -Wait -ArgumentList "
        f"'-NoProfile -ExecutionPolicy Bypass -Command {inner}'"
    )
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-Command", script],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": t("err.admin_timeout")}
    if r.returncode != 0:
        return {"ok": False, "error": (r.stderr or r.stdout or t("err.cancelled")).strip()}
    NET_CACHE["t"] = 0
    return {"ok": True}


def power() -> dict:
    data = ps_json(
        r"""
$b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $b) { [pscustomobject]@{ present = $false }; return }
[pscustomobject]@{
  present = $true
  percent = [int]$b.EstimatedChargeRemaining
  status = [int]$b.BatteryStatus
}
""",
        timeout=8,
    )
    if not data or not data.get("present"):
        return {
            "ok": True,
            "percent": None,
            "charging": False,
            "external": True,
            "primary": {"label": t("power.ac_desktop"), "watts": None},
            "adapters": [],
            "peer_watts": None,
            "can_toggle": False,
            "note": t("power.note_win"),
        }
    st = int(data.get("status") or 0)
    charging = st in {2, 6, 7, 8, 9}
    on_ac = st != 1
    return {
        "ok": True,
        "percent": data.get("percent"),
        "charging": charging,
        "external": on_ac,
        "primary": {"label": t("power.adapter") if on_ac else t("power.battery_src"), "watts": None},
        "adapters": [],
        "peer_watts": None,
        "can_toggle": False,
        "note": t("power.note_win"),
    }


def smb_status() -> dict:
    now = time.time()
    if SMB_CACHE["v"] and now - SMB_CACHE["t"] < 4 and SMB_CACHE.get("lang") == lang():
        return SMB_CACHE["v"]
    data = ps_json(
        r"Get-SmbClientConfiguration | Select-Object RequireSecuritySignature, EnableSecuritySignature",
        timeout=8,
    )
    required = True
    if isinstance(data, dict):
        required = bool(data.get("RequireSecuritySignature"))
    out = {
        "conf_exists": True,
        "signing_required": required,
        "signing_on": required,
        "shares": 0,
        "note": t("smb.note_win"),
    }
    SMB_CACHE.update(t=now, v=out, lang=lang())
    return out


def smb_tune() -> dict:
    inner = (
        "Set-SmbClientConfiguration -RequireSecuritySignature $false "
        "-EnableSecuritySignature $false -Force"
    )
    script = (
        "Start-Process powershell -Verb RunAs -Wait -ArgumentList "
        f"'-NoProfile -ExecutionPolicy Bypass -Command {inner}'"
    )
    r = subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if r.returncode != 0:
        return {"ok": False, "error": (r.stderr or r.stdout or t("err.cancelled")).strip()}
    SMB_CACHE["t"] = 0
    return {"ok": True, "message": t("smb.tuned_win")}


def _usb_hint(pnp: str) -> str:
    if not pnp:
        return ""
    blob = pnp.upper()
    if "USB\\VID_" in blob or "USBSTOR" in blob:
        if any(s in blob for s in ("USB\\3", "SS01", "USBSUPERSPEED", "GEN2")):
            return "Up to 5 Gb/s"
        if any(s in blob for s in ("USB\\2", "USB20", "USB\\1")):
            return "Up to 480 Mb/s"
    return ""


def disks() -> list[dict]:
    try:
        ident = ps_json(
        r"""
$perf = @{}
Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.Name -eq '_Total') { return }
  $n = 0
  if ($_.Name -match '^(\d+)') { $n = [int]$Matches[1] }
  $perf[$n] = [int64]$_.DiskBytesPersec
}
$pnp = @{}
Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue | ForEach-Object {
  $pnp[[int]$_.Index] = $_.PNPDeviceID
}
$vols = @{}
Get-Volume -ErrorAction SilentlyContinue | Where-Object { $_.DriveLetter } | ForEach-Object {
  $n = -1
  try {
    $part = Get-Partition -DriveLetter $_.DriveLetter -ErrorAction SilentlyContinue
    if ($part) { $n = [int]$part.DiskNumber }
  } catch {}
  if ($n -ge 0) {
    if (-not $vols.ContainsKey($n)) { $vols[$n] = @() }
    $label = $_.FileSystemLabel
    if (-not $label) { $label = ($_.DriveLetter + ':') }
    $vols[$n] += ($_.DriveLetter + ':' + ' ' + $label)
  }
}
$items = @()
Get-Disk -ErrorAction SilentlyContinue | ForEach-Object {
  $n = [int]$_.Number
  $items += [pscustomobject]@{
    id = $n
    name = $_.FriendlyName
    bus = [string]$_.BusType
    size = [int64]$_.Size
    system = [bool]$_.IsSystem
    boot = [bool]$_.IsBoot
    rate = [int64]($perf[$n])
    pnp = [string]$pnp[$n]
    volumes = @($vols[$n])
  }
}
Get-PhysicalDisk -ErrorAction SilentlyContinue | ForEach-Object {
  $n = 0
  try { $n = [int]$_.DeviceId } catch { $n = -1 }
  foreach ($it in $items) {
    if ($it.id -eq $n) {
      $it | Add-Member -NotePropertyName media -NotePropertyValue ([string]$_.MediaType) -Force
    }
  }
}
$items
""",
        timeout=18,
    )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        ident = []
    rows = []
    for item in as_list(ident):
        bus = str(item.get("bus") or "")
        media = str(item.get("media") or "")
        name = str(item.get("name") or f"Disk {item.get('id')}")
        pnp = str(item.get("pnp") or "")
        ssd = media.upper() == "SSD" or "SSD" in name.upper() or "NVME" in name.upper()
        hdd = media.upper() == "HDD" or (not ssd and bus.upper() in {"SATA", "ATA", "SCSI", "SAS"})
        usb_speed = _usb_hint(pnp)
        bus_u = bus.upper()
        if bus_u in {"NVME"} or (item.get("boot") and bus_u in {"RAID", "STORAGE SPACES"}):
            role, label, cap, link = "internal", t("role.internal") if ssd else t("role.internal_hdd"), 2500 if ssd else 150, bus
        elif bus_u == "USB":
            if "480" in usb_speed:
                role, label, cap, link = "usb2", "USB 2.0", 35, usb_speed
            elif "5 gb" in usb_speed.lower() or "10 gb" in usb_speed.lower():
                role, label, cap, link = "usb3", "USB 3", 400 if ssd else 150, usb_speed
            elif hdd:
                role, label, cap, link = "hdd", t("role.usb_hdd"), 150, bus
            elif ssd:
                role, label, cap, link = "usb3", t("role.usb_disk"), 400, bus + " · " + t("usb.maybe2")
            else:
                role, label, cap, link = "usb2", t("role.usb_disk"), 35, bus
        elif "THUNDER" in bus_u or "THUNDER" in name.upper():
            role, label, cap, link = "disk_tb", t("role.disk_tb"), 2000 if ssd else 150, bus
        elif hdd:
            role, label, cap, link = "hdd", t("role.hdd"), 150, bus
        elif item.get("boot") or item.get("system"):
            role, label, cap, link = "internal", t("role.internal") if ssd else t("role.internal_hdd"), 2500 if ssd else 150, bus
        else:
            role, label, cap, link = "other", name[:24], 500, bus
        vols = [v.strip() for v in as_list(item.get("volumes")) if v]
        rate = int(item.get("rate") or 0)
        rate_mbs = rate / 1024 / 1024
        if role == "usb2":
            note = t("note.usb2")
        elif role == "hdd":
            note = t("note.hdd")
        elif role == "internal":
            note = t("note.internal_win")
        elif role == "usb3" and rate_mbs > 2 and rate_mbs < 40:
            note = t("note.usb3_slow")
        elif role == "usb3":
            note = t("note.usb3")
        elif role == "disk_tb":
            note = t("note.tb")
        else:
            note = ""
        rows.append(
            {
                "id": f"disk{item.get('id')}",
                "kind": "disk",
                "label": name[:40],
                "role": role,
                "status": "active",
                "volumes": vols,
                "media": "ssd" if ssd else "hdd",
                "link": link or bus,
                "cap": cap * 1024 * 1024,
                "rate": rate,
                "total": rate,
                "note": note,
                "internal": role == "internal",
            }
        )
    rows.sort(key=lambda r: (0 if not r["internal"] else 1, r["id"]))
    return rows


def mounted_shares() -> list[dict]:
    data = ps_json(
        r"""
$items = @()
Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object {
  $root = $_.Root
  if (-not $root) { return }
  $display = $_.Description
  if (-not $display) { $display = $_.Name + ':' }
  $net = $false
  try {
    $vol = Get-Volume -DriveLetter $_.Name -ErrorAction SilentlyContinue
    if ($vol -and $vol.DriveType -eq 'Network') { $net = $true }
  } catch {}
  if ($_.DisplayRoot) { $net = $true }
  $items += [pscustomobject]@{
    name = $display
    path = $root
    net = $net
    letter = $_.Name
  }
}
$items
""",
        timeout=10,
    )
    rows = []
    for item in as_list(data):
        letter = str(item.get("letter") or "").upper()
        path = str(item.get("path") or "")
        if not path:
            continue
        if letter == "C" and not item.get("net"):
            continue
        rows.append({"name": str(item.get("name") or letter), "path": path})
    return rows


def list_shares(target: str) -> list[str]:
    if not re.match(r"^[\w\.\-]+$", target):
        return []
    out = ps(f"net view \\\\{target} /all", timeout=8)
    shares = []
    for line in out.splitlines():
        m = re.match(r"^(\S+)\s+(Disk|磁盘)", line.strip(), re.I)
        if not m:
            continue
        name = m.group(1)
        if name.upper() in {"SHARE", "IPC$", "ADMIN$", "PRINT$", "共享名"}:
            continue
        shares.append(name)
    return shares


def mount_volume(url: str) -> tuple[bool, str]:
    m = re.match(r"^smb://([^/]+)(?:/(.+))?$", url, re.I)
    if not m:
        return False, t("err.bad_ip_path")
    host, share = m.group(1), m.group(2)
    if share:
        share_path = share.replace("/", "\\")
        unc = "\\\\" + host + "\\" + share_path
        r = subprocess.run(
            ["net", "use", unc, "/persistent:no"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if r.returncode == 0:
            return True, ""
        return False, (r.stderr or r.stdout or t("err.map_fail")).strip()
    try:
        subprocess.Popen(["explorer", f"\\\\{host}"])
        return True, ""
    except OSError as e:
        return False, str(e)


def open_smb(target: str) -> None:
    subprocess.Popen(["explorer", f"\\\\{target}"], close_fds=True)


def copy_one(src: Path, dest: Path, base_done: int, job: dict, job_lock) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        r = subprocess.run(
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
            capture_output=True,
            text=True,
        )
        if r.returncode >= 8:
            raise RuntimeError((r.stderr or r.stdout or t("err.robocopy")).strip() or t("err.copy_fail", name=src.name))
        return base_done + max(_path_bytes(dest), 1)
    import shutil

    with src.open("rb") as fsrc, dest.open("wb") as fdst:
        shutil.copyfileobj(fsrc, fdst, length=8 * 1024 * 1024)
    try:
        shutil.copystat(src, dest, follow_symlinks=True)
    except OSError:
        pass
    return base_done + max(src.stat().st_size, 1)


def _path_bytes(path: Path) -> int:
    import os

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


def drive_roots() -> list[Path]:
    roots = []
    for letter in string.ascii_uppercase:
        root = Path(f"{letter}:\\")
        try:
            if root.exists():
                roots.append(root)
        except OSError:
            continue
    return roots


def share_help(ip: str) -> str:
    return t("share.win", ip=ip)
