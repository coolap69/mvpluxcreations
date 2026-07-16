"""Inventory unassociated repository images as unpublished Admin drafts.

This script reads source files and image paths. It never edits image files and
never publishes products. Run it locally after adding images:

    python3 sync-products.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent
IMAGES_ROOT = ROOT / "images"
OUTPUT = ROOT / "product-drafts.json"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
SOURCE_SUFFIXES = {".html", ".js", ".css", ".json"}
IMAGE_REFERENCE = re.compile(r"images/[A-Za-z0-9_./ -]+\.(?:png|jpe?g|webp|gif)", re.IGNORECASE)
EXCLUDED_ASSET_DIRECTORIES = (
    "images/Business/",
    "images/FanBackgrounds/",
    "images/FrontPageWeb/",
    "images/Herobackgroundparts/",
)
EXCLUDED_ASSET_PATHS = {
    "images/DinosaurCreatureStandees/notorch.jpg",
    "images/DinosaurCreatureStandees/size.jpg",
}


def repository_images() -> list[str]:
    return sorted(
        path.relative_to(ROOT).as_posix()
        for path in IMAGES_ROOT.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )


def associated_images() -> set[str]:
    references: set[str] = set()
    for path in ROOT.iterdir():
        if path == OUTPUT or not path.is_file() or path.suffix.lower() not in SOURCE_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        references.update(match.group(0) for match in IMAGE_REFERENCE.finditer(text))
    return references


def is_excluded_asset(image_path: str) -> bool:
    return image_path in EXCLUDED_ASSET_PATHS or image_path.startswith(EXCLUDED_ASSET_DIRECTORIES)


def existing_drafts() -> dict[str, dict[str, object]]:
    if not OUTPUT.exists():
        return {}
    try:
        data = json.loads(OUTPUT.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    return {item["path"]: item for item in data if isinstance(item, dict) and item.get("path")}


def main() -> None:
    repository = repository_images()
    associated = associated_images() & set(repository)
    excluded = {
        image_path for image_path in repository
        if image_path not in associated and is_excluded_asset(image_path)
    }
    previous = existing_drafts()
    drafts = []

    for image_path in repository:
        if image_path in excluded or image_path in associated:
            continue
        drafts.append(
            {
                "path": image_path,
                "title": previous.get(image_path, {}).get("title", ""),
                "slug": previous.get(image_path, {}).get("slug", ""),
                "description": previous.get(image_path, {}).get("description", ""),
                "originalHeight": previous.get(image_path, {}).get("originalHeight", ""),
                "backgroundImage": previous.get(image_path, {}).get(
                    "backgroundImage",
                    "images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg",
                ),
                "categories": previous.get(image_path, {}).get("categories", []),
                "published": False,
            }
        )

    OUTPUT.write_text(json.dumps(drafts, indent=2) + "\n", encoding="utf-8")
    print(f"Total supported images: {len(repository)}")
    print(f"Associated product images: {len(associated)}")
    print(f"Excluded website assets: {len(excluded)}")
    print(f"Wrote {len(drafts)} unpublished image drafts to {OUTPUT.name}.")
    print("No image files were modified.")


if __name__ == "__main__":
    main()
