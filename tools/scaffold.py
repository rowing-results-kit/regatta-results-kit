#!/usr/bin/env python3
"""
scaffold.py — 大会設定を元にサイト・GAS をワンショット生成する

使い方:
  python3 tools/scaffold.py --config tournament.config.json [--out <dir>]

処理順序（SPEC §3 準拠）:
  1. config 検証（必須フィールド・色形式）
  2. __ADMIN_PATH__ → ランダム8hex / __STAFF_PATH__ → ランダム6hex に置換（ディレクトリ名ごと）
  3. staff テンプレの {{...}} を config 値で全置換（置換漏れゼロを自己検査・残存なら exit 1）
  4. site/ の brand CSS 変数を config.brand で上書き
  5. master.json 雛形（schema_version:3）を site/data/ に生成
  6. docs/SETUP_GUIDE.generated.md を出力（セットアップ手順書）
  7. 実行サマリ表示
"""

import argparse
import json
import os
import re
import secrets
import sys
from pathlib import Path

TOOLS_DIR   = Path(__file__).resolve().parent
PROJECT_DIR = TOOLS_DIR.parent

sys.path.insert(0, str(TOOLS_DIR))
from common import C


# ---------------------------------------------------------------------------
# 検証
# ---------------------------------------------------------------------------
REQUIRED_FIELDS = [
    ("tournament", "id"),
    ("tournament", "name"),
    ("tournament", "venue"),
    ("tournament", "dates"),
    ("brand", "primary_color"),
    ("brand", "accent_color"),
    ("deploy", "github_repo"),
]

COLOR_RE = re.compile(r'^#[0-9A-Fa-f]{6}$')


def _validate_config(cfg: dict) -> list[str]:
    errors = []
    for section, key in REQUIRED_FIELDS:
        val = cfg.get(section, {}).get(key)
        if not val:
            errors.append(f"  missing: {section}.{key}")
    for color_key in ("primary_color", "accent_color"):
        val = cfg.get("brand", {}).get(color_key, "")
        if val and not COLOR_RE.match(val):
            errors.append(f"  invalid color format (must be #RRGGBB): brand.{color_key} = {val!r}")
    return errors


