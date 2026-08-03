"""Covers the CORS policy from #000012.

The server used to accept every origin with credentials, so any site the user
happened to be browsing could POST to it and occupy the GPU — and `*` with
credentials is invalid per the CORS spec anyway, leaving Starlette to paper
over it.

The policy is exercised through real Starlette middleware using the regex from
main.py, rather than importing main.py, which pulls in torch via tts_engine.
"""

import pathlib
import re

import pytest
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

MAIN = pathlib.Path(__file__).resolve().parents[1] / "src" / "tts_server" / "main.py"
DEFAULT_ORIGIN_REGEX = re.search(
    r'DEFAULT_ORIGIN_REGEX = r"([^"]+)"', MAIN.read_text(encoding="utf-8")
).group(1)

EXTENSION_ORIGIN = "chrome-extension://" + "a" * 32


def client(allowed_origins=()):
    app = Starlette(routes=[Route("/api/health", lambda r: JSONResponse({"status": "ok"}))])
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(allowed_origins),
        allow_origin_regex=DEFAULT_ORIGIN_REGEX,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    return TestClient(app)


def allowed(origin, allowed_origins=()):
    response = client(allowed_origins).get("/api/health", headers={"Origin": origin})
    assert response.headers.get("access-control-allow-credentials") != "true"
    return response.headers.get("access-control-allow-origin") is not None


@pytest.mark.parametrize(
    "origin",
    [
        EXTENSION_ORIGIN,
        "chrome-extension://" + "abcdefghijklmnop" * 2,
    ],
)
def test_extension_origins_are_allowed(origin):
    assert allowed(origin)


@pytest.mark.parametrize(
    "origin",
    [
        "https://evil.example",
        "http://localhost:3000",
        "https://evil.example/" + EXTENSION_ORIGIN,
        "chrome-extension://" + "a" * 31,  # wrong length
        "chrome-extension://" + "z" * 32,  # outside a-p
    ],
)
def test_everything_else_is_blocked(origin):
    assert not allowed(origin)


def test_an_explicit_origin_can_be_added():
    # READ_ALOUD_ALLOWED_ORIGINS, for pointing another client at the server.
    assert allowed("http://localhost:3000", ["http://localhost:3000"])


def test_adding_one_origin_does_not_open_the_rest():
    assert not allowed("https://evil.example", ["http://localhost:3000"])


def test_the_preflight_the_extension_actually_sends_is_accepted():
    response = client().options(
        "/api/tts-with-timestamps",
        headers={
            "Origin": EXTENSION_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == EXTENSION_ORIGIN
