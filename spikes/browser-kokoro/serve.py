"""Serve the spike page cross-origin isolated.

ONNX Runtime's WASM backend runs multi-threaded only when the page is
crossOriginIsolated, which needs COOP and COEP headers. A plain
`python -m http.server` sends neither, so WASM silently falls back to one
thread, and the realtime figure it reports is a single-core number.

    python spikes/browser-kokoro/serve.py        # http://localhost:8000
"""

import functools
import http.server
import pathlib
import sys

PAGE = pathlib.Path(__file__).resolve().parent / "page"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class IsolatedHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        # credentialless rather than require-corp: the model files come from
        # Hugging Face's CDN, and every cross-origin resource would otherwise
        # have to send Cross-Origin-Resource-Policy. Firefox supports both.
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


handler = functools.partial(IsolatedHandler, directory=str(PAGE))
with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as server:
    print(f"Serving {PAGE} cross-origin isolated on http://localhost:{PORT}", flush=True)
    server.serve_forever()
