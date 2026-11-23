"""Which compute device Kokoro runs on, and why.

Kept free of a torch import, like alignment.py: torch is passed in, so the cheap
test run can drive every branch with a stand-in and no GPU (000049).
"""

import logging
import sys

logger = logging.getLogger(__name__)


def _mps(torch):
    """(built, available) for Apple's Metal backend; a torch without it says (False, False)."""
    mps = getattr(getattr(torch, "backends", None), "mps", None)
    if mps is None:
        return False, False
    return mps.is_built(), mps.is_available()


def log_environment(torch) -> None:
    logger.info("torch %s (CUDA build: %s)", torch.__version__, torch.version.cuda or "none")
    if torch.cuda.is_available():
        for i in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(i)
            logger.info(
                "CUDA device %d: %s (%.1f GiB, compute %d.%d)",
                i, props.name, props.total_memory / 1024**3, props.major, props.minor,
            )
    built, available = _mps(torch)
    if built:
        logger.info("MPS (Apple GPU): %s", "available" if available else "built but not available")


def select_device(torch, platform: str = sys.platform) -> str:
    """Pick cuda, then mps, then cpu, and when it is the CPU say why.

    Ending up on the CPU has different causes: no GPU on this machine, or a torch
    wheel that cannot see the GPU that is there. Only the second is fixable by
    reinstalling, and the fix depends on the platform. CUDA wheels exist only
    for Windows and Linux (000014). On macOS the GPU is reached through MPS,
    which the ordinary PyPI wheel already carries, so CUDA advice there is
    wrong.
    """
    if torch.cuda.is_available():
        logger.info("Using device: cuda (%s)", torch.cuda.get_device_name(0))
        return "cuda"

    mps_built, mps_available = _mps(torch)
    if mps_available:
        logger.info("Using device: mps (Apple GPU)")
        return "mps"

    if platform == "darwin":
        if mps_built:
            logger.info(
                "Using device: cpu — torch supports MPS but this Mac has no usable "
                "Metal GPU (MPS needs macOS 12.3 or later).",
            )
        else:
            logger.warning(
                "Using device: cpu — this torch build has no MPS support (%s), so the "
                "Apple GPU is invisible to it. Re-run `uv sync` in server/ to get "
                "the PyPI wheel, which has it.",
                torch.__version__,
            )
    elif torch.version.cuda is None:
        logger.warning(
            "Using device: cpu — this torch is a CPU-only build (%s), so any GPU "
            "on this machine is invisible to it. Re-run `uv sync` in server/ to "
            "pick up the CUDA wheel.",
            torch.__version__,
        )
    else:
        logger.info(
            "Using device: cpu — torch has CUDA %s support but found no usable GPU.",
            torch.version.cuda,
        )
    return "cpu"
