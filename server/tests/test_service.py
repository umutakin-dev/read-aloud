"""Covers the login service from #000070.

The reader without WebGPU needs the server running, and the point of the login
service is that they never have to remember to start it. These run each OS's
install against a temporary home with the system calls recorded, not made, so
they pass on any OS and touch nothing real.
"""

import pathlib
import plistlib
import subprocess
import sys

import pytest

from tts_server import cli, service

PYTHON = "/home/reader/.local/share/uv/tools/tts-server/bin/python"


class Recorder:
    def __init__(self, fail=()):
        self.calls = []
        self.fail = set(fail)

    def __call__(self, cmd):
        self.calls.append(list(cmd))
        return 1 if cmd[1] in self.fail or (len(cmd) > 2 and cmd[2] in self.fail) else 0


class FakeRegistry:
    def __init__(self):
        self.values = {}

    def set(self, name, value):
        self.values[name] = value

    def delete(self, name):
        return self.values.pop(name, None) is not None


def test_service_module_stays_free_of_torch():
    # The cheap CI run imports it without torch installed; a stray import would
    # only show up there.
    for heavy in ("torch", "numpy", "soundfile", "kokoro", "tts_server.main"):
        assert heavy not in sys.modules


def test_the_service_runs_this_interpreter_as_the_server():
    assert service.serve_command(PYTHON, "linux") == [PYTHON, "-m", "tts_server", "serve"]


def test_windows_runs_without_a_console_window(tmp_path):
    python = tmp_path / "python.exe"
    python.touch()
    (tmp_path / "pythonw.exe").touch()
    cmd = service.serve_command(str(python), "win32", tmp_path / "server.log")
    assert cmd[0] == str(tmp_path / "pythonw.exe")
    assert cmd[-2:] == ["--log-file", str(tmp_path / "server.log")]


class TestMacOS:
    def install(self, tmp_path, run):
        return service.install(platform="darwin", home=tmp_path, python=PYTHON, run=run)

    def test_writes_an_agent_that_starts_at_login(self, tmp_path):
        self.install(tmp_path, Recorder())
        plist, log = service.launchd_paths(tmp_path)
        agent = plistlib.loads(plist.read_bytes())
        assert agent["Label"] == service.LAUNCHD_LABEL
        assert agent["ProgramArguments"] == [PYTHON, "-m", "tts_server", "serve"]
        assert agent["RunAtLoad"] is True
        assert agent["KeepAlive"] == {"SuccessfulExit": False}
        assert agent["StandardErrorPath"] == str(log)

    def test_loads_it_now_and_replaces_an_earlier_one(self, tmp_path):
        run = Recorder()
        self.install(tmp_path, run)
        assert [c[:2] for c in run.calls] == [["launchctl", "bootout"], ["launchctl", "bootstrap"]]

    def test_a_failed_load_is_reported(self, tmp_path):
        with pytest.raises(service.ServiceError):
            self.install(tmp_path, Recorder(fail={"bootstrap"}))

    def test_uninstall_unloads_and_removes_it(self, tmp_path):
        self.install(tmp_path, Recorder())
        run = Recorder()
        service.uninstall(platform="darwin", home=tmp_path, run=run)
        assert not service.launchd_paths(tmp_path)[0].exists()
        assert run.calls[0][:2] == ["launchctl", "bootout"]


class TestLinux:
    @pytest.fixture(autouse=True)
    def systemctl_present(self, monkeypatch):
        monkeypatch.setattr(service.shutil, "which", lambda name: "/usr/bin/" + name)

    def install(self, tmp_path, run, env=None):
        return service.install(
            platform="linux", home=tmp_path, python=PYTHON, run=run, env=env or {}
        )

    def test_writes_a_user_unit_started_at_login(self, tmp_path):
        self.install(tmp_path, Recorder())
        unit = (tmp_path / ".config/systemd/user/read-aloud-server.service").read_text()
        assert f"ExecStart={PYTHON} -m tts_server serve\n" in unit
        assert "Restart=on-failure" in unit
        assert "WantedBy=default.target" in unit

    def test_honours_xdg_config_home(self, tmp_path):
        self.install(tmp_path, Recorder(), env={"XDG_CONFIG_HOME": str(tmp_path / "cfg")})
        assert (tmp_path / "cfg/systemd/user/read-aloud-server.service").exists()

    def test_enables_and_starts_it_now(self, tmp_path):
        run = Recorder()
        self.install(tmp_path, run)
        assert ["systemctl", "--user", "enable", "--now", "read-aloud-server.service"] in run.calls

    def test_a_path_with_a_space_is_quoted(self):
        unit = service.systemd_unit(["/home/a reader/python", "-m", "tts_server", "serve"])
        assert 'ExecStart="/home/a reader/python" -m tts_server serve' in unit

    def test_without_systemd_it_says_what_to_do_instead(self, tmp_path, monkeypatch):
        monkeypatch.setattr(service.shutil, "which", lambda name: None)
        with pytest.raises(service.ServiceError, match="autostart"):
            self.install(tmp_path, Recorder())

    def test_uninstall_disables_and_removes_it(self, tmp_path):
        self.install(tmp_path, Recorder())
        run = Recorder()
        service.uninstall(platform="linux", home=tmp_path, run=run, env={})
        assert not (tmp_path / ".config/systemd/user/read-aloud-server.service").exists()
        assert ["systemctl", "--user", "disable", "--now", "read-aloud-server.service"] in run.calls


class TestWindows:
    def test_registers_at_login_and_starts_now(self, tmp_path):
        registry, started = FakeRegistry(), []
        service.install(
            platform="win32", home=tmp_path, python=PYTHON, registry=registry,
            start=started.append, env={"LOCALAPPDATA": str(tmp_path / "Local")},
        )
        log = tmp_path / "Local" / "read-aloud-server" / "server.log"
        assert started == [[PYTHON, "-m", "tts_server", "serve", "--log-file", str(log)]]
        assert registry.values[service.WINDOWS_RUN_VALUE] == subprocess.list2cmdline(started[0])
        assert log.parent.is_dir()

    def test_uninstall_removes_it(self, tmp_path):
        registry = FakeRegistry()
        service.install(platform="win32", home=tmp_path, python=PYTHON, registry=registry,
                        start=lambda cmd: None, env={})
        service.uninstall(platform="win32", home=tmp_path, registry=registry, env={})
        assert registry.values == {}


def test_uninstall_with_nothing_installed_says_so(tmp_path):
    lines = service.uninstall(platform="win32", home=tmp_path, registry=FakeRegistry(), env={})
    assert lines == ["No login service was installed"]


class TestCommandLine:
    @pytest.mark.parametrize(
        "argv, command",
        [
            ([], "serve"),
            (["--port", "7861"], "serve"),
            (["serve"], "serve"),
            (["install-service"], "install-service"),
            (["uninstall-service"], "uninstall-service"),
        ],
    )
    def test_routes_each_command(self, argv, command, monkeypatch):
        seen = []
        for name in ("_serve", "_install", "_uninstall"):
            monkeypatch.setattr(cli, name, lambda args, name=name: seen.append(args) or 0)
        assert cli.main(argv) == 0
        assert seen[0].command == command
        if command == "serve":
            assert seen[0].port == (7861 if "7861" in argv else 7860)
            assert seen[0].host == "127.0.0.1"
