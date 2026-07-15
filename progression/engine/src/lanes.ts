import { isOmittedSource } from "./advance";
import type { Boat, BoatLaneMapping, LaneAssignment } from "./types";

/** Assigns boats to lane numbers according to lane assignment rules. */
export function assignLanes(boats: Boat[], rules: LaneAssignment[]): BoatLaneMapping {
  return rules.flatMap((rule) => {
    const boat = boats.find((candidate) => candidate.source === rule.source);
    // A rank vacated by a DNS/DNF/DQ carries a placeholder, not a crew — it must not
    // be seated in a lane just because its source identifier matches the rule.
    if (!boat || isOmittedSource(boat)) {
      return [];
    }
    return [{ bn: rule.bn, boat: { ...boat, bn: rule.bn }, source: rule.source }];
  });
}
