#!/usr/bin/env python3
"""
tools/common.py — ツール共通ユーティリティ

このモジュールは tools/ 内の各スクリプトで重複していた定義を一本化する。
tools/ 内スクリプトから: from common import C, log_ok, ...
test/ 等から: sys.path.insert(0, str(TOOLS_DIR)) の後に import common
"""

import codecs
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# ANSIカラー定義（colorama不要）
# ---------------------------------------------------------------------------

class C:
    RESET  = "\033[0m"
    BOLD   = "\033[1m"
    GREEN  = "\033[32m"
    YELLOW = "\033[33m"
    CYAN   = "\033[36m"
    RED    = "\033[31m"
    GRAY   = "\033[90m"
    BLUE   = "\033[34m"


# ---------------------------------------------------------------------------
# 標準ログ関数
# ---------------------------------------------------------------------------

def log_info(msg: str) -> None:
    print(f"{C.CYAN}[INFO]{C.RESET}  {msg}")

def log_ok(msg: str) -> None:
    print(f"{C.GREEN}[OK]{C.RESET}    {msg}")

def log_warn(msg: str) -> None:
    print(f"{C.YELLOW}[WARN]{C.RESET}  {msg}")

def log_error(msg: str) -> None:
    print(f"{C.RED}[ERROR]{C.RESET} {msg}", file=sys.stderr)

def log_debug(msg: str) -> None:
    print(f"{C.GRAY}[DEBUG]{C.RESET} {msg}")

def log_section(msg: str) -> None:
    print(f"\n{C.BOLD}{C.CYAN}{'='*60}{C.RESET}")
    if msg:
        print(f"{C.BOLD}{C.CYAN}  {msg}{C.RESET}")

def log_title(msg: str) -> None:
    print(f"{C.BOLD}{C.CYAN}  {msg}{C.RESET}\n{'='*60}{C.RESET}\n")


# ---------------------------------------------------------------------------
# CSV 読み込み（文字コード自動判別）
# ---------------------------------------------------------------------------

# 文字コードが判別できなかったときに表示する案内文（非エンジニア向け）
CSV_ENCODING_HELP = (
    "CSVをUTF-8で保存し直してください"
    "（Excelは『CSV UTF-8（コンマ区切り）』を選択）"
)

# BOM なしのとき試行する文字コードの順序
# utf-8-sig: UTF-8（BOM付き含む・推奨）
# cp932    : 日本語版Excelの既定保存形式（Shift_JIS系）
_CSV_ENCODINGS = ("utf-8-sig", "cp932")


class CsvEncodingError(Exception):
    """
    CSVの文字コードを判別できなかったことを表す例外。

    ※ ここで sys.exit してはならない。watch.py は長時間動く常駐プロセスで、
       1ファイルの失敗は `except Exception` で捕まえて次のCSVに進む設計。
       SystemExit は BaseException のため its guard をすり抜けて常駐を殺す。
       CLI 側（__main__）でこの例外を捕まえて終了コード1に変換すること。
    """


def _reject_if_not_comma_separated(path, text: str, enc: str) -> None:
    """
    ヘッダー行がタブ区切りでコンマを含まない場合、CSVではないとみなして中断する。

    Excel の「Unicode テキスト (*.txt)」は UTF-16、「テキスト (タブ区切り) (*.txt)」は
    cp932 で、いずれも**タブ区切り**。復号自体は成功してしまうため、これを通すと
    「必須カラムが見つかりません → レコードなし → スキップ」と流れて
    終了コード0のまま、そのレースが黙って未公開になる（最も見つけにくい失敗）。
    → 文字コードに関係なく全経路で検査する。

    ヘッダー判定では # コメント行を読み飛ばす
    （generate_master はコメント行を許容する仕様。コメントにタブが入っていても誤検知しない）
    """
    header = next(
        (
            ln for ln in text.splitlines()
            if ln.strip() and not ln.lstrip().lstrip("﻿").startswith("#")
        ),
        "",
    )
    if "," not in header and "\t" in header:
        raise CsvEncodingError(
            f"{path.name}: タブ区切りのため読み込めません"
            f"（{enc} で復号・Excelの『テキスト(タブ区切り)』『Unicode テキスト』形式と思われます）\n"
            f"  {CSV_ENCODING_HELP}"
        )


