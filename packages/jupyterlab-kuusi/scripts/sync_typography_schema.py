#!/usr/bin/env python3
"""Sync shared typography schema fragment into Article / Slides / Mind Map schemas.

JupyterLab settings cannot $ref across schema files, so structural fields live in
schema-src/fragments/typography.json (outside schemaDir) and are merged into each
view schema here. Keep fragments out of ``schema/`` — JupyterLab recursively
loads every ``**/*.json`` under schemaDir as a settings plugin, and nested paths
like ``fragments/typography`` break ``/lab/api/settings`` (blank Lab UI).
View-specific title / description / default / range overlays stay in this script.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "schema"
FRAGMENT = ROOT / "schema-src" / "fragments" / "typography.json"

# Keys present in the shared fragment. Mind Map skips fontSize (uses displayFontSize).
SHARED_KEYS = [
    "font",
    "fontSize",
    "color",
    "strongColor",
    "letterSpacing",
    "lineHeight",
    "paragraphSpacing",
    "paragraphIndent",
    "paragraphAlign",
    "linkStyle",
    "headers",
    "codeStyle",
    "codeFrame",
    "codeFrameColor",
    "codeBackground",
    "blockquoteBackground",
    "blockquoteColor",
    "blockquoteBarColor",
    "codeFrameRadius",
    "codeFrameBorder",
    "codeFrameWidth",
    "imageWidth",
    "imageAlign",
    "imageWrap",
    "imageBorderStyle",
    "imageBorderWidth",
    "imageBorderColor",
    "imageRadius",
]

HEADER_COLOR_DESC = {
    "article": "CSS hex color, or empty to follow the page foreground.",
    "slides": "CSS hex color, or empty to follow the slide text color.",
    "mindmap": "CSS hex color, or empty to follow the node foreground.",
}

# Per-view copy + structural overrides. Missing fields keep fragment values.
# `schema_key` remaps fragment `color` → slides `textColor`.
# `omit_default` drops default from the merged property.
VIEW_META: dict[str, dict[str, Any]] = {
    "article": {
        "file": "article.json",
        "skip_keys": [],
        "color_key": "color",
        "header_color_desc": HEADER_COLOR_DESC["article"],
        "props": {
            "font": {
                "title": "Article body font",
                "description": "Font family for Article body text.",
            },
            "fontSize": {
                "title": "Article body font size",
                "description": "Body size for the Article reading pane.",
            },
            "color": {
                "title": "Article body color",
                "description": "Body text color. Empty follows the page foreground.",
            },
            "strongColor": {
                "title": "Article bold color",
                "description": "Color for bold (**strong**) body text. Empty inherits the body color.",
            },
            "letterSpacing": {
                "title": "Article letter spacing",
                "description": "Tracking for body text, in pt (0–3).",
            },
            "lineHeight": {
                "title": "Article leading",
                "description": "Line-height multiplier for Article body paragraphs (0.9–3).",
                "minimum": 0.9,
                "maximum": 3,
                # Must equal DEFAULT_ARTICLE_SETTINGS (the Notebook theme preset),
                # or a fresh install looks "customized".
                "default": 1.55,
            },
            "paragraphSpacing": {
                "title": "Article paragraph spacing",
                "description": "Vertical space between body paragraphs, in pt (0–48).",
                "default": 10,
            },
            "paragraphIndent": {
                "title": "Article paragraph indent",
                "description": "First-line indent for body paragraphs, in pt (0–72).",
            },
            "paragraphAlign": {
                "title": "Article paragraph alignment",
                "description": "Horizontal alignment for body paragraphs.",
            },
            "linkStyle": {
                "title": "Article link style",
                "description": "How hyperlinks are emphasized in the Article body.",
            },
            "headers": {
                "title": "Article headers",
                "description": "Per-level heading styles (H1–H6): font, size, color, and alignment.",
            },
            "codeStyle": {
                "title": "Article code style",
                "description": "Appearance of inline code and fenced code blocks.",
            },
            "codeFrame": {
                "title": "Article code frame",
                "description": "Draw a border around fenced code blocks. Unset follows the code style (Plain and Contrast are framed).",
                "omit_default": True,
            },
            "codeFrameColor": {
                "title": "Article code frame color",
                "description": "CSS hex color, or empty to follow the page foreground.",
            },
            "codeBackground": {
                "title": "Article code background color",
                "description": "Background of fenced code blocks, as a CSS color; empty keeps the code theme's own.",
            },
            "blockquoteBackground": {
                "title": "Article quote background color",
                "description": "Background of block quotes, as a CSS color; empty keeps the quote weight's own.",
            },
            "blockquoteColor": {
                "title": "Article quote text color",
                "description": "Text color of block quotes, as a CSS color; empty keeps the quote weight's own.",
            },
            "blockquoteBarColor": {
                "title": "Article quote bar color",
                "description": "Color of the vertical bar of block quotes, as a CSS color; empty keeps the quote weight's own.",
            },
            "codeFrameRadius": {
                "title": "Article code corner radius",
                "description": "Corner radius of code blocks, in px (0–24).",
            },
            "codeFrameBorder": {
                "title": "Article code frame stroke",
                "description": "Border width of the code frame, in px (0–8).",
            },
            "codeFrameWidth": {
                "title": "Article code block width",
                "description": "Maximum width of code blocks, as percent of the column (40–100).",
            },
            "imageWidth": {
                "title": "Article image width",
                "description": "How wide images may grow inside the Article column.",
            },
            "imageAlign": {
                "title": "Article image alignment",
                "description": "Horizontal placement when images sit on their own line.",
            },
            "imageWrap": {
                "title": "Article image wrap",
                "description": "Whether following text wraps beside the image.",
            },
            "imageBorderStyle": {
                "title": "Article image border style",
            },
            "imageBorderWidth": {
                "title": "Article image border width",
                "description": "Image border thickness in px (0–12).",
            },
            "imageBorderColor": {
                "title": "Article image border color",
                "description": "CSS hex color, or empty to follow the page foreground.",
            },
            "imageRadius": {
                "title": "Article image corner radius",
                "description": "Image corner radius in px (0–32).",
            },
        },
    },
    "slides": {
        "file": "markdown-slides.json",
        "skip_keys": [],
        "color_key": "textColor",
        "header_color_desc": HEADER_COLOR_DESC["slides"],
        "props": {
            "font": {
                "title": "Slides body font",
                "description": "Font family for slide body text.",
            },
            "fontSize": {
                "title": "Slides body font size",
                "description": "Body size for slide text.",
            },
            "color": {
                "title": "Slides body color",
                "description": "Body text color. Empty follows the slide foreground.",
            },
            "strongColor": {
                "title": "Slides bold color",
                "description": "Color for bold (**strong**) body text. Empty inherits the body color.",
            },
            "letterSpacing": {
                "title": "Slides letter spacing",
                "description": "Tracking for body text, in pt (0–3).",
            },
            "lineHeight": {
                "title": "Slides leading",
                "description": "Line-height multiplier for slide body text (0.9–2.4).",
                "minimum": 0.9,
                "maximum": 2.4,
                "default": 1.45,
            },
            "paragraphSpacing": {
                "title": "Slides paragraph spacing",
                "description": "Vertical space between body paragraphs, in pt (0–48).",
                "omit_default": True,
            },
            "paragraphIndent": {
                "title": "Slides paragraph indent",
                "description": "First-line indent for body paragraphs, in pt (0–72).",
            },
            "paragraphAlign": {
                "title": "Slides paragraph alignment",
                "description": "Horizontal alignment for body paragraphs.",
            },
            "linkStyle": {
                "title": "Slides link style",
                "description": "How hyperlinks are emphasized on slides.",
            },
            "headers": {
                "title": "Slides headers",
                "description": "Per-level heading styles (H1–H6): font, size, color, and alignment.",
                "omit_default": True,
            },
            "codeStyle": {
                "title": "Slides code style",
                "description": "Appearance of inline code and fenced code blocks.",
            },
            "codeFrame": {
                "title": "Slides code frame",
                "description": "Draw a border around fenced code blocks.",
                "default": True,
            },
            "codeFrameColor": {
                "title": "Slides code frame color",
                "description": "CSS hex color, or empty to follow the slide foreground.",
            },
            "codeBackground": {
                "title": "Slides code background color",
                "description": "Background of fenced code blocks, as a CSS color; empty keeps the code theme's own.",
            },
            "blockquoteBackground": {
                "title": "Slides quote background color",
                "description": "Background of block quotes, as a CSS color; empty keeps the quote weight's own.",
            },
            "blockquoteColor": {
                "title": "Slides quote text color",
                "description": "Text color of block quotes, as a CSS color; empty keeps the quote weight's own.",
            },
            "blockquoteBarColor": {
                "title": "Slides quote bar color",
                "description": "Color of the vertical bar of block quotes, as a CSS color; empty keeps the quote weight's own.",
            },
            "codeFrameRadius": {
                "title": "Slides code corner radius",
                "description": "Corner radius of code blocks, in px (0–24).",
                "default": 8,
            },
            "codeFrameBorder": {
                "title": "Slides code frame stroke",
                "description": "Border width of the code frame, in px (0–8).",
            },
            "codeFrameWidth": {
                "title": "Slides code block width",
                "description": "Maximum width of code blocks, as percent of the slide (40–100).",
            },
            "imageWidth": {
                "title": "Slides image width",
                "description": "How wide images may grow on a slide.",
            },
            "imageAlign": {
                "title": "Slides image alignment",
                "description": "Horizontal placement when images sit on their own line.",
            },
            "imageWrap": {
                "title": "Slides image wrap",
                "description": "Whether following text wraps beside the image.",
            },
            "imageBorderStyle": {
                "title": "Slides image border style",
            },
            "imageBorderWidth": {
                "title": "Slides image border width",
                "description": "Image border thickness in px (0–12).",
            },
            "imageBorderColor": {
                "title": "Slides image border color",
                "description": "CSS hex color, or empty to follow the slide foreground.",
            },
            "imageRadius": {
                "title": "Slides image corner radius",
                "description": "Image corner radius in px (0–32).",
            },
        },
    },
    "mindmap": {
        "file": "plugin.json",
        "skip_keys": ["fontSize"],
        "color_key": "color",
        "header_color_desc": HEADER_COLOR_DESC["mindmap"],
        "props": {
            "font": {
                "title": "Mind map body font",
                "description": "Font family for Body nodes.",
            },
            "color": {
                "title": "Mind map body color",
                "description": "Body text color. Empty follows the node foreground.",
            },
            "strongColor": {
                "title": "Mind map bold color",
                "description": "Color for bold (**strong**) body text. Empty inherits the body color.",
            },
            "letterSpacing": {
                "title": "Mind map letter spacing",
                "description": "Tracking for Body nodes, in pt (0–3).",
            },
            "lineHeight": {
                "title": "Mind map leading",
                "description": "Line-height multiplier for Body nodes (0.9–2.4).",
                "minimum": 0.9,
                "maximum": 2.4,
                "default": 1.5,
            },
            "paragraphSpacing": {
                "title": "Mind map paragraph spacing",
                "description": "Vertical space between paragraphs inside a node, in pt (0–48).",
                "default": 0.5,
            },
            "paragraphIndent": {
                "title": "Mind map paragraph indent",
                "description": "First-line indent inside Body nodes, in pt (0–72).",
            },
            "paragraphAlign": {
                "title": "Mind map paragraph alignment",
            },
            "linkStyle": {
                "title": "Mind map link style",
            },
            "headers": {
                "title": "Mind map headings",
                "description": "H1–H3 style tree frames. H4–H6 style titles inside a card. Defaults match Body so existing maps do not jump.",
                # Keep existing mind-map headers default from schema file.
                "preserve_default": True,
            },
            "codeStyle": {
                "title": "Mind map code style",
                "description": "Appearance of inline code and fenced code blocks inside nodes.",
            },
            "codeFrame": {
                "title": "Mind map code frame",
                "description": "Draw a border around fenced code blocks inside nodes.",
                "preserve_default": True,
            },
            "codeFrameColor": {
                "title": "Mind map code frame color",
                "description": "CSS hex color, or empty to follow the node foreground.",
            },
            "codeBackground": {
                "title": "Mind Map code background color",
                "description": "Background of fenced code blocks, as a CSS color; empty keeps the code theme's own.",
            },
            "blockquoteBackground": {
                "title": "Mind Map quote background color",
                "description": "Background of block quotes, as a CSS color; empty keeps the quote weight's own.",
            },
            "blockquoteColor": {
                "title": "Mind Map quote text color",
                "description": "Text color of block quotes, as a CSS color; empty keeps the quote weight's own.",
            },
            "blockquoteBarColor": {
                "title": "Mind Map quote bar color",
                "description": "Color of the vertical bar of block quotes, as a CSS color; empty keeps the quote weight's own.",
            },
            "codeFrameRadius": {
                "title": "Mind map code corner radius",
                "description": "Corner radius of code blocks, in px (0–24).",
                "preserve_default": True,
            },
            "codeFrameBorder": {
                "title": "Mind map code frame stroke",
                "description": "Border width of the code frame, in px (0–8).",
            },
            "codeFrameWidth": {
                "title": "Mind map code block width",
                "description": "Maximum width of code blocks, as percent of the node (40–100).",
            },
            "imageWidth": {
                "title": "Mind map image width",
                "description": "How wide images may grow inside a node.",
            },
            "imageAlign": {
                "title": "Mind map image alignment",
            },
            "imageWrap": {
                "title": "Mind map image wrap",
            },
            "imageBorderStyle": {
                "title": "Mind map image border style",
            },
            "imageBorderWidth": {
                "title": "Mind map image border width",
                "description": "Image border thickness in px (0–12).",
            },
            "imageBorderColor": {
                "title": "Mind map image border color",
                "description": "CSS hex color, or empty to follow the node foreground.",
            },
            "imageRadius": {
                "title": "Mind map image corner radius",
                "description": "Image corner radius in px (0–32).",
            },
        },
    },
}


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def _dump(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def _merge_prop(
    base: dict[str, Any],
    overlay: dict[str, Any],
    previous: dict[str, Any] | None,
) -> dict[str, Any]:
    merged = copy.deepcopy(base)
    overlay = dict(overlay)
    omit_default = overlay.pop("omit_default", False)
    preserve_default = overlay.pop("preserve_default", False)

    for key, value in overlay.items():
        merged[key] = value

    if omit_default:
        merged.pop("default", None)
    elif preserve_default and previous and "default" in previous:
        merged["default"] = copy.deepcopy(previous["default"])

    return merged


def sync_view(view: str, fragment: dict[str, Any]) -> None:
    meta = VIEW_META[view]
    path = SCHEMA / meta["file"]
    schema = _load(path)
    previous_props = schema.get("properties", {})

    header = copy.deepcopy(fragment["definitions"]["headerStyle"])
    header["properties"]["color"]["description"] = meta["header_color_desc"]
    schema.setdefault("definitions", {})["headerStyle"] = header

    skip = set(meta["skip_keys"])
    color_key = meta["color_key"]
    prop_meta: dict[str, Any] = meta["props"]

    for key in SHARED_KEYS:
        if key in skip:
            continue

        schema_key = color_key if key == "color" else key
        base = copy.deepcopy(fragment["properties"][key])
        overlay = prop_meta.get(key, {})
        schema["properties"][schema_key] = _merge_prop(
            base,
            overlay,
            previous_props.get(schema_key),
        )

    _dump(path, schema)
    print(f"synced typography → {path.relative_to(ROOT)}")


def main() -> None:
    fragment = _load(FRAGMENT)
    for view in ("article", "slides", "mindmap"):
        sync_view(view, fragment)
    print("ok")


if __name__ == "__main__":
    main()
