"""Covers select_device: cuda, then mps, then cpu, with advice true to the platform.

On an Apple Silicon Mac the server once ran on the CPU and told the user to
re-run uv sync for a CUDA wheel that macOS cannot have (000049). Imported from
tts_server.device, which takes torch as an argument, so no GPU and no torch are
needed here.
"""

import logging
from types import SimpleNamespace

import pytest

from tts_server.device import log_environment, select_device


def fake_torch(cuda=False, cuda_build="12.8", mps_built=False, mps_available=False, mps=True):
    backends = SimpleNamespace()
    if mps:
        backends.mps = SimpleNamespace(
            is_built=lambda: mps_built, is_available=lambda: mps_available
        )
    return SimpleNamespace(
        __version__="2.10.0",
        version=SimpleNamespace(cuda=cuda_build),
        cuda=SimpleNamespace(
            is_available=lambda: cuda,
            get_device_name=lambda i: "RTX 4070 Ti",
            device_count=lambda: 1 if cuda else 0,
            get_device_properties=lambda i: SimpleNamespace(
                name="RTX 4070 Ti", total_memory=12 * 1024**3, major=8, minor=9
            ),
        ),
        backends=backends,
    )


@pytest.fixture
def messages(caplog):
    caplog.set_level(logging.INFO, logger="tts_server.device")
    return lambda: " ".join(r.getMessage() for r in caplog.records)


def test_cuda_comes_first():
    torch = fake_torch(cuda=True, mps_built=True, mps_available=True)
    assert select_device(torch, platform="linux") == "cuda"


def test_mps_when_there_is_no_cuda(messages):
    torch = fake_torch(cuda_build=None, mps_built=True, mps_available=True)
    assert select_device(torch, platform="darwin") == "mps"
    assert "mps" in messages()


def test_cpu_on_a_mac_never_gives_cuda_advice(messages):
    for built in (True, False):
        torch = fake_torch(cuda_build=None, mps_built=built, mps_available=False)
        assert select_device(torch, platform="darwin") == "cpu"
    assert "CUDA" not in messages()


def test_mac_without_a_usable_metal_gpu_is_not_told_to_reinstall(messages):
    torch = fake_torch(cuda_build=None, mps_built=True, mps_available=False)
    select_device(torch, platform="darwin")
    assert "uv sync" not in messages()


def test_mac_torch_without_mps_is_told_to_reinstall(messages):
    torch = fake_torch(cuda_build=None, mps_built=False, mps_available=False)
    select_device(torch, platform="darwin")
    assert "uv sync" in messages()
    assert "MPS" in messages()


def test_cpu_only_wheel_off_mac_points_at_the_cuda_wheel(messages):
    torch = fake_torch(cuda_build=None)
    assert select_device(torch, platform="win32") == "cpu"
    assert "CUDA wheel" in messages()


def test_cuda_wheel_with_no_gpu_says_so(messages):
    torch = fake_torch(cuda_build="12.8")
    assert select_device(torch, platform="linux") == "cpu"
    assert "found no usable GPU" in messages()


def test_a_torch_with_no_mps_backend_at_all_falls_through_to_cpu():
    torch = fake_torch(cuda_build=None, mps=False)
    assert select_device(torch, platform="darwin") == "cpu"


def test_environment_log_names_the_mps_state(messages):
    log_environment(fake_torch(cuda_build=None, mps_built=True, mps_available=True))
    assert "MPS (Apple GPU): available" in messages()


def test_environment_log_lists_cuda_devices(messages):
    log_environment(fake_torch(cuda=True))
    assert "CUDA device 0: RTX 4070 Ti" in messages()
