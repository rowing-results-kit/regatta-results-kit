import { describe, expect, it } from "vitest";
import { buildSyntheticSources, computeAdvancementFromSources } from "../src/advance";
import type { EngineOutput, Pattern, ProgressionTemplate } from "../src/types";
import { loadTemplate } from "./helpers";

/**
 * HT（予選タイム拾い上げ）ランク空間の上限検証。
 *
 * SPEC_engine.md §5.1 `resolveHeatTimeRank` は候補配列を `candidates[rank - 1]` で引き、
 * 該当が無ければ `RANK_NOT_FOUND` を投げる = 実在しないランクは存在しない。
 * §6 も「対象外艇を除外した後に上から N 艇を取る」と規定する。
 * したがって HT ランクは「エントリー数 − 直接進出枠数」までしか存在し得ない。
 *
 * ヘルパーの部分一致 (projectOutput) を使わず完全一致で比較する。
 */

/** Picks the entries_min..entries_max pattern from a template. */
function patternFor(template: ProgressionTemplate, entriesMin: number, entriesMax: number): Pattern {
  const pattern = template.patterns.find((p) => p.entries_min === entriesMin && p.entries_max === entriesMax);
  if (!pattern) {
    throw new Error(`No pattern ${entriesMin}-${entriesMax}`);
  }
  return pattern;
}

/** Returns the assignment rows of one race regardless of skipped shape. */
function rowsOf(output: EngineOutput, raceCode: string) {
  const race = output.races[raceCode];
  if (!race) {
    return [];
  }
  return Array.isArray(race) ? race : race.assignments;
}

describe("HT tail rank space (SPEC §5.1 / §6)", () => {
  const templateA = loadTemplate("alljapan-2026-A");
  const patternFour = patternFor(templateA, 19, 24);

  /**
   * A版パターン4 / 22艇。SPECからの手計算:
   *
   * 1. テンプレ構造: 予選H=4組。直接進出枠は各組1着の 1.1.H / 2.1.H / 3.1.H / 4.1.H = 4枠。
   *    S(準決勝)= 直接進出4艇 + HT 1〜8 の12艇。FC = HT 9〜14。FD = HT 15〜20。
   *    合計 4 + 8 + 6 + 6 = 24 = entries_max（満員時に辻褄が合う）。
   * 2. 22艇の場合: HT対象 = 22 − 4(直接進出) = 18艇 → HT ランクは 1〜18 のみ実在する。
   *    19.HT / 20.HT は指す艇が存在しない（§5.1 なら RANK_NOT_FOUND）。
   * 3. FD テンプレ [1:19.HT, 2:17.HT, 3:15.HT, 4:16.HT, 5:18.HT, 6:20.HT]
   *    → 19.HT と 20.HT は不在。残るのは 15/16/17/18.HT の4艇。
   * 4. §5.2.1 の中央寄せで [3,4,2,5,1,6] の先頭4枠を速い順に与える:
   *    15.HT=bn3 / 16.HT=bn4 / 17.HT=bn2 / 18.HT=bn5 → レーン2/3/4/5。
   *    （テンプレ自身が同じ中央外向き順で書かれているため、結果的にテンプレの bn と
   *      一致するが、レーンは常に中央外向き順から採番しており bn の転記ではない）
   *    これはテストケース記述「22艇の中間人数でFDが4艇になる」とも一致する。
   */
  it("never fabricates an HT rank beyond entries minus direct-advance slots", () => {
    const sources = buildSyntheticSources(patternFour, 22);
    const htRanks = Array.from(sources.keys())
      .filter((key) => /^\d+\.HT$/.test(key))
      .map((key) => Number.parseInt(key, 10))
      .sort((a, b) => a - b);

    // 22艇 − 直接進出4枠 = 18。19.HT は実在しない艇を指す幻ランク。
    expect(Math.max(...htRanks)).toBe(18);
    expect(sources.has("19.HT")).toBe(false);
    expect(sources.has("20.HT")).toBe(false);
  });

  it("puts exactly four boats in FD for 22 crews (full-equality)", () => {
    const output = computeAdvancementFromSources(patternFour, buildSyntheticSources(patternFour, 22), templateA.lanes);

    expect(rowsOf(output, "FD")).toEqual([
      { bn: 2, source: "17.HT" },
      { bn: 3, source: "15.HT" },
      { bn: 4, source: "16.HT" },
      { bn: 5, source: "18.HT" }
    ]);
  });

  it("leaves the rounds that only use existing HT ranks untouched", () => {
    const output = computeAdvancementFromSources(patternFour, buildSyntheticSources(patternFour, 22), templateA.lanes);

    // FC は HT 9〜14 のみを使い、22艇でも全ランクが実在するので6艇のまま。
    expect(rowsOf(output, "FC").map((row) => row.source)).toEqual(["13.HT", "11.HT", "9.HT", "10.HT", "12.HT", "14.HT"]);
    expect(rowsOf(output, "S1").map((row) => row.source)).toEqual(["6.HT", "2.HT", "1.1.H", "3.1.H", "4.HT", "7.HT"]);
    expect(rowsOf(output, "S2").map((row) => row.source)).toEqual(["5.HT", "1.HT", "2.1.H", "4.1.H", "3.HT", "8.HT"]);
  });

  it("derives the tail limit generically across entry counts and templates", () => {
    // 一般規則の確認: HT上限 = エントリー数 − 直接進出枠数。特定の艇数への分岐を持たない。
    const cases: Array<{ template: string; min: number; max: number; entries: number; protectedSlots: number }> = [
      { template: "alljapan-2026-A", min: 19, max: 24, entries: 24, protectedSlots: 4 },
      { template: "alljapan-2026-A", min: 19, max: 24, entries: 21, protectedSlots: 4 },
      { template: "alljapan-2026-A", min: 19, max: 24, entries: 22, protectedSlots: 4 },
      { template: "alljapan-2026-A", min: 7, max: 12, entries: 12, protectedSlots: 2 }
    ];

    for (const testCase of cases) {
      const pattern = patternFor(loadTemplate(testCase.template), testCase.min, testCase.max);
      const sources = buildSyntheticSources(pattern, testCase.entries);
      const htRanks = Array.from(sources.keys())
        .filter((key) => /^\d+\.HT$/.test(key))
        .map((key) => Number.parseInt(key, 10));
      const maxTemplateRank = Math.max(
        ...Object.values(pattern.rounds)
          .flatMap((round) => [...(round.lane_assignment ?? []), ...Object.values(round.lane_assignments ?? {}).flat()])
          .filter((rule) => /^\d+\.HT$/.test(rule.source))
          .map((rule) => Number.parseInt(rule.source, 10))
      );
      // テンプレが参照する最大ランクと「艇数−直接進出枠」の小さい方が上限。
      const expected = Math.min(maxTemplateRank, testCase.entries - testCase.protectedSlots);
      expect(`${testCase.template}/${testCase.entries}: ${Math.max(...htRanks)}`).toBe(`${testCase.template}/${testCase.entries}: ${expected}`);
    }
  });
});