# ---------------------------------------------------------------------------
# ランダムパス生成
# ---------------------------------------------------------------------------
def _rand_hex(n: int) -> str:
    return secrets.token_hex(n // 2)


# ---------------------------------------------------------------------------
# ファイル内文字列置換（再帰）
# ---------------------------------------------------------------------------
def _replace_in_file(path: Path, mapping: dict[str, str]) -> None:
    text = path.read_text(encoding="utf-8")
    for placeholder, value in mapping.items():
        text = text.replace(placeholder, value)
    path.write_text(text, encoding="utf-8")


def _replace_in_dir(directory: Path, mapping: dict[str, str]) -> None:
    for p in directory.rglob("*"):
        if p.is_file() and not _is_binary(p):
            _replace_in_file(p, mapping)


def _is_binary(path: Path) -> bool:
    try:
        path.read_text(encoding="utf-8")
        return False
    except UnicodeDecodeError:
        return True


# ---------------------------------------------------------------------------
# ディレクトリ名のリネーム
# ---------------------------------------------------------------------------
def _rename_placeholder_dirs(base: Path, admin_path: str, staff_path: str) -> None:
    for old_name, new_name in [
        ("__ADMIN_PATH__", admin_path),
        ("__STAFF_PATH__", staff_path),
    ]:
        for match in list(base.rglob(old_name)):
            if match.is_dir():
                new_dir = match.parent / new_name
                match.rename(new_dir)
                print(f"  rename dir: {match.relative_to(base)} -> {new_dir.relative_to(base)}")


# ---------------------------------------------------------------------------
# brand CSS 変数の上書き
# ---------------------------------------------------------------------------
def _patch_brand_css(out_dir: Path, brand: dict) -> None:
    css_path = out_dir / "site" / "css" / "style.css"
    if not css_path.exists():
        print(f"  warn: {css_path} not found, skipping brand patch")
        return
    text = css_path.read_text(encoding="utf-8")
    if brand.get("primary_color"):
        text = re.sub(r'(--color-primary\s*:\s*)#[0-9A-Fa-f]{6}', f'\\g<1>{brand["primary_color"]}', text)
    if brand.get("accent_color"):
        text = re.sub(r'(--color-accent\s*:\s*)#[0-9A-Fa-f]{6}', f'\\g<1>{brand["accent_color"]}', text)
    css_path.write_text(text, encoding="utf-8")
    print(f"  patched brand CSS: {css_path.relative_to(out_dir)}")


# ---------------------------------------------------------------------------
# master.json 雛形生成（schema_version:3）
# ---------------------------------------------------------------------------
def _generate_master_json(out_dir: Path, cfg: dict) -> None:
    t = cfg.get("tournament", {})
    course = cfg.get("default_course", {"length_m": 1000, "measurement_points": [500, 1000]})
    categories = cfg.get("categories", ["M", "W", "X"])
    master = {
        "schema_version": 3,
        "tournament": {
            "id": t.get("id", ""),
            "name": t.get("name", ""),
            "venue": t.get("venue", ""),
            "dates": t.get("dates", []),
            "hub_url": t.get("hub_url", ""),
        },
        "default_course": {
            "length_m": course.get("length_m", 1000),
            "measurement_points": course.get("measurement_points", [500, 1000]),
        },
        "categories": categories,
        "races": [],
    }
    data_dir = out_dir / "site" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    dest = data_dir / "master.json"
    dest.write_text(json.dumps(master, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  generated: {dest.relative_to(out_dir)}")


# ---------------------------------------------------------------------------
# セットアップガイド生成
# ---------------------------------------------------------------------------
def _generate_setup_guide(out_dir: Path, cfg: dict, admin_path: str, staff_path: str) -> None:
    t   = cfg.get("tournament", {})
    dep = cfg.get("deploy", {})
    gas = cfg.get("gas", {})
    lines = [
        f"# セットアップガイド — {t.get('name', '{{TOURNAMENT_NAME}}')}",
        "",
        "scaffold.py により自動生成されました。",
        "",
        "## 大会情報",
        f"- 大会名: {t.get('name')}",
        f"- 会場: {t.get('venue')}",
        f"- 開催日: {', '.join(t.get('dates', []))}",
        "",
        "## GitHub / Cloudflare 設定",
        f"- `GITHUB_REPO` = `{dep.get('github_repo')}`",
        f"- 本番URL: {dep.get('pages_url') or '（未設定）'}",
        f"- テストURL: {dep.get('test_pages_url') or '（未設定）'}",
        "",
        "## 隠しパス（生成済み）",
        f"- 管理パス: `admin/{admin_path}/`",
        f"- スタッフパス: `staff/{staff_path}/`",
        "",
        "## GAS スクリプトプロパティ設定",
        "| プロパティ名 | 値 |",
        "|---|---|",
        f"| `GITHUB_REPO` | `{dep.get('github_repo')}` |",
        f"| `GITHUB_BRANCH` | `main` |",
        f"| `GITHUB_TOKEN` | ← GitHub PAT（fine-grained / Contents RW / 90日）|",
        f"| `DRIVE_ROOT_FOLDER_ID` | ← Google Drive ルートフォルダID |",
        f"| `TEMPLATE_SHEET_ID` | `{gas.get('pdf_template_sheet_id') or '未設定'}` |",
        f"| `PDF_OUTPUT_FOLDER_ID` | `{gas.get('pdf_output_folder_id') or '未設定'}` |",
        f"| `PDF_ARCHIVE_FOLDER_ID` | `{gas.get('pdf_archive_folder_id') or '未設定'}` |",
        f"| `JUDGE_TEMPLATE_SHEET_ID` | `{gas.get('judge_template_sheet_id') or '未設定'}` |",
        f"| `OUTPUT_FOLDER_ID` | `{gas.get('prep_folder_id') or '未設定'}` |",
        "",
        "## 次のステップ",
        "1. `git add -A && git commit -m \"chore: scaffold for <tournament-id>\" && git push origin main`",
        "2. Cloudflare Pages に接続（上記 GitHub_REPO を指定）",
        "3. GAS に上記スクリプトプロパティを設定してトリガーを有効化",
        "4. `make test` でローカル E2E テストが通ることを確認",
    ]
    docs_dir = out_dir / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)
    dest = docs_dir / "SETUP_GUIDE.generated.md"
    dest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  generated: {dest.relative_to(out_dir)}")


# ---------------------------------------------------------------------------
# 置換漏れ検査
# ---------------------------------------------------------------------------
PLACEHOLDER_RE = re.compile(r'\{\{[A-Z_]+\}\}')


def _check_leftovers(out_dir: Path, exclude_dirs: list[str]) -> list[str]:
    hits = []
    for p in out_dir.rglob("*"):
        if p.is_file() and not _is_binary(p):
            rel = p.relative_to(out_dir)
            if any(rel.parts[0] == d for d in exclude_dirs):
                continue
            text = p.read_text(encoding="utf-8")
            for m in PLACEHOLDER_RE.finditer(text):
                hits.append(f"  {rel}: {m.group()}")
    return hits


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Scaffold regatta site from tournament config")
    parser.add_argument("--config", default="tournament.config.json", help="Path to tournament.config.json")
    parser.add_argument("--out", default=str(PROJECT_DIR), help="Output directory (default: repo root)")
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        print(f"{C.RED}Error: config file not found: {config_path}{C.RESET}")
        print("  Run 'python3 tools/init_tournament.py' first to create it.")
        sys.exit(1)

    with open(config_path, encoding="utf-8") as f:
        cfg = json.load(f)

    # 1. 検証
    print(f"\n{C.CYAN}[1/7] Validating config...{C.RESET}")
    errors = _validate_config(cfg)
    if errors:
        print(f"{C.RED}Config validation failed:{C.RESET}")
        for e in errors:
            print(e)
        sys.exit(1)
    print("  OK")

    out_dir = Path(args.out).resolve()
    admin_path = _rand_hex(8)
    staff_path = _rand_hex(6)

    # 2. ディレクトリ名のリネーム
    print(f"\n{C.CYAN}[2/7] Renaming placeholder directories...{C.RESET}")
    _rename_placeholder_dirs(out_dir, admin_path, staff_path)

    # 3. staff テンプレの {{...}} 置換
    print(f"\n{C.CYAN}[3/7] Replacing staff template placeholders...{C.RESET}")
    t   = cfg.get("tournament", {})
    dep = cfg.get("deploy", {})
    dates = t.get("dates", [])
    dates_label = " / ".join(dates) if dates else ""
    mapping = {
        "{{TOURNAMENT_NAME}}": t.get("name", ""),
        "{{DATES_LABEL}}":     dates_label,
        "{{VENUE}}":           t.get("venue", ""),
        "{{TOURNAMENT_ID}}":   t.get("id", ""),
        "{{GITHUB_REPO}}":     dep.get("github_repo", ""),
        "{{SITE_URL}}":        dep.get("pages_url", ""),
        "{{HUB_URL}}":         t.get("hub_url", ""),
        "{{ADMIN_PATH}}":      admin_path,
        "{{STAFF_PATH}}":      staff_path,
    }
    staff_dir = out_dir / "staff" / staff_path
    if staff_dir.exists():
        _replace_in_dir(staff_dir, mapping)
        print(f"  replaced in: staff/{staff_path}/")
    site_dir = out_dir / "site"
    if site_dir.exists():
        _replace_in_dir(site_dir, mapping)
        print(f"  replaced in: site/")

    # 4. brand CSS
    print(f"\n{C.CYAN}[4/7] Patching brand CSS variables...{C.RESET}")
    _patch_brand_css(out_dir, cfg.get("brand", {}))

    # 5. master.json 雛形
    print(f"\n{C.CYAN}[5/7] Generating master.json skeleton...{C.RESET}")
    _generate_master_json(out_dir, cfg)

    # 6. セットアップガイド
    print(f"\n{C.CYAN}[6/7] Generating SETUP_GUIDE.generated.md...{C.RESET}")
    _generate_setup_guide(out_dir, cfg, admin_path, staff_path)

    # 7. 置換漏れ検査
    print(f"\n{C.CYAN}[7/7] Checking for leftover placeholders...{C.RESET}")
    exclude = ["template", "test", "docs", ".git", "__pycache__"]
    leftovers = _check_leftovers(out_dir, exclude)
    if leftovers:
        print(f"{C.RED}Placeholder check FAILED — remaining placeholders:{C.RESET}")
        for hit in leftovers[:20]:
            print(hit)
        if len(leftovers) > 20:
            print(f"  ... and {len(leftovers) - 20} more")
        sys.exit(1)
    print("  OK — no unresolved placeholders")

    # サマリ
    print(f"\n{C.GREEN}scaffold completed.{C.RESET}")
    print(f"  tournament : {t.get('name')}")
    print(f"  admin path : admin/{admin_path}/")
    print(f"  staff path : staff/{staff_path}/")
    print(f"  master.json: site/data/master.json")
    print(f"  setup guide: docs/SETUP_GUIDE.generated.md")
    print(f"\nNext: git add -A && git commit -m 'chore: scaffold for {t.get('id')}' && git push origin main")


if __name__ == "__main__":
    main()
