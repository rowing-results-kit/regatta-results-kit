import { isCompletedFinish, sortRows, sortRowsByTime } from "./advance";
import { parseIdentifier } from "./identifier";
import type { Boat, Identifier, Result } from "./types";

/** Resolves a source identifier against a map of source keys to ordered result rows. */
export function resolveIdentifier(identifier: Identifier, allResults: Map<string, Result[]>): Boat | null {
  const ast = parseIdentifier(identifier);
  const rows = allResults.get(identifier) ?? allResults.get(ast.round_code) ?? [];
  // SPEC §5.1 step 3: DNS/DNF/DQ never hold a rank, so the next finisher takes it.
  const finishers = rows.filter(isCompletedFinish);
  // SPEC §5.1 step 4 / §5.1.1: order before reading the rank positionally — callers may
  // hand rows in lane order (§2.2 normalizes `race_NNN.json`, which is keyed by lane).
  // Which order depends on the identifier: a tail code (`HT`/`FT`/`QT`, i.e. `is_tail`)
  // is a cross-race time pick-up and must ignore finish rank, while `N.M.H` and `N.P`
  // are decided by the official rank.
  const ordered = ast.is_tail ? sortRowsByTime(finishers) : sortRows(finishers);
  const row = ordered[ast.time_rank - 1];
  if (!row) {
    return null;
  }
  return {
    boat_id: row.boat_id ?? row.crew_id,
    crew_id: row.crew_id,
    bn: row.bn ?? row.lane ?? ast.time_rank,
    source: identifier,
    tie_group: row.tie_group
  };
}