def read_csv_text(filepath) -> str:
    """
    CSVファイルをテキストとして読み込む。

    判別順:
      1. BOM が UTF-16 / UTF-32 → その文字コードで復号（Excelの「Unicode テキスト」等）
      2. UTF-8（BOM付き可）
      3. cp932（日本語版Excelの既定保存形式）

    どれでも復号できない場合は CsvEncodingError を送出する（呼び出し側で終了コード1に変換）。
    ファイル自体が読めない場合は OSError がそのまま伝播する。
    """
    path = Path(filepath)
    raw = path.read_bytes()   # OSError は呼び出し側の except Exception で扱えるよう伝播させる

    # --- 1. BOM による明示判定 ---------------------------------------------
    # cp932 はほぼ任意のバイト列を復号してしまうため、BOM がある場合は
    # フォールバックに落ちる前にここで確定させる（UTF-16 を cp932 で読むと文字化けする）
    for bom, enc in (
        (codecs.BOM_UTF32_LE, "utf-32"),   # UTF-32 は UTF-16 の BOM と前方一致するため先に判定
        (codecs.BOM_UTF32_BE, "utf-32"),
        (codecs.BOM_UTF16_LE, "utf-16"),
        (codecs.BOM_UTF16_BE, "utf-16"),
    ):
        if raw.startswith(bom):
            try:
                text = raw.decode(enc)
            except UnicodeDecodeError as e:
                raise CsvEncodingError(f"{path.name}: {enc} として復号できません") from e
            _reject_if_not_comma_separated(path, text, enc)
            log_warn(f"{path.name}: {enc} として読み込みました")
            log_warn(f"  {CSV_ENCODING_HELP}")
            return text

    # --- 2. BOM なし: UTF-8 → cp932 の順で試す ------------------------------
    for enc in _CSV_ENCODINGS:
        try:
            text = raw.decode(enc)
        except UnicodeDecodeError:
            continue
        # NUL が含まれる = 実体は UTF-16 等。cp932 は NUL も「復号成功」にしてしまうため、
        # ここで弾かないと文字化けしたまま静かに処理が進む
        if "\x00" in text:
            continue
        # タブ区切り（＝CSVではない）を全経路で弾く。
        # Excelの「テキスト (タブ区切り)」は cp932 なので、BOM経路だけの検査では素通りする
        _reject_if_not_comma_separated(path, text, enc)
        if enc != "utf-8-sig":
            log_warn(
                f"{path.name}: UTF-8として読めなかったため {enc}（Excel既定のShift_JIS）"
                "として読み込みました"
            )
            log_warn(f"  文字化けが起きる場合は、{CSV_ENCODING_HELP}")
        return text

    raise CsvEncodingError(
        f"{path.name}: 文字コードを判別できませんでした（UTF-8 / cp932 いずれも不可）\n"
        f"  {CSV_ENCODING_HELP}"
    )


# ---------------------------------------------------------------------------
# タイム変換ユーティリティ
# ---------------------------------------------------------------------------

def ms_to_formatted(ms: int) -> str:
    """
    ミリ秒 → 'M:SS.ss' 形式。
    例: 108220 → '1:48.22'
    """
    total_cs = ms // 10          # センチ秒（0.01秒単位）
    centisec = total_cs % 100
    total_sec = total_cs // 100
    sec = total_sec % 60
    minutes = total_sec // 60
    return f"{minutes}:{sec:02d}.{centisec:02d}"


# ---------------------------------------------------------------------------
# master.json のレース検索
# ---------------------------------------------------------------------------

def find_race(master: dict, race_no: int) -> dict:
    """
    master.json の schedule から race_no に一致するレースを返す。
    見つからない場合は ValueError を送出する。
    呼び出し側で SystemExit に変換が必要な場合は except ValueError で処理すること。
    """
    for race in master.get("schedule", []):
        if int(race.get("race_no", -1)) == race_no:
            return race
    raise ValueError(f"race_no {race_no} not found in master.json")


# ---------------------------------------------------------------------------
# レース日時フォーマット
# ---------------------------------------------------------------------------

def format_race_datetime(date_value, time_value) -> str:
    """
    date_value, time_value を受け取り 'YYYY/MM/DD　HH:MM' 形式で返す。
    date_value は 'YYYY-MM-DD' または 'YYYY/MM/DD' 形式を許容する。
    time_value は 'HH:MM' 形式を許容する。
    パースに失敗した場合は元の文字列をそのまま使う。
    """
    date_text = str(date_value or "").strip()
    time_text = str(time_value or "").strip()
    try:
        sep = "-" if "-" in date_text else "/"
        parts = [int(p) for p in date_text.split(sep)]
        if len(parts) == 3:
            date_text = f"{parts[0]:04d}/{parts[1]:02d}/{parts[2]:02d}"
    except ValueError:
        pass
    try:
        parts = [int(part) for part in time_text.split(":")]
        if len(parts) >= 2:
            time_text = f"{parts[0]:02d}:{parts[1]:02d}"
    except ValueError:
        pass
    return f"{date_text}　{time_text}".strip()
