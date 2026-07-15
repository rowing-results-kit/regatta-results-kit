#!/usr/bin/env python3
"""
CSV watchモード — 開発・当日リハーサル用ファイル監視ツール

test/csv/ フォルダを3秒ごとにポーリングし、新しいCSVが追加されるたびに
simulate_pipeline の処理ロジックを直接呼び出してJSONを生成する。

使い方:
  python3 tools/watch.py                          # test/csv/ を監視
  python3 tools/watch.py --csv-dir /path/to/dir  # 任意のフォルダを監視
  python3 tools/watch.py --push                   # 変換後にGitHubにもPush
  python3 tools/watch.py --serve                  # HTTPサーバーも同時起動（ポート8181）
"""

import argparse
import http.server
import json
import os
import sys
import threading
import time
from pathlib import Path
from datetime import datetime, timezone

# simulate_pipeline をインポートできるよう、tools/ ディレクトリをパスに追加
TOOLS_DIR = Path(__file__).resolve().parent
PROJECT_DIR = TOOLS_DIR.parent
sys.path.insert(0, str(TOOLS_DIR))

import simulate_pipeline as pipeline
from common import C

# ---------------------------------------------------------------------------
# 定数
# ---------------------------------------------------------------------------

# 処理済みファイルリストの永続化ファイル
STATE_FILE = PROJECT_DIR / ".watch_state.json"

# ポーリング間隔（秒）
POLL_INTERVAL = 3

# HTTPサーバーのポート番号
HTTP_PORT = 8181

# デフォルトCSVディレクトリ（プロジェクトルートからの相対）
DEFAULT_CSV_DIR = PROJECT_DIR / "test" / "csv"

# JSON出力先ディレクトリ
# ※ 公開サイトが参照するのは site/data/results/。
#   site・check_status・simulate_pipeline とパスを統一すること（不一致だと
#   成功ログが出るのに速報サイトへ反映されない）
OUTPUT_DIR = PROJECT_DIR / "site" / "data" / "results"

# デフォルト計測ポイント（カンマ区切り文字列）
DEFAULT_POINTS = "500m,1000m"


def load_state() -> tuple:
    """
    前回の状態を .watch_state.json から読み込む。
    ファイルが存在しない・壊れている場合は空を返す。

    Returns:
        (処理済みファイル名の set, {失敗ファイル名: [mtime, size]} の dict)
    """
    if not STATE_FILE.exists():
        return set(), {}
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            data = json.load(f)
        processed = set(data.get("processed_files", []))
        failed    = dict(data.get("failed_files", {}))
        return processed, failed
    except (json.JSONDecodeError, OSError, TypeError, ValueError):
        return set(), {}


def save_state(processed: set, failed: dict = None) -> None:
    """
    処理済み／失敗ファイルの状態を .watch_state.json に保存する。

    失敗ファイルも永続化する理由: 失敗をRAMだけに持つと、常駐を再起動した際に
    「起動時点の既存ファイルは処理済みとみなす」処理へ吸収され、
    未公開のレースが二度と処理されなくなる（＝黙って消える）。
    """
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "processed_files": sorted(processed),
                    "failed_files": failed or {},
                },
                f, ensure_ascii=False, indent=2,
            )
    except OSError as e:
        log_error(f"状態ファイルの保存に失敗しました: {e}")


def _timestamp() -> str:
    """現在時刻を HH:MM:SS 形式で返す。"""
    return datetime.now().strftime("%H:%M:%S")


def log_watch(msg: str) -> None:
    """[Watch] プレフィックス付きのシアンログ。"""
    print(f"{C.CYAN}[Watch]{C.RESET} {_timestamp()} {msg}")


def log_detect(filename: str) -> None:
    """新ファイル検出ログ（黄色強調）。"""
    print(f"{C.YELLOW}[Watch]{C.RESET} {_timestamp()} 新ファイル検出: {C.BOLD}{filename}{C.RESET}")


def log_ok(msg: str) -> None:
    """成功ログ（緑）。"""
    print(f"{C.GREEN}[Watch]{C.RESET} {_timestamp()} {msg}")


def log_error(msg: str) -> None:
    """エラーログ（赤）。"""
    print(f"{C.RED}[Watch]{C.RESET} {_timestamp()} {msg}", file=sys.stderr)


def log_server(msg: str) -> None:
    """HTTPサーバーログ（青）。"""
    print(f"{C.BLUE}[Serve]{C.RESET} {_timestamp()} {msg}")


# ---------------------------------------------------------------------------
# HTTPサーバー（バックグラウンドスレッドで起動）
# ---------------------------------------------------------------------------

