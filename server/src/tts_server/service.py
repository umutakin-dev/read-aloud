"""Registers the server to start at login, per user, on each OS (000070).

Without WebGPU the server is the only way to hear Kokoro, and a server the
reader has to remember to start is one they will forget. So the install puts
it in the OS's own per-user login mechanism and the reader never thinks about
it again:

- macOS: a launchd agent in ~/Library/LaunchAgents
- Linux: a systemd user unit in ~/.config/systemd/user
- Windows: a value under HKCU\\...\\Run, started with pythonw so no console
  window sits open all day

All per user, none needing admin rights. Like alignment.py and device.py this
module must not import torch, numpy or soundfile: the cheap test run covers it,
and registering a service has no reason to load a model.

The command it registers is this interpreter running `-m tts_server serve`.
Under `uv tool install` that interpreter is the tool's own venv, which stays
put across `uv tool upgrade`, so the registered path does not go stale.
"""

from __future__ import annotations

import os
import pathlib
import plistlib
import shutil
import subprocess
import sys
from typing import Callable, Sequence

NAME = "read-aloud-server"
LAUNCHD_LABEL = "io.github.umutakin-dev.read-aloud-server"
WINDOWS_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
WINDOWS_RUN_VALUE = "ReadAloudServer"

# A runner takes the command and quiet=True for a call whose failure is
# expected and means nothing, so its output does not read as an error.
Runner = Callable[..., int]


class ServiceError(RuntimeError):
    """A login service could not be set up; the message says what to do."""


def default_runner(cmd: Sequence[str], quiet: bool = False) -> int:
    out = subprocess.DEVNULL if quiet else None
    return subprocess.run(list(cmd), check=False, stdout=out, stderr=out).returncode


def serve_command(python: str, platform: str, log_file: pathlib.Path | None = None) -> list[str]:
    """What the login service runs.

    On Windows the console interpreter would open a window for as long as the
    server lives, so the windowless pythonw beside it runs instead. pythonw has
    no stdout or stderr at all, so the server is told where to log.
    """
    if platform == "win32":
        candidate = pathlib.Path(python).with_name("pythonw.exe")
        python = str(candidate) if candidate.exists() else python
    cmd = [python, "-m", "tts_server", "serve"]
    if log_file is not None:
        cmd += ["--log-file", str(log_file)]
    return cmd


# ─── macOS ────────────────────────────────────────────────────────────────────


def launchd_paths(home: pathlib.Path) -> tuple[pathlib.Path, pathlib.Path]:
    plist = home / "Library" / "LaunchAgents" / f"{LAUNCHD_LABEL}.plist"
    log = home / "Library" / "Logs" / f"{NAME}.log"
    return plist, log


def launchd_plist(cmd: Sequence[str], log: pathlib.Path) -> bytes:
    return plistlib.dumps(
        {
            "Label": LAUNCHD_LABEL,
            "ProgramArguments": list(cmd),
            "RunAtLoad": True,
            # Restart after a crash, but not after a clean exit, so stopping it
            # on purpose sticks until the next login.
            "KeepAlive": {"SuccessfulExit": False},
            "StandardOutPath": str(log),
            "StandardErrorPath": str(log),
        }
    )


def _launchd_install(home, python, run, uid) -> list[str]:
    plist, log = launchd_paths(home)
    plist.parent.mkdir(parents=True, exist_ok=True)
    log.parent.mkdir(parents=True, exist_ok=True)
    plist.write_bytes(launchd_plist(serve_command(python, "darwin"), log))
    # bootout first, so installing twice replaces the agent instead of failing
    # because it is already loaded. Its failure just means it was not loaded,
    # so it runs quiet: on a first install launchctl would print "Boot-out
    # failed" above the success lines.
    run(["launchctl", "bootout", f"gui/{uid}/{LAUNCHD_LABEL}"], quiet=True)
    if run(["launchctl", "bootstrap", f"gui/{uid}", str(plist)]) != 0:
        raise ServiceError(f"launchctl could not load {plist}")
    return [f"Installed {plist}", f"Logs go to {log}"]


def _launchd_uninstall(home, run, uid) -> list[str]:
    plist, _ = launchd_paths(home)
    # Not loaded is fine here too; what was removed is reported below.
    run(["launchctl", "bootout", f"gui/{uid}/{LAUNCHD_LABEL}"], quiet=True)
    if plist.exists():
        plist.unlink()
        return [f"Removed {plist}"]
    return ["No login service was installed"]


# ─── Linux ────────────────────────────────────────────────────────────────────


def systemd_path(home: pathlib.Path, env: dict) -> pathlib.Path:
    config = pathlib.Path(env.get("XDG_CONFIG_HOME") or home / ".config")
    return config / "systemd" / "user" / f"{NAME}.service"


