import { parseIdentifier } from "./identifier";
import type {
  Assignment,
  Boat,
  EngineOutput,
  Identifier,
  LaneAssignment,
  Pattern,
  ProgressionTemplate,
  Result,
  Round,
  RoundResults,
  SourceMap,
  Status
} from "./types";
import { selectPattern } from "./pattern";

const STATUS_WEIGHT: Record<string, number> = { finish: 0, dnf: 1, dq: 2, dns: 3, unknown: 4 };

/**
 * Normalizes status spelling to lower-case engine comparison keys.
 *
 * This is an allow-list (SPEC §6.1): only an explicit `finish`, or a row carrying no
 * status field at all, counts as completed. Anything else — `EXC`, a blank cell, a typo,
 * or a status a future ruleset adds — is treated as not-completed so it can never
 * advance by default. Guessing "finish" for an unrecognized value would silently hand a
 * lane to a crew that did not finish.
 *
 * Because this fails closed, a typo also silently scratches a crew that DID finish, so
 * `types.ts#Status` is kept a closed union to catch that at build time.
 */
export function normalizeStatus(status: Status | string | undefined | null): "finish" | "dnf" | "dq" | "dns" | "unknown" {
  // Legacy compat is limited to rows carrying no status at all: older `race_NNN.json`
  // simply omits the field for a normal finish. A present-but-blank value is different
  // — it is an unrecognized value, so the allow-list rules it out rather than guessing.
  if (status === undefined || status === null) {
    return "finish";
  }
  // Trim before matching: these values come from spreadsheet cells and CSV columns, so
  // stray whitespace is routine. Under an allow-list an untrimmed "finish " would fall
  // through to `unknown` and silently scratch a crew that actually finished.
  const normalized = String(status).trim().toLowerCase();
  if (normalized === "finish" || normalized === "dnf" || normalized === "dq" || normalized === "dns") {
    return normalized;
  }
  return "unknown";
}

/** Returns all lane assignment groups from a pattern keyed by concrete race code. */
export function collectLaneAssignments(pattern: Pattern): Record<string, LaneAssignment[]> {
  const groups: Record<string, LaneAssignment[]> = {};
  for (const round of pattern.rounds) {
    if (round.lane_assignment) {
      groups[round.code] = round.lane_assignment;
    }
    if (round.lane_assignments) {
      for (const [raceCode, rules] of Object.entries(round.lane_assignments)) {
        groups[raceCode] = rules;
      }
    }
  }
  return groups;
}

/**
 * Centre-out lane order per venue lane count (SPEC §5.2).
 *
 * Index 0 is the lane given to the top-ranked boat, index 1 to the second, and so on,
 * so the first N entries are exactly the lanes an N-boat field should occupy.
 */
const DEFAULT_LANE_ORDER: Record<number, number[]> = {
  5: [3, 2, 4, 1, 5],
  6: [3, 4, 2, 5, 1, 6],
  7: [4, 3, 5, 2, 6, 1, 7],
  8: [4, 5, 3, 6, 2, 7, 1, 8]
};

/**
 * Computes target race assignments from a source map and pattern.
 *
 * `lanes` is the venue lane count (`ProgressionTemplate.lanes`). It must be passed for
 * the centre-out seating to pick the right order — a race whose rules do not reach the
 * venue's outermost lane would otherwise be mistaken for a smaller venue.
 */
export function computeAdvancementFromSources(pattern: Pattern, sources: SourceMap, lanes?: number): EngineOutput {
  const races: EngineOutput["races"] = {};
  for (const [raceCode, rules] of Object.entries(collectLaneAssignments(pattern))) {
    const assignments = seatCentreOut(rules, sources, lanes);
    if (assignments.length === 1) {
      races[raceCode] = { skipped: true, reason: "only_one_crew", assignments };
    } else if (assignments.length > 0) {
      races[raceCode] = assignments;
    }
  }
  return { races };
}