class _SilentHandler(http.server.SimpleHTTPRequestHandler):
    """アクセスログを抑制した SimpleHTTPRequestHandler。"""

    def log_message(self, format, *args):
        # 標準のアクセスログを無効化（ウォッチログを邪魔しないため）
        pass


def start_http_server(directory: Path, port: int) -> threading.Thread:
    """
    指定ディレクトリをルートとしてHTTPサーバーをバックグラウンドで起動する。
    起動したスレッドを返す。
    """
    handler = lambda *args, **kwargs: _SilentHandler(
        *args, directory=str(directory), **kwargs
    )
    server = http.server.HTTPServer(("", port), handler)

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    log_server(f"HTTPサーバー起動: http://localhost:{port}")
    log_server(f"  ルートディレクトリ: {directory}")
    return thread


# ---------------------------------------------------------------------------
# CSVポーリング処理
# ---------------------------------------------------------------------------

def scan_csv_files(csv_dir: Path) -> set:
    """
    指定ディレクトリ内の .csv ファイル名のセットを返す。
    ディレクトリが存在しない場合は空セットを返す。
    """
    if not csv_dir.is_dir():
        return set()
    return {f for f in os.listdir(str(csv_dir)) if f.lower().endswith(".csv")}


def process_new_file(
    filename: str,
    csv_dir: Path,
    measurement_points: list,
    do_push: bool,
    push_token: str,
    push_repo: str,
    push_branch: str,
    output_dir: Path = OUTPUT_DIR,
) -> bool:
    """
    新規CSVファイルを検出した際の処理。

    ファイル名を parse_csv_filename でパースし、同一レースの全計測ポイントが
    そろっているか確認してから race_XXX.json を生成する。

    Returns:
        True  … このファイルは「処理済み」にしてよい
                （生成成功／命名規則外／他の計測ポイント待ち = 後続CSVが来れば処理される）
        False … 失敗。処理済みにせず、CSVが更新されたら再試行させる
                （レコード空・Push失敗など。ここで True を返すと、操作者が
                 同名で修正版を置き直しても二度と処理されずレースが未公開になる）
    """
    # ファイル名をパース
    parsed = pipeline.parse_csv_filename(filename)
    if not parsed:
        log_watch(f"命名規則不一致のためスキップ: {filename}")
        return True   # 対象外ファイル → 再試行不要

    race_no, point = parsed
    log_detect(filename)
    log_watch(f"  → Race {race_no:03d} / 計測ポイント: {point}")

    # 同一レースの全計測ポイントが揃っているか確認
    race_files = pipeline.collect_csv_files(csv_dir, {race_no})
    if race_no not in race_files:
        log_watch(f"  レース {race_no:03d}: 対応CSVなし（スキップ）")
        return True   # 対象CSVなし → 再試行不要

    found_points = set(race_files[race_no].keys())
    required_points = set(measurement_points)
    missing = required_points - found_points

    if missing:
        log_watch(
            f"  レース {race_no:03d}: 計測ポイント未揃い "
            f"（揃い済み: {sorted(found_points)} / 不足: {sorted(missing)}）"
        )
        log_watch(f"  次のCSVが届くまで待機します...")
        return True   # 他の計測ポイント待ち → その CSV 到着時に処理される

    log_watch(f"  レース {race_no:03d}: 全計測ポイント揃い → JSON生成開始")

    # 各ポイントのCSVをパース
    point_records = {}
    for pt in measurement_points:
        filepath = race_files[race_no][pt]
        records = pipeline.parse_csv(filepath)
        if not records:
            log_error(f"  {pt}: レコードが空です → スキップ")
            log_error(f"  → {filename} は未処理のままです。CSVを修正して保存し直すと再試行します")
            return False  # 失敗 → 処理済みにしない
        point_records[pt] = records
        log_watch(f"  {pt}: {len(records)} レコード読み込み")

    # race_XXX.json を構築
    race_json = pipeline.build_race_json(race_no, point_records, measurement_points)
    json_str  = json.dumps(race_json, ensure_ascii=False, indent=2) + "\n"
    filename_out = f"race_{race_no:03d}.json"

    # ファイル出力
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / filename_out
    out_path.write_text(json_str, encoding="utf-8")
    log_ok(f"  JSON書き出し完了: {out_path}")

    # 結果サマリーを表示
    for r in race_json["results"]:
        finish_fmt = (r.get("finish") or {}).get("formatted", "---")
        tie_str    = f" [同着:{r['tie_group']}]" if r.get("tie_group") else ""
        rank_str   = f"{r['rank']:2d}位" if r.get("rank") is not None else "DNF"
        print(
            f"    {C.GRAY}  {rank_str}  レーン{r['lane']}  "
            f"{finish_fmt}  {r.get('split', '')}{tie_str}{C.RESET}"
        )

    # GitHubへのPush（--push指定時）
    if do_push:
        if not push_token:
            log_error("GITHUB_TOKEN / --token が未設定のためPushをスキップ")
            return False  # Push未達 → 処理済みにしない
        if not push_repo:
            log_error("GITHUB_REPO / --repo が未設定のためPushをスキップ")
            return False  # Push未達 → 処理済みにしない

        # Push先はローカル出力先と必ず一致させる。
        # ※ --output でリハーサル用ディレクトリを指定したのに Push だけ
        #   site/data/results/ 固定だと、テストデータを本番サイトへ公開してしまう
        try:
            rel = output_dir.resolve().relative_to(PROJECT_DIR.resolve())
        except ValueError:
            log_error(
                f"  --output がリポジトリ外（{output_dir}）のため Push をスキップします"
            )
            log_error("  Push する場合は --output をリポジトリ内のパスにしてください")
            return False  # Push未達 → 処理済みにしない
        remote_path = f"{rel.as_posix()}/{filename_out}"
        try:
            pipeline.github_push_file(
                token         = push_token,
                repo          = push_repo,
                branch        = push_branch,
                path          = remote_path,
                content_bytes = json_str.encode("utf-8"),
                message       = f"chore: update {filename_out} [watch]",
            )
            log_ok(f"  GitHub Push 完了: {remote_path}")
        except Exception as e:
            log_error(f"  GitHub Push 失敗: {e}")
            return False  # Push未達 → 処理済みにせず再試行させる

    return True   # 生成（＋Push）成功 → 処理済みにしてよい


