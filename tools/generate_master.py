#!/usr/bin/env python3
"""
スケジュール・エントリーCSV → data/master.json 変換ツール

schedule.csv + entries.csv を読み込み、フロントエンドが参照する
master.json を生成する。大会情報（名称・日程・会場）はコマンドライン引数で指定。

使い方:
  python3 tools/generate_master.py \
    --schedule test/csv/schedule_sample.csv \
    --entries  test/csv/entries_sample.csv  \
    --output   data/master.json             \
    --tournament "第16回全日本マスターズレガッタ" \
    --dates    "2025-06-07,2025-06-08"      \
    --venue    "長野・下諏訪ボートコース 1000m" \
    --points   "500m,1000m" \
    --youtube  ""

入力フォーマット:
  schedule.csv: race_no,event_code,event_name,category,age_group,round,date,time
  entries.csv : race_no,lane,crew_name,affiliation

  ※ ヘッダー行は大文字小文字を無視してマッチ。
  ※ BOM付きUTF-8（Excel出力）にも対応。

出力フォーマット (data/master.json):
  {
    "tournament": { "name": "...", "dates": [...], "venue": "...", "youtube_url": "..." },
    "races": [
      {
        "race_no": 1,
        "event_code": "M1x",
        "event_name": "男子シングルスカル",
        "category": "一般",
        "age_group": "A",
        "round": "予選",
        "date": "2025-06-07",
        "time": "09:00",
        "entries": [
          { "lane": 1, "crew_name": "チーム名", "affiliation": "所属" }
        ]
      }
    ]
  }
"""

import argparse
import csv
import io
import json
import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional

# tools/ 内から同ディレクトリの common を import
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import C, log_info, log_ok, log_warn, log_error, log_debug, read_csv_text, CsvEncodingError

# ---------------------------------------------------------------------------
# CSVユーティリティ
# ---------------------------------------------------------------------------

# read_csv_as_dicts が各行に付与する「元CSVでの行番号」のキー。
# CSVヘッダー由来のキーは lower() 済みの列名なので、この名前とは衝突しない。
SOURCE_LINE_KEY = "__source_line__"

def read_csv_as_dicts(filepath: Path) -> List[Dict[str, str]]:
    """
    CSVファイルを読み込み、各行を {正規化カラム名: 値} の辞書リストで返す。
    正規化: strip() + lower()。BOM付きUTF-8・Excel保存のcp932に対応。
    # で始まる行はコメントとして読み飛ばす。
    """
    rows = []
    text = read_csv_text(filepath)
    # # で始まる行はコメントとしてスキップするため、先にフィルタリング。
    # このとき元CSVの行番号を保持する（コメント行を除いた連番でエラー表示すると、
    # 操作者が実ファイルを開いたときに全く別の行を指してしまうため）
    # ※ 空行も除外する。csv.DictReader は空行を「読み飛ばして何も返さない」ため、
    #   空行を残すと kept_linenos と DictReader の行がズレて、
    #   空行以降のエラー表示が全部1行ずつ狂う（＝直そうとしたバグの再発）
    kept_lines   = []   # コメント行・空行を除いた行のテキスト
    kept_linenos = []   # 上と同じ並びの、元CSVでの行番号（1始まり）
    for lineno, line in enumerate(io.StringIO(text, newline=""), start=1):
        if line.lstrip().startswith("#"):
            continue
        if not line.strip():
            continue
        kept_lines.append(line)
        kept_linenos.append(lineno)

    reader = csv.DictReader(io.StringIO("".join(kept_lines), newline=""))
    if reader.fieldnames is None:
        log_warn(f"ヘッダーが読み取れません: {filepath}")
        return rows
    # ヘッダーを正規化したキーに変換するマッピング
    normalized = {h: h.strip().lower() for h in reader.fieldnames}
    # kept_linenos[0] はヘッダー行。データ行 i（0始まり）→ kept_linenos[i + 1]
    for idx, row in enumerate(reader):
        source_lineno = (
            kept_linenos[idx + 1] if idx + 1 < len(kept_linenos) else None
        )
        if not any((v or "").strip() for v in row.values()):
            continue  # 空行スキップ
        # # で始まる行はコメントとしてスキップ
        first_val = next(iter(row.values()), "")
        if (first_val or "").strip().startswith("#"):
            continue
        parsed = {normalized[k]: (v or "").strip() for k, v in row.items() if k in normalized}
        parsed[SOURCE_LINE_KEY] = source_lineno
        rows.append(parsed)
    return rows

def require_col(row: dict, col: str, filepath: Path, lineno: int) -> Optional[str]:
    """
    辞書から必須カラム値を取得。存在しない場合は警告を出し None を返す。
    """
    val = row.get(col)
    if val is None:
        log_warn(f"カラム '{col}' が見つかりません ({filepath.name} 行{lineno})")
    return val