/**
 * Seats the boats that actually exist into the centre-out lane order (SPEC §5.2).
 *
 * Every template writes its lane assignments for a full field, and orders them so that
 * `bn` follows the centre-out order for the venue — the top rank sits in lane 3 of 6,
 * the next in lane 4, and the weakest ranks take the outside lanes. A short field (an
 * intermediate entry count, or ranks vacated by DNS/DNF/DQ) therefore must not keep the
 * template's raw `bn`, which would strand crews against one bank or leave a hole in the
 * middle of the course. Instead the survivors keep their relative rank and take the
 * first N lanes of the same order, so an N-boat field is always centred and identical
 * regardless of *why* it is short.
 */
function seatCentreOut(rules: LaneAssignment[], sources: SourceMap, lanes?: number): Assignment[] {
  // The venue lane count decides the order. Falling back to the widest lane this race
  // happens to use is only a guess, and a wrong guess silently loads another venue's
  // permutation, so callers should pass the template's declared `lanes`.
  const venueLanes = lanes ?? Math.max(...rules.map((rule) => rule.bn));
  const laneOrder = DEFAULT_LANE_ORDER[venueLanes];
  if (!laneOrder) {
    // SPEC §5.2.1 mandates this. Falling back to the template's raw `bn` here would
    // silently strand a short field against one bank — the exact start list the
    // centre-out rule exists to prevent — while looking authoritative.
    throw new Error(`LANE_ORDER_NOT_DEFINED: no centre-out lane order for ${venueLanes} lanes`);
  }
  // The rank order is only recoverable if every `bn` names a real, distinct lane of this
  // venue. A malformed template cannot be seated at all: guessing would either invent a
  // lane number or put two crews in the same lane, so reject it the way SPEC §4.3/§4.5 do.
  const bns = rules.map((rule) => rule.bn);
  const outOfRange = bns.find((bn) => !laneOrder.includes(bn));
  if (outOfRange !== undefined) {
    throw new Error(`LANE_OUT_OF_RANGE: lane ${outOfRange} is not one of ${venueLanes} lanes`);
  }
  if (new Set(bns).size !== bns.length) {
    throw new Error(`LANE_DUPLICATED: a lane is assigned twice in [${bns.join(", ")}]`);
  }
  // No capacity check is needed: distinct lanes all drawn from `laneOrder` cannot
  // outnumber it, so `laneOrder[assignments.length]` below is always a real lane.
  // A rule's position in the centre-out order is its rank, so sorting by that recovers
  // the rank order the template encodes without re-parsing source identifiers.
  const byRank = rules.slice().sort((a, b) => laneOrder.indexOf(a.bn) - laneOrder.indexOf(b.bn));
  const assignments: Assignment[] = [];
  for (const rule of byRank) {
    const boat = sources.get(rule.source);
    if (!boat || isOmittedSource(boat)) {
      continue;
    }
    const assignment: Assignment = { bn: laneOrder[assignments.length], source: rule.source };
    if (boat.crew_id) {
      assignment.crew_id = boat.crew_id;
    }
    if (boat.tie_group) {
      assignment.tie_group = boat.tie_group;
    }
    assignments.push(assignment);
  }
  return assignments.sort((a, b) => a.bn - b.bn);
}

/** Marker for a documented source rank that intentionally has no lane occupant. */
export function isOmittedSource(boat: Boat): boolean {
  return (boat as Boat & { __omitted?: boolean }).__omitted === true;
}

/** Computes advancement for a round result set using template lane assignments. */
export function computeAdvancement(template: ProgressionTemplate, entriesCount: number, results: RoundResults): EngineOutput {
  const pattern = selectPattern(template, entriesCount);
  return computeAdvancementFromSources(pattern, buildSourcesFromHeatResults(pattern, results), template.lanes);
}

/** Builds source boats from explicit source-result fixtures. */
export function buildSourcesFromExplicit(input: Record<string, string | string[]>): SourceMap {
  const sources: SourceMap = new Map();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      value.forEach((crewId, index) => {
        const source = `${index + 1}.${key}`;
        sources.set(source, { boat_id: crewId, crew_id: crewId, bn: index + 1, source });
      });
    } else {
      sources.set(key, { boat_id: value, crew_id: value, bn: 0, source: key });
    }
  }
  return sources;
}