# ---------------------------------------------------------------------------
# メインループ
# ---------------------------------------------------------------------------

def run(args: argparse.Namespace) -> None:
    """
    監視ループのメイン処理。Ctrl+C で終了する。
    """
    csv_dir = Path(args.csv_dir).resolve()
    output_dir = Path(args.output).resolve()
    measurement_points = [p.strip() for p in args.points.split(",") if p.strip()]

    # GitHubトークン・リポジトリ（Push時）
    push_token  = args.token  or os.environ.get("GITHUB_TOKEN", "")
    push_repo   = args.repo   or os.environ.get("GITHUB_REPO",  "")
    push_branch = args.branch

    # 起動メッセージ
    print(f"\n{C.BOLD}{C.CYAN}{'='*50}{C.RESET}")
    print(f"{C.BOLD}{C.CYAN}  CSV Watch モード{C.RESET}")
    print(f"{C.CYAN}{'='*50}{C.RESET}\n")
    log_watch(f"監視ディレクトリ : {csv_dir}")
    log_watch(f"計測ポイント     : {', '.join(measurement_points)}")
    log_watch(f"ポーリング間隔   : {POLL_INTERVAL}秒")
    log_watch(f"JSON出力先       : {output_dir}")
    if args.push:
        log_watch(f"GitHub Push      : 有効 (repo={push_repo or '未設定'})")
    if args.serve:
        log_watch(f"HTTPサーバー     : 有効 (ポート={HTTP_PORT})")
    print()

    # CSVディレクトリが存在しない場合は警告
    if not csv_dir.is_dir():
        log_error(f"監視ディレクトリが存在しません: {csv_dir}")
        log_error("ディレクトリが作成されるまで待機します...")

    # --serve: HTTPサーバーをバックグラウンドで起動
    if args.serve:
        start_http_server(PROJECT_DIR, HTTP_PORT)
        log_server(f"ブラウザで確認: http://localhost:{HTTP_PORT}")
        print()

    # 前回の処理済み／失敗ファイルを読み込む
    persisted_files, persisted_failed = load_state()
    if persisted_files:
        log_watch(f"前回の処理済みファイルを復元: {len(persisted_files)} ファイル")

    # 処理に失敗したファイル {ファイル名: [mtime, size]}
    # 中身が更新されたら自動で再試行するため、処理済み扱いにはしない
    failed_files: dict = {k: list(v) for k, v in persisted_failed.items()}
    if failed_files:
        log_watch(
            f"前回失敗したファイルを復元: {len(failed_files)} ファイル "
            f"（{', '.join(sorted(failed_files))} — CSVを保存し直すと再試行します）"
        )

    # 初期ファイルリスト（起動時点の既存ファイルは処理済みとみなす）
    # ※ 前回失敗したファイルは「処理済み」に吸収しない。吸収すると未公開のまま二度と処理されない
    current_at_start = scan_csv_files(csv_dir) - set(failed_files)
    known_files: set = persisted_files | current_at_start
    if current_at_start - persisted_files:
        log_watch(
            f"起動時点で {len(current_at_start - persisted_files)} ファイルを新たに確認"
            "（処理済みとして登録）"
        )
    log_watch("新しいCSVファイルの追加を待機中... (Ctrl+C で終了)\n")

    # ポーリングループ
    try:
        while True:
            time.sleep(POLL_INTERVAL)

            current_files = scan_csv_files(csv_dir)
            new_files = current_files - known_files

            for filename in sorted(new_files):
                # 失敗したファイルは「処理済み」にしない。
                # ※ 先に save_state すると、文字コード不正等で失敗したレースが
                #   永久に再処理されず、修正版を同名で置き直しても無視される
                #   （＝そのレースが最後まで公開されない）
                fpath = csv_dir / filename
                try:
                    st = fpath.stat()
                    # 更新の指紋は (mtime, size)。mtime だけだと、同一tick内の
                    # 書き換えで「更新なし」と誤判定して再試行を取りこぼしうる
                    # JSON に保存すると list になるため、比較も list に揃える
                    fingerprint = [st.st_mtime, st.st_size]
                except OSError:
                    continue  # 消えた/読めない → 次のポーリングで再確認

                # 前回失敗したファイルは、中身が更新されるまで再試行しない（ログ氾濫防止）
                if failed_files.get(filename) == fingerprint:
                    continue

                try:
                    ok = process_new_file(
                        filename          = filename,
                        csv_dir           = csv_dir,
                        measurement_points = measurement_points,
                        do_push           = args.push,
                        push_token        = push_token,
                        push_repo         = push_repo,
                        push_branch       = push_branch,
                        output_dir        = output_dir,
                    )
                except Exception as e:
                    # 常駐は止めない。処理済みにもしないので、CSVを保存し直せば自動で再試行される
                    ok = False
                    log_error(f"処理中に例外が発生しました ({filename}): {e}")
                    log_error(
                        f"  → {filename} は未処理のままです。"
                        "CSVを修正して保存し直すと自動で再試行します"
                    )

                if not ok:
                    # 失敗は永続化する。RAMだけに持つと、再起動時に
                    # 「起動時点の既存ファイル=処理済み」に吸収されて永久に未公開になる
                    failed_files[filename] = list(fingerprint)
                    save_state(known_files, failed_files)
                    continue

                # 成功したファイルだけを処理済みとして永続化する
                known_files.add(filename)
                failed_files.pop(filename, None)
                save_state(known_files, failed_files)

    except KeyboardInterrupt:
        print(f"\n{C.CYAN}[Watch]{C.RESET} Ctrl+C を受信 → 監視を終了します")
        print(f"{C.CYAN}[Watch]{C.RESET} 処理済みファイル数: {len(known_files)}")
        save_state(known_files, failed_files)
        print(f"{C.CYAN}[Watch]{C.RESET} 状態を {STATE_FILE} に保存しました")
        print()