# ---------------------------------------------------------------------------
# スケジュール CSV パース
# 期待カラム: race_no, event_code, event_name, category, age_group, round, date, time
# ---------------------------------------------------------------------------

def parse_schedule(filepath: Path) -> List[dict]:
    """
    schedule.csv を読み込み、レース情報のリストを返す。
    キー: race_no(int), event_code, event_name, category, age_group, round, date, time
    """
    raw = read_csv_as_dicts(filepath)
    races = []
    seen_race_no: Dict[int, int] = {}   # {race_no: 最初に出現した元CSVの行番号}
    duplicates: List[str] = []
    for row in raw:
        # 元CSVでの実際の行番号（コメント行を含めて数えた番号）
        i = row.get(SOURCE_LINE_KEY) or "?"
        race_no_str = row.get("race_no", "").strip()
        if not race_no_str:
            log_debug(f"  行{i}: race_no が空 → スキップ")
            continue
        try:
            race_no = int(race_no_str)
        except ValueError:
            log_warn(f"  行{i}: race_no が整数ではありません: {race_no_str!r}")
            continue

        # race_no の重複検証
        # 重複を放置すると、あとから読んだ行が先の行を上書きし、
        # 誤ったレースを静かに出力してしまうため、ここで止める
        if race_no in seen_race_no:
            duplicates.append(
                f"  レース番号 {race_no}: 行{seen_race_no[race_no]} と 行{i} で重複"
            )
            continue
        seen_race_no[race_no] = i

        races.append({
            "race_no":    race_no,
            "event_code": row.get("event_code", ""),
            "event_name": row.get("event_name", ""),
            "category":   row.get("category",   ""),
            "age_group":  row.get("age_group",  ""),
            "round":      row.get("round",       ""),
            "date":       row.get("date",        ""),
            "time":       row.get("time",        ""),
            "entries":    [],  # 後でエントリーを追加
        })

    if duplicates:
        log_error(f"{filepath.name}: レース番号（race_no）が重複しています")
        for d in duplicates:
            log_error(d)
        log_error("  同じレース番号は1行だけにしてください（重複行を削除または番号を修正）")
        sys.exit(1)

    log_info(f"スケジュール: {len(races)} レース読み込み ({filepath.name})")
    return races

# ---------------------------------------------------------------------------
# エントリー CSV パース
# 期待カラム: race_no, lane, crew_name, affiliation
# ---------------------------------------------------------------------------

def parse_entries(filepath: Path) -> Dict[int, List[dict]]:
    """
    entries.csv を読み込み、{race_no: [エントリー, ...]} の辞書を返す。
    各エントリー: {lane: int, crew_name: str, affiliation: str, age_group: str}
    age_group 列が無い CSV でも空文字で後方互換を保つ。
    """
    raw = read_csv_as_dicts(filepath)
    entries: Dict[int, List[dict]] = {}

    for row in raw:
        # 元CSVでの実際の行番号（コメント行を含めて数えた番号）
        i = row.get(SOURCE_LINE_KEY) or "?"
        race_no_str = row.get("race_no", "").strip()
        lane_str    = row.get("lane",    "").strip()

        if not race_no_str or not lane_str:
            log_debug(f"  行{i}: race_no または lane が空 → スキップ")
            continue

        try:
            race_no = int(race_no_str)
            lane    = int(lane_str)
        except ValueError:
            log_warn(f"  行{i}: race_no/lane が整数ではありません: {race_no_str!r}, {lane_str!r}")
            continue

        entries.setdefault(race_no, []).append({
            "lane":        lane,
            "crew_name":   row.get("crew_name",   ""),
            "affiliation": row.get("affiliation", ""),
            "age_group":   row.get("age_group",   ""),
        })

    total = sum(len(v) for v in entries.values())
    log_info(f"エントリー: {total} 件 / {len(entries)} レース ({filepath.name})")
    return entries

# ---------------------------------------------------------------------------
# master.json 構築
# ---------------------------------------------------------------------------

def _slugify(name: str) -> str:
    """大会名を英数ハイフンの slug に変換（tournament.id のデフォルト生成用）。
    ASCII 英数字のみ残し、空白/アンダースコアをハイフンに変換。
    日本語など非 ASCII 文字は除去。結果が空の場合は "tournament" を返す。
    """
    slug = name.lower()
    # 非 ASCII 文字を除去
    slug = slug.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug).strip("-")
    return slug or "tournament"