/** Builds synthetic source boats for source-only template verification cases. */
export function buildSyntheticSources(pattern: Pattern, entriesCount = pattern.entries_max): SourceMap {
  const sources: SourceMap = new Map();
  const tailLimit = inferTailLimit(pattern, entriesCount);
  for (const rule of Object.values(collectLaneAssignments(pattern)).flat()) {
    const ast = parseIdentifier(rule.source);
    const isHeatTail = ast.round_code === "HT" && ast.race_rank === undefined;
    if ((!isHeatTail || ast.time_rank <= tailLimit) && !sources.has(rule.source)) {
      sources.set(rule.source, { boat_id: rule.source, crew_id: "", bn: 0, source: rule.source });
    }
  }
  return sources;
}

/**
 * Returns true when a row completed the race and may take part in advancement.
 *
 * SPEC_engine.md §5.1 (step 3) and §6: DNS/DNF/DQ are excluded from both direct
 * advancement and time pick-up, so they never receive a rank of any kind.
 */
export function isCompletedFinish(row: Result): boolean {
  return normalizeStatus(row.status) === "finish";
}

/** Marks a documented source rank whose occupant was excluded by status (SPEC §6.2). */
function omittedBoat(source: Identifier, bn: number): Boat {
  return { boat_id: source, crew_id: "", bn, source, __omitted: true } as Boat & { __omitted: true };
}

/** Builds source boats from preliminary results for one-race time-final patterns. */
export function buildSourcesFromPreliminary(results: Result[]): SourceMap {
  const sources: SourceMap = new Map();
  const finishers = sortRows(results).filter(isCompletedFinish);
  finishers.forEach((row, index) => {
    const source = `${index + 1}.P`;
    sources.set(source, rowToBoat(row, source));
  });
  // Ranks that would have been filled by an excluded boat have no occupant (§6).
  for (let rank = finishers.length + 1; rank <= results.length; rank += 1) {
    sources.set(`${rank}.P`, omittedBoat(`${rank}.P`, rank));
  }
  return sources;
}

/** Builds source boats from heat results, including protected race-rank sources and HT tail ranking. */
export function buildSourcesFromHeatResults(pattern: Pattern, heatResults: RoundResults): SourceMap {
  const sources: SourceMap = new Map();
  const protectedSources = collectProtectedSources(pattern, "H");
  const protectedRanks = new Set(
    Array.from(protectedSources)
      .map((source) => parseIdentifier(source).race_rank)
      .filter((rank): rank is number => rank !== undefined)
  );
  const protectedRows = new Map<number, Array<{ row: Result; raceIndex: number; rank: number }>>();
  const tails: Boat[] = [];
  let tailSlots = 0;
  for (const [raceKey, rows] of Object.entries(heatResults).sort(([a], [b]) => a.localeCompare(b))) {
    const raceIndex = Number(raceKey.replace(/^\D+/, ""));
    // Every heat reserves one slot per protected rank; the rest of its lanes feed the
    // tail pool. Counting nominal slots (not filled ones) keeps the tail rank space
    // independent of how many boats happened to be excluded by status.
    tailSlots += Math.max(0, rows.length - protectedRanks.size);
    // §5.1 step 3: ranks are assigned over completed finishers only, so an excluded
    // boat never holds a direct-advance slot and the next finisher is promoted into it.
    sortRows(rows)
      .filter(isCompletedFinish)
      .forEach((row, index) => {
        const rank = index + 1;
        if (protectedRanks.has(rank)) {
          const rankRows = protectedRows.get(rank) ?? [];
          rankRows.push({ row, raceIndex, rank });
          protectedRows.set(rank, rankRows);
        } else {
          tails.push({ ...rowToBoat(row, "__tail__"), __row: row } as Boat & { __row: Result });
        }
      });
  }
  for (const rank of protectedRanks) {
    const rows = protectedRows.get(rank) ?? [];
    rows
      .slice()
      // Boats at the same rank in different heats: the clock decides which heat's
      // holder becomes `1.M.H`, `2.M.H`, ... — their equal ranks say nothing.
      .sort((a, b) => compareByTime(a.row, b.row, a.raceIndex, b.raceIndex))
      .forEach(({ row }, index) => {
        const source = `${index + 1}.${rank}.H`;
        sources.set(source, rowToBoat(row, source));
      });
    // A heat with too few finishers leaves its direct-advance slot vacant. Mark it so
    // the centre-out seating sees a vacancy, rather than leaving the key unset.
    const slots = countProtectedSlots(protectedSources, rank);
    for (let index = rows.length + 1; index <= slots; index += 1) {
      sources.set(`${index}.${rank}.H`, omittedBoat(`${index}.${rank}.H`, index));
    }
  }
  sortTailBoats(tails).forEach((boat, index) => {
    const source = `${index + 1}.HT`;
    sources.set(source, { ...boat, source, bn: index + 1 });
  });
  // Tail ranks that an excluded boat would have occupied stay empty rather than
  // shifting a finisher out of the pool (§6: exclude first, then take the top N).
  for (let rank = tails.length + 1; rank <= tailSlots; rank += 1) {
    sources.set(`${rank}.HT`, omittedBoat(`${rank}.HT`, rank));
  }
  return sources;
}

