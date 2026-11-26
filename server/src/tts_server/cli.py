"""The `read-aloud-server` command (000070).

    read-aloud-server                    run the server (the same as `serve`)
    read-aloud-server install-service    start it at every login, and now
    read-aloud-server uninstall-service  stop doing that

Kept free of torch so that installing or removing the service never loads it;
only `serve` imports the app, and only once it has been asked to run.
"""

from __future__ import annotations

import argparse
import sys

DEFAULT_HOST = "127.0.0.1"
# The port the extension's manifest already holds a host permission for, so
# the default install needs no extra grant from the reader.
DEFAULT_PORT = 7860


def _serve(args: argparse.Namespace) -> int:
    if args.log_file:
        # A login service has no terminal, and pythonw on Windows has no
        # stdout or stderr at all. Point both at the log before the app's
        # logging is configured, so everything the server says lands there.
        stream = open(args.log_file, "a", buffering=1, encoding="utf-8")
        sys.stdout = sys.stderr = stream

    import uvicorn

    uvicorn.run("tts_server.main:app", host=args.host, port=args.port)
    return 0


def _install(_args: argparse.Namespace) -> int:
    from . import service

    try:
        lines = service.install()
    except service.ServiceError as error:
        print(f"Could not install the login service: {error}", file=sys.stderr)
        return 1
    for line in lines:
        print(line)
    print(
        f"The server now starts at login and is starting now on "
        f"http://localhost:{DEFAULT_PORT}. The first reading loads the voice "
        f"model, which takes a few seconds once."
    )
    return 0


def _uninstall(_args: argparse.Namespace) -> int:
    from . import service

    try:
        lines = service.uninstall()
    except service.ServiceError as error:
        print(f"Could not remove the login service: {error}", file=sys.stderr)
        return 1
    for line in lines:
        print(line)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="read-aloud-server",
        description="The local Kokoro server for the Read Aloud extension.",
    )
    commands = parser.add_subparsers(dest="command")

    serve = commands.add_parser("serve", help="run the server (the default)")
    serve.add_argument("--host", default=DEFAULT_HOST)
    serve.add_argument("--port", type=int, default=DEFAULT_PORT)
    serve.add_argument("--log-file", help="write all output here instead of the terminal")
    serve.set_defaults(func=_serve)

    commands.add_parser(
        "install-service", help="start the server at every login, and now"
    ).set_defaults(func=_install)
    commands.add_parser(
        "uninstall-service", help="stop starting the server at login"
    ).set_defaults(func=_uninstall)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    argv = sys.argv[1:] if argv is None else argv
    # Bare `read-aloud-server` runs the server, the way `uvicorn ...` did.
    if not argv or argv[0].startswith("-") and argv[0] not in ("-h", "--help"):
        argv = ["serve", *argv]
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
