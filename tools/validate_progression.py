#!/usr/bin/env python3
"""
validate_progression.py — Progression template validator.

Usage:
    python3 tools/validate_progression.py <template.json>

Exit 0 = PASS, Exit 1 = FAIL.

Validation rules:
  1. JSON is valid and parsable
  2. Required top-level keys present: id (or template_id), lanes, patterns[]
  3. Each pattern has entries_min <= entries_max
  4. Pattern entries ranges do not overlap with each other
  5. lane_assignment / lane_assignments source identifiers match the progression
     identifier grammar:  N.ROUND  or  N.M.ROUND
     where N, M are positive integers and ROUND matches [A-Z][A-Z0-9]*
  6. Lane numbers (bn) are within 1..lanes (inclusive)
  W. Coverage gap check (WARNING only, does not FAIL):
     Lists crew-count values in 1..60 not covered by any pattern.
     Gaps indicate the model cannot handle those crew counts.
"""

import json
import re
import sys
from pathlib import Path

# Grammar from identifier.ts
# parts=2: N.ROUND  (N >= 1, ROUND = [A-Z][A-Z0-9]*)
# parts=3: N.M.ROUND (N >= 1, M >= 1, ROUND = [A-Z][A-Z0-9]*)
ROUND_RE = re.compile(r'^[A-Z][A-Z0-9]*$')


def validate_identifier(s: str) -> bool:
    """Returns True if s matches the progression identifier grammar."""
    parts = s.split('.')
    if len(parts) == 2:
        time_rank, round_code = parts
        if not time_rank.isdigit() or int(time_rank) < 1:
            return False
        return bool(ROUND_RE.match(round_code))
    elif len(parts) == 3:
        time_rank, race_rank, round_code = parts
        if not time_rank.isdigit() or int(time_rank) < 1:
            return False
        if not race_rank.isdigit() or int(race_rank) < 1:
            return False
        return bool(ROUND_RE.match(round_code))
    return False


def collect_lane_rules(rounds: list) -> list[tuple[str, list]]:
    """Collect (race_code, [lane_assignment]) pairs from all rounds."""
    result = []
    for r in rounds:
        if 'lane_assignment' in r:
            result.append((r['code'], r['lane_assignment']))
        if 'lane_assignments' in r:
            for race_code, rules in r['lane_assignments'].items():
                result.append((race_code, rules))
    return result


COVERAGE_CHECK_MAX = 60  # ギャップ検出の上限（1〜60 の範囲で未カバーを検出）


def check_coverage_gaps(ranges: list[tuple[int, int, int]]) -> list[int]:
    """Return list of crew counts in 1..COVERAGE_CHECK_MAX not covered by any pattern range."""
    if not ranges:
        return list(range(1, COVERAGE_CHECK_MAX + 1))
    covered = set()
    for emin, emax, _ in ranges:
        for n in range(emin, emax + 1):
            if 1 <= n <= COVERAGE_CHECK_MAX:
                covered.add(n)
    return [n for n in range(1, COVERAGE_CHECK_MAX + 1) if n not in covered]


def validate(path: str) -> tuple[bool, list[str], list[str]]:
    """Returns (passed, errors, warnings). Exit code is based on errors only."""
    errors = []
    warnings = []

    # Rule 1: JSON validity
    try:
        with open(path, encoding='utf-8') as f:
            template = json.load(f)
    except json.JSONDecodeError as e:
        errors.append(f"JSON parse error: {e}")
        return False, errors, warnings
    except FileNotFoundError:
        errors.append(f"File not found: {path}")
        return False, errors, warnings

    # Rule 2: Required top-level keys
    template_id = template.get('id') or template.get('template_id')
    if not template_id:
        errors.append("Missing required key: 'id' (or 'template_id')")

    lanes = template.get('lanes')
    if lanes is None:
        errors.append("Missing required key: 'lanes'")
    elif not isinstance(lanes, int) or lanes < 1:
        errors.append(f"'lanes' must be a positive integer, got: {lanes!r}")
        lanes = None

    patterns = template.get('patterns')
    if patterns is None:
        errors.append("Missing required key: 'patterns'")
    elif not isinstance(patterns, list) or len(patterns) == 0:
        errors.append("'patterns' must be a non-empty array")
        patterns = None

    if errors:
        return False, errors, warnings

    # Rule 3: entries_min <= entries_max per pattern
    ranges = []
    for i, p in enumerate(patterns):
        emin = p.get('entries_min')
        emax = p.get('entries_max')
        if emin is None or emax is None:
            errors.append(f"Pattern[{i}] missing entries_min or entries_max")
            continue
        if not (isinstance(emin, int) and isinstance(emax, int)):
            errors.append(f"Pattern[{i}] entries_min/entries_max must be integers")
            continue
        if emin > emax:
            errors.append(f"Pattern[{i}] entries_min ({emin}) > entries_max ({emax})")
        ranges.append((emin, emax, i))

    # Rule 4: No overlapping ranges
    sorted_ranges = sorted(ranges, key=lambda x: x[0])
    for k in range(len(sorted_ranges) - 1):
        cur_min, cur_max, ci = sorted_ranges[k]
        nxt_min, nxt_max, ni = sorted_ranges[k + 1]
        if cur_max >= nxt_min:
            errors.append(
                f"Pattern[{ci}] range [{cur_min},{cur_max}] overlaps with "
                f"Pattern[{ni}] range [{nxt_min},{nxt_max}]"
            )

    # Rules 5 & 6: Identifier grammar and lane numbers
    for i, p in enumerate(patterns):
        rounds = p.get('rounds', [])
        for race_code, rules in collect_lane_rules(rounds):
            for rule in rules:
                source = rule.get('source', '')
                bn = rule.get('bn')

                # Rule 5: identifier grammar
                if not validate_identifier(source):
                    errors.append(
                        f"Pattern[{i}] race '{race_code}': "
                        f"invalid identifier '{source}'"
                    )

                # Rule 6: lane number within 1..lanes
                if bn is not None and lanes is not None:
                    if not isinstance(bn, int) or bn < 1 or bn > lanes:
                        errors.append(
                            f"Pattern[{i}] race '{race_code}': "
                            f"bn={bn} is outside valid range 1..{lanes}"
                        )

    # Warning W: Coverage gap check (1..COVERAGE_CHECK_MAX)
    if not errors:  # only run when structurally valid
        gaps = check_coverage_gaps(ranges)
        if gaps:
            # Group consecutive gaps for readability
            gap_groups = []
            start = gaps[0]
            prev = gaps[0]
            for n in gaps[1:]:
                if n == prev + 1:
                    prev = n
                else:
                    gap_groups.append(f"{start}-{prev}" if start != prev else str(start))
                    start = prev = n
            gap_groups.append(f"{start}-{prev}" if start != prev else str(start))
            warnings.append(
                f"Coverage gap: crew counts not covered by any pattern "
                f"(1..{COVERAGE_CHECK_MAX}): {', '.join(gap_groups)}"
            )

    return len(errors) == 0, errors, warnings


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 tools/validate_progression.py <template.json>")
        sys.exit(1)

    path = sys.argv[1]
    passed, errors, warnings = validate(path)

    if passed:
        print(f"PASS: {path}")
        for w in warnings:
            print(f"  WARNING: {w}")
        sys.exit(0)
    else:
        print(f"FAIL: {path}")
        for err in errors:
            print(f"  - {err}")
        sys.exit(1)


if __name__ == '__main__':
    main()