def systemd_unit(cmd: Sequence[str]) -> str:
    # systemd splits ExecStart on spaces itself; quote each word so a home
    # directory with a space in it survives.
    exec_start = " ".join(f'"{part}"' if " " in part else part for part in cmd)
    return (
        "[Unit]\n"
        "Description=Read Aloud Kokoro TTS server\n"
        "\n"
        "[Service]\n"
        f"ExecStart={exec_start}\n"
        "Restart=on-failure\n"
        "RestartSec=5\n"
        "\n"
        "[Install]\n"
        # A user unit in default.target starts when the user logs in.
        "WantedBy=default.target\n"
    )


def _systemd_install(home, python, run, env) -> list[str]:
    if shutil.which("systemctl") is None:
        raise ServiceError(
            "systemctl was not found, so there is no systemd user session to "
            f"start the server at login. Run `{NAME} serve` from your desktop's "
            "autostart settings instead."
        )
    unit = systemd_path(home, env)
    unit.parent.mkdir(parents=True, exist_ok=True)
    unit.write_text(systemd_unit(serve_command(python, "linux")), encoding="utf-8")
    run(["systemctl", "--user", "daemon-reload"])
    if run(["systemctl", "--user", "enable", "--now", f"{NAME}.service"]) != 0:
        raise ServiceError(f"systemctl could not enable {unit}")
    return [f"Installed {unit}", f"Logs: journalctl --user -u {NAME}"]


def _systemd_uninstall(home, run, env) -> list[str]:
    unit = systemd_path(home, env)
    if not unit.exists():
        return ["No login service was installed"]
    run(["systemctl", "--user", "disable", "--now", f"{NAME}.service"])
    unit.unlink()
    run(["systemctl", "--user", "daemon-reload"])
    return [f"Removed {unit}"]


# ─── Windows ──────────────────────────────────────────────────────────────────


def windows_log_path(env: dict, home: pathlib.Path) -> pathlib.Path:
    base = pathlib.Path(env.get("LOCALAPPDATA") or home / "AppData" / "Local")
    return base / NAME / "server.log"


def _windows_install(home, python, env, registry, start) -> list[str]:
    log = windows_log_path(env, home)
    log.parent.mkdir(parents=True, exist_ok=True)
    cmd = serve_command(python, "win32", log)
    registry.set(WINDOWS_RUN_VALUE, subprocess.list2cmdline(cmd))
    # The Run key only acts at the next login; start it now as well, so the
    # reader does not have to log out to use what they just installed.
    start(cmd)
    return [f"Registered {WINDOWS_RUN_VALUE} to start at login", f"Logs go to {log}"]


def _windows_uninstall(registry) -> list[str]:
    if not registry.delete(WINDOWS_RUN_VALUE):
        return ["No login service was installed"]
    return [
        f"Removed {WINDOWS_RUN_VALUE} from login",
        "A server already running keeps running until you log out",
    ]


class _WinRegistry:
    """HKCU\\...\\Run, through winreg; only ever built on Windows."""

    def set(self, name: str, value: str) -> None:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, WINDOWS_RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)

    def delete(self, name: str) -> bool:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, WINDOWS_RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            try:
                winreg.DeleteValue(key, name)
            except FileNotFoundError:
                return False
        return True


def _windows_start(cmd: Sequence[str]) -> None:
    flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)
    subprocess.Popen(list(cmd), creationflags=flags, close_fds=True)


# ─── Entry points ─────────────────────────────────────────────────────────────


def install(
    *,
    platform: str = sys.platform,
    home: pathlib.Path | None = None,
    python: str = sys.executable,
    env: dict | None = None,
    run: Runner = default_runner,
    registry=None,
    start: Callable[[Sequence[str]], None] = _windows_start,
) -> list[str]:
    """Registers the server to start at login and starts it now."""
    home = home or pathlib.Path.home()
    env = os.environ if env is None else env
    if platform == "darwin":
        return _launchd_install(home, python, run, os.getuid())
    if platform.startswith("linux"):
        return _systemd_install(home, python, run, env)
    if platform == "win32":
        return _windows_install(home, python, env, registry or _WinRegistry(), start)
    raise ServiceError(f"No login service is known for {platform}")


def uninstall(
    *,
    platform: str = sys.platform,
    home: pathlib.Path | None = None,
    env: dict | None = None,
    run: Runner = default_runner,
    registry=None,
) -> list[str]:
    """Stops the login service and removes it."""
    home = home or pathlib.Path.home()
    env = os.environ if env is None else env
    if platform == "darwin":
        return _launchd_uninstall(home, run, os.getuid())
    if platform.startswith("linux"):
        return _systemd_uninstall(home, run, env)
    if platform == "win32":
        return _windows_uninstall(registry or _WinRegistry())
    raise ServiceError(f"No login service is known for {platform}")
