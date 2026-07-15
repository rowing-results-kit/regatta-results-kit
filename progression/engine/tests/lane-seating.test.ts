import { describe, expect, it } from "vitest";
import { buildSourcesFromHeatResults, buildSourcesFromPreliminary, computeAdvancementFromSources, normalizeStatus } from "../src/advance";
import type { EngineOutput, Pattern, ProgressionTemplate, Result } from "../src/types";
import { loadTemplate } from "./helpers";

/**
 * 短編成のレーン配置（SPEC §5.2）と status 許可リストの検証。
 *
 * §5.2「レーンは中央から外側へ割り当てる。6レーンの場合の推奨順は [3, 4, 2, 5, 1, 6]」。
 * N艇の編成が占めるレーンは、この順の先頭N枠でなければならない。したがって
 * 「同じN艇の編成」は、短くなった理由（エントリー数が少ない／DNS等で欠けた）に
 * 関わらず必ず同じ発艇表になる。
 */

/** Picks the entries_min..entries_max pattern from a template. */
function patternFor(template: ProgressionTemplate, entriesMin: number, entriesMax: number): Pattern {
  const pattern = template.patterns.find((p) => p.entries_min === entriesMin && p.entries_max === entriesMax);
  if (!pattern) {
    throw new Error(`No pattern ${entriesMin}-${entriesMax}`);
  }
  return pattern;
}

/** Renders one race as `bn=crew` strings for comparison. */
function seatsOf(output: EngineOutput, raceCode: string): string[] {
  const race = output.races[raceCode];
  if (!race) {
    return [];
  }
  return (Array.isArray(race) ? race : race.assignments).map((row) => `${row.bn}=${row.crew_id}`);
}

const finish = (crewId: string, timeMs: number): Result => ({ crew_id: crewId, time_ms: timeMs, status: "finish" });
const scratch = (crewId: string, status: string): Result => ({ crew_id: crewId, time_ms: null, status: status as Result["status"] });

