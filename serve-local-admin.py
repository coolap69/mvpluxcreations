#!/usr/bin/env python3
"""Serve the repository and a read-only local Image Inbox inventory."""

from __future__ import annotations

import json
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


REPOSITORY_ROOT = Path(__file__).resolve().parent
IMAGE_ROOT = REPOSITORY_ROOT / "images"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def image_paths_on_disk() -> list[str]:
    return sorted(
        path.relative_to(REPOSITORY_ROOT).as_posix()
        for path in IMAGE_ROOT.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )


def image_paths_on_origin_main() -> list[str]:
    result = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", "origin/main", "--", "images"],
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return []
    return sorted(
        path
        for path in result.stdout.splitlines()
        if Path(path).suffix.lower() in IMAGE_SUFFIXES and path.startswith("images/")
    )


class LocalAdminHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPOSITORY_ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802 - inherited HTTP method name
        if urlparse(self.path).path != "/api/local-image-inventory":
            super().do_GET()
            return
        images = image_paths_on_disk()
        repository_images = image_paths_on_origin_main()
        body = json.dumps(
            {
                "source": "local",
                "images": images,
                "repositoryImages": repository_images,
                "newImages": sorted(set(images) - set(repository_images)),
            }
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 3000), LocalAdminHandler)
    print("Local Admin: http://localhost:3000/admin.html")
    print("Image Inbox scans images/ automatically. Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
