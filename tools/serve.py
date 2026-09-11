"""Servidor estático local para Horario.

Usa el puerto de la variable PORT si existe (así el panel de vista previa
puede asignar uno libre); si no, el 4173.

Uso:  python tools/serve.py
"""
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 4173))


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Sin cache: cada recarga trae el CSS y el JS recién guardados.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write("%s %s\n" % (self.log_date_time_string(), fmt % args))
        sys.stdout.flush()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=str(ROOT)))
    print(f"Horario en http://localhost:{PORT}/preview.html", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