def build_master_json(
    tournament_name: str,
    dates: List[str],
    venue: str,
    youtube_url: str,
    races: List[dict],
    entries: Dict[int, List[dict]],
    measurement_points: Optional[List[str]] = None,
    # v3 追加フィールド
    tournament_id: str = "",
    hub_url: str = "",
    course_length_m: int = 1000,
    categories: Optional[List[str]] = None,
) -> dict:
    """
    スケジュール・エントリー情報を統合して master.json 用辞書を構築する。

    v3 フィールド（schema_version, tournament.id/hub_url, default_course, categories）を出力。
    フロント互換チェーンのため v2 キー measurement_points（文字列配列）も並行出力する。
    measurement_points が None の場合はデフォルト ["500m", "1000m"] を使用する。
    """
    if measurement_points is None:
        measurement_points = ["500m", "1000m"]

    # tournament.id: 引数 > 大会名 slug 化
    tid = tournament_id.strip() if tournament_id else _slugify(tournament_name)

    # categories: 引数 > entries から自動抽出 > デフォルト
    if categories:
        cats = categories
    else:
        seen: List[str] = []
        for race in races:
            cat = race.get("category", "").strip()
            if cat and cat not in seen:
                seen.append(cat)
        cats = seen if seen else ["M", "W", "X"]

    # default_course.measurement_points は整数リスト（SPEC §1）
    mp_int = []
    for p in measurement_points:
        try:
            mp_int.append(int(str(p).replace("m", "")))
        except ValueError:
            pass
    if not mp_int:
        mp_int = [500, 1000]

    # エントリーをスケジュールにマージ
    for race in races:
        race_no = race["race_no"]
        race_entries = entries.get(race_no, [])
        # レーン番号順にソート
        race["entries"] = sorted(race_entries, key=lambda e: e["lane"])

    # race_no 順にソート
    sorted_races = sorted(races, key=lambda r: r["race_no"])

    return {
        "schema_version": 3,
        "tournament": {
            "id":          tid,
            "name":        tournament_name,
            "dates":       dates,
            "venue":       venue,
            "youtube_url": youtube_url,
            "hub_url":     hub_url,
        },
        "default_course": {
            "length_m":           course_length_m,
            "measurement_points": mp_int,
        },
        "categories": cats,
        # v2 互換キー（文字列配列）— フロント互換チェーンのフォールバック用
        "measurement_points": measurement_points,
        "schedule": sorted_races,
    }

# ---------------------------------------------------------------------------
# メイン処理
# ---------------------------------------------------------------------------