describe("short-field lane seating (SPEC §5.2)", () => {
  const templateA = loadTemplate("alljapan-2026-A");
  const patternTwo = patternFor(templateA, 7, 12);

  /**
   * 報告済みの再現ケースを固定する回帰テスト。
   *
   * A版パターン2の FB は [1:9.HT, 2:7.HT, 3:5.HT, 4:6.HT, 5:8.HT, 6:10.HT]。
   * どちらのシナリオでも FB に残るのは 5/6/7/8.HT の4艇（= crew_I, G, H, J）:
   *   (a) 10艇・全員完漕      → tail 8艇 → HT 1〜8 が実在（9/10.HT は不在）
   *   (b) 12艇・DNS 2艇       → 完漕10艇 → tail 8艇（9/10.HT は欠員）
   * §5.2 の [3,4,2,5,1,6] 先頭4枠を速い順に与える:
   *   1位 5.HT(G)=bn3 / 2位 6.HT(H)=bn4 / 3位 7.HT(I)=bn2 / 4位 8.HT(J)=bn5
   * → どちらも レーン 2/3/4/5。艇数と編成が同じなら発艇表は一致しなければならない。
   */
  it("seats an identical 4-boat field identically whether it is short by entries or by scratches", () => {
    const allFinish = computeAdvancementFromSources(
      patternTwo,
      buildSourcesFromHeatResults(patternTwo, {
        H1: [finish("crew_A", 200000), finish("crew_C", 210000), finish("crew_E", 220000), finish("crew_G", 230000), finish("crew_I", 240000)],
        H2: [finish("crew_B", 205000), finish("crew_D", 215000), finish("crew_F", 225000), finish("crew_H", 235000), finish("crew_J", 245000)]
      }),
      templateA.lanes
    );
    const withScratches = computeAdvancementFromSources(
      patternTwo,
      buildSourcesFromHeatResults(patternTwo, {
        H1: [finish("crew_A", 200000), finish("crew_C", 210000), finish("crew_E", 220000), finish("crew_G", 230000), finish("crew_I", 240000), scratch("crew_K", "dns")],
        H2: [finish("crew_B", 205000), finish("crew_D", 215000), finish("crew_F", 225000), finish("crew_H", 235000), finish("crew_J", 245000), scratch("crew_L", "dns")]
      }),
      templateA.lanes
    );

    // §5.2: 4艇 → [3,4,2,5] → レーン2/3/4/5（中央寄せ）。端寄せ 1/2/3/4 は誤り。
    const expected = ["2=crew_I", "3=crew_G", "4=crew_H", "5=crew_J"];
    expect(seatsOf(allFinish, "FB")).toEqual(expected);
    expect(seatsOf(withScratches, "FB")).toEqual(expected);
  });

  /** Builds a one-race pattern plus a source map covering every rule. */
  function brokenRace(bns: number[]): { pattern: Pattern; sources: Map<string, Boat> } {
    const rules = bns.map((bn, index) => ({ bn, source: `${index + 1}.P` }));
    return {
      pattern: { entries_min: 1, entries_max: 99, rounds: [{ code: "F", name: "F", race_count: 1, lane_assignment: rules }] },
      sources: new Map(rules.map((rule) => [rule.source, { boat_id: rule.source, crew_id: rule.source, bn: 0, source: rule.source }]))
    };
  }

  it("rejects a malformed template instead of publishing an impossible start list", () => {
    // validate_progression.py は bn の一意性もレース単位の本数も検査しないので、
    // 歪んだテンプレが届き得る。推測して着席させると「bn無しの艇」や
    // 「同一レーンに2艇」といった物理的に不可能な発艇表を出してしまうため、
    // SPEC §4.3/§4.5 のエラー語彙どおり弾く。
    const shapes: Array<[string, number[], RegExp]> = [
      ["bn重複", [3, 4, 2, 5, 1, 5], /LANE_DUPLICATED/],
      // 7本目は必ずどれかの bn と重なる（6レーンに7つの相異なるレーンは存在しない）
      ["レーン数超過(7本)", [3, 4, 2, 5, 1, 6, 2], /LANE_DUPLICATED/],
      ["範囲外bn(9)", [3, 4, 2, 5, 1, 9], /LANE_OUT_OF_RANGE/],
      ["bn=0", [0, 3, 4, 2, 5], /LANE_OUT_OF_RANGE/],
      ["負のbn", [-1, 3, 4, 2, 5], /LANE_OUT_OF_RANGE/]
    ];

    for (const [label, bns, pattern_] of shapes) {
      const { pattern, sources } = brokenRace(bns);
      expect(() => computeAdvancementFromSources(pattern, sources, 6), label).toThrow(pattern_);
    }
  });

  it("throws rather than silently mis-seating a venue with no defined lane order", () => {
    // SPEC §5.2.1: DEFAULT_LANE_ORDER に無いレーン数は LANE_ORDER_NOT_DEFINED。
    // 黙ってテンプレの bn へフォールバックすると、短編成が片岸に寄った発艇表を
    // 「正しいもの」として出力してしまう。
    const { pattern, sources } = brokenRace([3, 1, 2, 4]);

    expect(() => computeAdvancementFromSources(pattern, sources, 4)).toThrow(/LANE_ORDER_NOT_DEFINED/);
    expect(() => computeAdvancementFromSources(pattern, sources, 9)).toThrow(/LANE_ORDER_NOT_DEFINED/);
  });

  it("still seats a well-formed short field centre-out", () => {
    // 上の厳格化が正常系を巻き添えにしていないことの確認。
    // 6レーン・5艇分のレース（bn最大=5）で生存3艇 → [3,4,2] を順に与える。
    const { pattern, sources } = brokenRace([3, 4, 2, 5, 1]);
    for (const key of ["4.P", "5.P"]) {
      sources.delete(key);
    }
    const race = computeAdvancementFromSources(pattern, sources, 6).races["F"];
    const rows = Array.isArray(race) ? race : race.assignments;

    expect(rows.map((row) => `${row.bn}=${row.source}`)).toEqual(["2=3.P", "3=1.P", "4=2.P"]);
  });

  it("uses the template's declared lane count, not the widest lane a race happens to use", () => {
    // 6レーン会場で、5艇分だけ中央外向きに書かれたレース（bn 最大=5）。
    // max(bn) から会場を推測すると DEFAULT_LANE_ORDER[5]=[3,2,4,1,5]（5レーン会場の順）を
    // 引いてしまい、ランク導出も着席も狂う。会場は 6 なので [3,4,2,5,1,6] が正。
    const rules = [
      { bn: 3, source: "1.P" },
      { bn: 4, source: "2.P" },
      { bn: 2, source: "3.P" },
      { bn: 5, source: "4.P" },
      { bn: 1, source: "5.P" }
    ];
    const survivors = ["1.P", "2.P", "4.P"];
    const sources = new Map(survivors.map((source) => [source, { boat_id: source, crew_id: source, bn: 0, source }]));
    const narrow: Pattern = { entries_min: 1, entries_max: 5, rounds: [{ code: "F", name: "F", race_count: 1, lane_assignment: rules }] };
    const rows = computeAdvancementFromSources(narrow, sources, 6).races["F"];

    // 生存は 1位(1.P) / 2位(2.P) / 4位(4.P) の3艇 → [3,4,2] を順に与える
    expect((Array.isArray(rows) ? rows : rows.assignments).map((row) => `${row.bn}=${row.source}`)).toEqual(["2=4.P", "3=1.P", "4=2.P"]);
  });

  it("keeps a full field on the template's own lane numbers", () => {
    // 満員時はテンプレの bn がそのまま §5.2 の順（テンプレ自体が中央外向きで書かれている）。
    const output = computeAdvancementFromSources(
      patternTwo,
      buildSourcesFromHeatResults(patternTwo, {
        H1: [finish("crew_A", 200000), finish("crew_C", 210000), finish("crew_E", 220000), finish("crew_G", 230000), finish("crew_I", 240000), finish("crew_K", 255000)],
        H2: [finish("crew_B", 205000), finish("crew_D", 215000), finish("crew_F", 225000), finish("crew_H", 235000), finish("crew_J", 245000), finish("crew_L", 260000)]
      }),
      templateA.lanes
    );

    expect(seatsOf(output, "FA")).toEqual(["1=crew_E", "2=crew_C", "3=crew_A", "4=crew_B", "5=crew_D", "6=crew_F"]);
    expect(seatsOf(output, "FB")).toEqual(["1=crew_K", "2=crew_I", "3=crew_G", "4=crew_H", "5=crew_J", "6=crew_L"]);
  });

  it("centres a short preliminary final the same way regardless of scratches", () => {
    // A版パターン1 F=[1:5.P, 2:3.P, 3:1.P, 4:2.P, 5:4.P, 6:6.P]。
    // 完漕4艇なら §5.2 [3,4,2,5] → 1位=bn3, 2位=bn4, 3位=bn2, 4位=bn5。
    const patternOne = patternFor(templateA, 1, 6);
    const fourEntries = computeAdvancementFromSources(
      patternOne,
      buildSourcesFromPreliminary([finish("crew_A", 200000), finish("crew_B", 210000), finish("crew_C", 220000), finish("crew_D", 230000)]),
      templateA.lanes
    );
    const sixWithTwoScratches = computeAdvancementFromSources(
      patternOne,
      buildSourcesFromPreliminary([
        finish("crew_A", 200000),
        finish("crew_B", 210000),
        finish("crew_C", 220000),
        finish("crew_D", 230000),
        scratch("crew_E", "dns"),
        scratch("crew_F", "dq")
      ]),
      templateA.lanes
    );

    const expected = ["2=crew_C", "3=crew_A", "4=crew_B", "5=crew_D"];
    expect(seatsOf(fourEntries, "F")).toEqual(expected);
    expect(seatsOf(sixWithTwoScratches, "F")).toEqual(expected);
  });
});