/** Extracts tied HT groups from a source map for audit output. */
export function buildTieGroups(sources: SourceMap): EngineOutput["tie_groups"] {
  const grouped = new Map<string, Array<{ source: Identifier; boat: Boat }>>();
  for (const [source, boat] of sources.entries()) {
    if (source.endsWith(".HT") && boat.tie_group) {
      const rows = grouped.get(boat.tie_group) ?? [];
      rows.push({ source, boat });
      grouped.set(boat.tie_group, rows);
    }
  }
  return Array.from(grouped.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([tie_group, rows]) => ({
      tie_group,
      sources: rows.map((row) => row.source),
      crew_ids: rows.map((row) => row.boat.crew_id)
    }));
}

/** Counts how many direct-advance slots the template declares at one race rank. */
function countProtectedSlots(protectedSources: Set<Identifier>, rank: number): number {
  return Array.from(protectedSources).filter((source) => parseIdentifier(source).race_rank === rank).length;
}

/** Collects exact race-rank identifiers that should not be part of tail-time pools. */
function collectProtectedSources(pattern: Pattern, roundCode: string): Set<Identifier> {
  const protectedSources = new Set<Identifier>();
  for (const rule of Object.values(collectLaneAssignments(pattern)).flat()) {
    const ast = parseIdentifier(rule.source);
    if (ast.round_code === roundCode && ast.race_rank !== undefined) {
      protectedSources.add(rule.source);
    }
  }
  return protectedSources;
}

/**
 * Infers how many heat-tail source ranks exist for an entry-count fixture.
 *
 * Every crew either takes a direct-advance slot or lands in the tail-time pool, so the
 * pool holds `entries - direct slots` boats and HT ranks above that point address no
 * boat at all (SPEC §5.1 `resolveHeatTimeRank` -> RANK_NOT_FOUND; §6 "exclude first,
 * then take the top N"). Templates are written for their `entries_max`, so an
 * intermediate entry count simply leaves the highest HT ranks unoccupied.
 */
function inferTailLimit(pattern: Pattern, entriesCount: number): number {
  const protectedCount = collectProtectedSources(pattern, "H").size;
  return Math.max(0, entriesCount - protectedCount);
}

/** Converts a result row to a boat assignment source. */
function rowToBoat(row: Result, source: Identifier): Boat {
  return {
    boat_id: row.boat_id ?? row.crew_id,
    crew_id: row.crew_id,
    bn: row.bn ?? row.lane ?? 0,
    source,
    tie_group: row.tie_group
  };
}