# ---------------------------------------------------------------------------
# エントリポイント
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="CSV watchモード — CSVフォルダを監視して自動でJSONを生成する",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--csv-dir",
        default=str(DEFAULT_CSV_DIR),
        metavar="DIR",
        help=f"監視するCSVディレクトリ（デフォルト: {DEFAULT_CSV_DIR}）",
    )
    parser.add_argument(
        "--points",
        default=DEFAULT_POINTS,
        metavar="POINTS",
        help=f"計測ポイント（カンマ区切り。デフォルト: {DEFAULT_POINTS}）",
    )
    parser.add_argument(
        "--output",
        default=str(OUTPUT_DIR),
        metavar="DIR",
        help=(
            f"JSON出力先ディレクトリ（デフォルト: {OUTPUT_DIR}）。"
            "テストCSVでリハーサルする際は、公開用JSONを上書きしないよう "
            "別ディレクトリを指定すること"
        ),
    )
    parser.add_argument(
        "--push",
        action="store_true",
        help="JSON生成後に GitHub へも Push する（GITHUB_TOKEN 必須）",
    )
    parser.add_argument(
        "--serve",
        action="store_true",
        help=f"HTTPサーバーをバックグラウンドで起動する（ポート: {HTTP_PORT}）",
    )
    parser.add_argument(
        "--token",
        default=None,
        metavar="TOKEN",
        help="GitHub Personal Access Token（省略時は環境変数 GITHUB_TOKEN を使用）",
    )
    parser.add_argument(
        "--repo",
        default=None,
        metavar="OWNER/REPO",
        help="GitHub リポジトリ（例: your-org/your-repo）",
    )
    parser.add_argument(
        "--branch",
        default="main",
        metavar="BRANCH",
        help="Push先ブランチ（デフォルト: main）",
    )
    return parser.parse_args()


if __name__ == "__main__":
    run(parse_args())