describe("status allow-list (normalizeStatus)", () => {
  const templateA = loadTemplate("alljapan-2026-A");
  const patternTwo = patternFor(templateA, 7, 12);

  it("treats an explicit finish and an absent status as completed", () => {
    expect(normalizeStatus("finish")).toBe("finish");
    expect(normalizeStatus("FINISH")).toBe("finish");
    // 旧 race_NNN.json は status 欄そのものを持たずに通常完漕を表す（SPEC 付録C）。
    // 互換対象はこの「欄が無い」場合のみ。
    expect(normalizeStatus(undefined)).toBe("finish");
    expect(normalizeStatus(null)).toBe("finish");
  });

  it("treats a present-but-blank status as unknown, not as a finish", () => {
    // 空文字は「欄が無い」のとは別物＝明示的に書かれた不明値。許可リストの意図
    // （不明値は進出させない）に従い finish と推測せず unknown へ倒す。
    expect(normalizeStatus("")).toBe("unknown");
    expect(normalizeStatus("  ")).toBe("unknown");
    expect(normalizeStatus("\t\n")).toBe("unknown");
  });

  it("maps the known scratch codes to themselves", () => {
    expect(normalizeStatus("DNS")).toBe("dns");
    expect(normalizeStatus("dnf")).toBe("dnf");
    expect(normalizeStatus("DQ")).toBe("dq");
  });

  it("trims whitespace before matching so a padded status is not a scratch", () => {
    // 表計算セル/CSV 由来の値には空白が混ざる。許可リストで trim を怠ると
    // "finish " が unknown に落ち、完漕した艇を黙って発艇表から消してしまう
    // （旧denylistは未知を finish に倒していたので、この消失は起こり得なかった）。
    expect(normalizeStatus("finish ")).toBe("finish");
    expect(normalizeStatus(" finish")).toBe("finish");
    expect(normalizeStatus("\tFinish\n")).toBe("finish");
    expect(normalizeStatus(" DNS ")).toBe("dns");
  });

  it("treats EXC and any unknown status as not completed", () => {
    // 許可リスト方式: 未知の status を finish と推測すると、完漕していない艇に
    // レーンを与えてしまう。EXC（SPEC §2.1 の ResultStatus）・打ち間違い・
    // 将来の競漕規則が足すコードは、既定で非完漕として扱う。
    expect(normalizeStatus("EXC")).toBe("unknown");
    expect(normalizeStatus("exc")).toBe("unknown");
    expect(normalizeStatus("finished")).toBe("unknown");
    expect(normalizeStatus("fnish")).toBe("unknown");
    expect(normalizeStatus("scratched")).toBe("unknown");
  });

  it("keeps a blank-status crew out of the next round", () => {
    // 空欄は正規化層で補完される建前（SPEC 付録C）。補完漏れをエンジンが
    // finish と推測して埋めると、完漕していない艇にレーンを与えかねない。
    const sources = buildSourcesFromHeatResults(patternTwo, {
      H1: [finish("crew_A", 200000), finish("crew_C", 210000), scratch("crew_E", ""), finish("crew_G", 230000)],
      H2: [finish("crew_B", 205000), finish("crew_D", 215000), finish("crew_F", 225000)]
    });

    expect(Array.from(sources.values()).map((boat) => boat.crew_id)).not.toContain("crew_E");
    expect(sources.get("1.HT")?.crew_id).toBe("crew_C");
    expect(sources.get("2.HT")?.crew_id).toBe("crew_D");
    expect(sources.get("3.HT")?.crew_id).toBe("crew_F");
    expect(sources.get("4.HT")?.crew_id).toBe("crew_G");
  });

  it("keeps an EXC crew out of the next round", () => {
    // EXC の crew_E は着順・HTランクとも得ず、次の完漕艇が繰り上がる。
    const sources = buildSourcesFromHeatResults(patternTwo, {
      H1: [finish("crew_A", 200000), finish("crew_C", 210000), scratch("crew_E", "EXC"), finish("crew_G", 230000)],
      H2: [finish("crew_B", 205000), finish("crew_D", 215000), finish("crew_F", 225000)]
    });

    expect(Array.from(sources.values()).map((boat) => boat.crew_id)).not.toContain("crew_E");
    expect(sources.get("1.HT")?.crew_id).toBe("crew_C");
    expect(sources.get("2.HT")?.crew_id).toBe("crew_D");
    expect(sources.get("3.HT")?.crew_id).toBe("crew_F");
    expect(sources.get("4.HT")?.crew_id).toBe("crew_G");
  });
});