/** Sorts tail boats by row metadata already attached to each boat. */
function sortTailBoats(boats: Boat[]): Boat[] {
  return boats
    .map((boat, index) => ({ boat, index }))
    .sort((a, b) => {
      const aRow = (a.boat as Boat & { __row?: Result }).__row;
      const bRow = (b.boat as Boat & { __row?: Result }).__row;
      if (a.boat.tie_group && b.boat.tie_group && a.boat.tie_group === b.boat.tie_group) {
        return (aRow?.input_order ?? a.index) - (bRow?.input_order ?? b.index);
      }
      // Cross-race time pick-up: rank must not lead here (see compareByTime). The
      // indices keep a dead heat deterministic instead of leaving it to sort internals.
      return compareByTime(aRow ?? fallbackResult(a.boat), bRow ?? fallbackResult(b.boat), a.index, b.index);
    })
    .map(({ boat }) => boat);
}

/** Creates a sortable fallback row from a boat. */
function fallbackResult(boat: Boat): Result {
  return { crew_id: boat.crew_id, status: "finish", tie_group: boat.tie_group };
}

/** Orders by status weight; a missing/unknown status sorts after every finisher. */
function compareStatus(a: Result, b: Result): number {
  return STATUS_WEIGHT[normalizeStatus(a.status)] - STATUS_WEIGHT[normalizeStatus(b.status)];
}

/**
 * Compares two rows of the SAME race, official finish rank first (SPEC §5.1
 * `resolveRaceRank` sorts by `finish_rank`).
 *
 * The recorded time can disagree with the official order: a photo finish, a jury
 * decision, or a corrected result all land in `finish_rank` while `time_ms` keeps
 * whatever the timing system captured. The official rank is what the crew is awarded,
 * so it decides who advances; raw time only orders rows the officials did not separate.
 */
function compareResultRows(a: Result, b: Result, aIndex: number, bIndex: number): number {
  const statusDiff = compareStatus(a, b);
  if (statusDiff !== 0) {
    return statusDiff;
  }
  // A row with no official rank sorts as "unplaced", after every ranked row. Comparing
  // ranks only when BOTH rows carry one would make this comparator intransitive on a
  // partially-filled column (ranked A < ranked B by rank, unranked C < A by time, yet
  // B < C by time), which lets the input row order decide who advances.
  const rankA = a.finish_rank ?? Number.POSITIVE_INFINITY;
  const rankB = b.finish_rank ?? Number.POSITIVE_INFINITY;
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return compareByTime(a, b, aIndex, bIndex);
}

/**
 * Compares two rows from DIFFERENT races by the clock (SPEC §5.1 `resolveHeatTimeRank`
 * and §6 `takeTimeAdvancers`, both of which sort by `compareByTimeWithTie`).
 *
 * Finish ranks from different heats are not comparable — one heat's runner-up is
 * routinely faster than another heat's winner — so time pick-up must ignore rank
 * entirely and rank only by time.
 */
function compareByTime(a: Result, b: Result, aIndex: number, bIndex: number): number {
  const statusDiff = compareStatus(a, b);
  if (statusDiff !== 0) {
    return statusDiff;
  }
  const timeA = a.time_ms ?? a.finish_time ?? Number.POSITIVE_INFINITY;
  const timeB = b.time_ms ?? b.finish_time ?? Number.POSITIVE_INFINITY;
  if (timeA !== timeB) {
    return timeA - timeB;
  }
  // Dead heat on the clock. Rank cannot decide it across races, but it is a stable,
  // meaningful tiebreak when both rows carry it, and keeps this ordering deterministic
  // rather than leaving it to whatever order the heats were iterated in.
  const rankA = a.finish_rank ?? Number.POSITIVE_INFINITY;
  const rankB = b.finish_rank ?? Number.POSITIVE_INFINITY;
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return (a.input_order ?? aIndex) - (b.input_order ?? bIndex);
}

/** Orders rows of one race: official rank first (SPEC §5.1.1). */
export function sortRows(rows: Result[]): Result[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compareResultRows(a.row, b.row, a.index, b.index))
    .map(({ row }) => row);
}

/** Orders rows across races by the clock (SPEC §5.1.1). */
export function sortRowsByTime(rows: Result[]): Result[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compareByTime(a.row, b.row, a.index, b.index))
    .map(({ row }) => row);
}