def _load_config(config_path: Path) -> dict:
    """tournament.config.json を読み込んで返す。存在しない場合は空辞書を返す。"""
    if not config_path.is_file():
        return {}
    try:
        return json.loads(config_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        log_warn(f"config ファイルの読み込みに失敗しました ({config_path}): {e}")
        return {}


def run(args: argparse.Namespace) -> int:
    print(f"\n{C.BOLD}{C.CYAN}{'='*60}{C.RESET}")
    print(f"{C.BOLD}{C.CYAN}  generate_master — CSV → master.json{C.RESET}")
    print(f"{'='*60}{C.RESET}\n")

    schedule_path = Path(args.schedule).resolve()
    entries_path  = Path(args.entries).resolve()
    output_path   = Path(args.output).resolve()

    # ---- config ファイル読み込み（優先度: --config > 個別 CLI 引数 > デフォルト）--------
    cfg: dict = {}
    if args.config:
        cfg_path = Path(args.config).resolve()
        cfg = _load_config(cfg_path)
        if cfg:
            log_info(f"config ファイル     : {cfg_path}")
        else:
            log_warn(f"config ファイルが読めませんでした: {cfg_path}")

    t_cfg   = cfg.get("tournament", {})
    dc_cfg  = cfg.get("default_course", {})

    # 各値: config > CLI 引数 > デフォルト
    tournament_name = (
        t_cfg.get("name") or args.tournament or ""
    )
    dates_str = args.dates or ",".join(t_cfg.get("dates", []))
    venue     = t_cfg.get("venue") or args.venue or ""
    youtube   = args.youtube  # config にはなし（CLI 引数のみ）
    tournament_id = t_cfg.get("id") or args.tournament_id or ""
    hub_url = t_cfg.get("hub_url") or args.hub_url or ""

    # course_length_m: config > デフォルト 1000
    course_length_m = dc_cfg.get("length_m", 1000)
    try:
        course_length_m = int(course_length_m)
    except (TypeError, ValueError):
        course_length_m = 1000

    # measurement_points: config（整数配列）> CLI --points（文字列カンマ区切り）> デフォルト
    if dc_cfg.get("measurement_points"):
        points_list: Optional[List[str]] = [
            f"{int(p)}m" for p in dc_cfg["measurement_points"]
        ]
    else:
        points_list = [p.strip() for p in args.points.split(",") if p.strip()] or None

    # categories: config > None（entries から自動抽出）
    categories: Optional[List[str]] = cfg.get("categories") or None

    # ---- 入力ファイル確認 --------------------------------------------------
    for p in [schedule_path, entries_path]:
        if not p.is_file():
            log_error(f"ファイルが存在しません: {p}")
            return 1

    log_info(f"スケジュール CSV : {schedule_path}")
    log_info(f"エントリー CSV   : {entries_path}")
    log_info(f"出力先           : {output_path}")
    log_info(f"大会名           : {tournament_name}")
    log_info(f"開催日           : {dates_str}")
    log_info(f"会場             : {venue}")
    log_info(f"計測ポイント     : {points_list}")
    print()

    # ---- 上書き確認 --------------------------------------------------------
    if output_path.exists() and not args.yes:
        answer = input(f"{C.YELLOW}[WARN]{C.RESET}  {output_path} は既に存在します。上書きしますか？ [y/N]: ")
        if answer.strip().lower() not in ("y", "yes"):
            log_warn("キャンセルしました")
            return 0

    # ---- パース ------------------------------------------------------------
    races   = parse_schedule(schedule_path)
    entries = parse_entries(entries_path)

    if not races:
        log_warn("スケジュールデータが空です")
        return 0

    # エントリーが紐付かないレースの確認
    no_entry_races = [r["race_no"] for r in races if r["race_no"] not in entries]
    if no_entry_races:
        log_warn(f"エントリーなしのレース: {no_entry_races}")

    # ---- master.json 構築 --------------------------------------------------
    dates_list_parsed = [d.strip() for d in dates_str.split(",") if d.strip()]
    master = build_master_json(
        tournament_name     = tournament_name,
        dates               = dates_list_parsed,
        venue               = venue,
        youtube_url         = youtube,
        races               = races,
        entries             = entries,
        measurement_points  = points_list,
        tournament_id       = tournament_id,
        hub_url             = hub_url,
        course_length_m     = course_length_m,
        categories          = categories,
    )

    # ---- 出力 --------------------------------------------------------------
    output_path.parent.mkdir(parents=True, exist_ok=True)
    json_str = json.dumps(master, ensure_ascii=False, indent=2) + "\n"
    output_path.write_text(json_str, encoding="utf-8")

    total_entries = sum(len(r["entries"]) for r in master["schedule"])
    print()
    log_ok(f"master.json を出力しました: {output_path}")
    log_info(f"  schema_version : {master['schema_version']}")
    log_info(f"  tournament.id  : {master['tournament']['id']}")
    log_info(f"  レース数       : {len(master['schedule'])}")
    log_info(f"  エントリー数   : {total_entries}")
    log_info(f"  categories     : {master['categories']}")
    print()
    return 0

# ---------------------------------------------------------------------------
# エントリポイント
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="schedule.csv + entries.csv → site/data/master.json 変換ツール (v3)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--schedule",
        required=True,
        metavar="CSV",
        help="スケジュールCSVファイルのパス",
    )
    parser.add_argument(
        "--entries",
        required=True,
        metavar="CSV",
        help="エントリーCSVファイルのパス",
    )
    parser.add_argument(
        "--output",
        default="site/data/master.json",
        metavar="JSON",
        help="出力先JSONファイルのパス（デフォルト: site/data/master.json）",
    )
    parser.add_argument(
        "--config",
        default=None,
        metavar="JSON",
        help="tournament.config.json のパス。指定時は大会情報をここから取得（CLI 引数より優先）",
    )
    parser.add_argument(
        "--tournament",
        default="",
        metavar="NAME",
        help="大会名（--config 未指定時に使用）",
    )
    parser.add_argument(
        "--tournament-id",
        default="",
        dest="tournament_id",
        metavar="ID",
        help="大会ID（英数ハイフン。省略時は大会名から自動生成）",
    )
    parser.add_argument(
        "--hub-url",
        default="",
        dest="hub_url",
        metavar="URL",
        help="ハブサイトURL（省略可）",
    )
    parser.add_argument(
        "--dates",
        default="",
        metavar="DATES",
        help="開催日（カンマ区切り。例: 2025-06-07,2025-06-08）",
    )
    parser.add_argument(
        "--venue",
        default="",
        metavar="VENUE",
        help="開催会場",
    )
    parser.add_argument(
        "--points",
        default="500m,1000m",
        metavar="POINTS",
        help="計測ポイント（カンマ区切り。例: 500m,1000m）",
    )
    parser.add_argument(
        "--youtube",
        default="",
        metavar="URL",
        help="YouTube Live URL（なければ空文字）",
    )
    parser.add_argument(
        "-y", "--yes",
        action="store_true",
        help="出力ファイルが既存でも確認なしに上書きする",
    )
    return parser.parse_args()


if __name__ == "__main__":
    # 文字コード判別失敗は CLI 層で終了コード1に変換する
    # （共通ヘルパー内で sys.exit すると watch.py の常駐ループを巻き込んで殺すため）
    try:
        sys.exit(run(parse_args()))
    except CsvEncodingError as e:
        log_error(str(e))
        sys.exit(1)
