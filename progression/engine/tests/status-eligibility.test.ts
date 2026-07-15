import { describe, expect, it } from "vitest";
import { buildSourcesFromHeatResults, buildSourcesFromPreliminary, computeAdvancementFromSources } from "../src/advance";
import { assignLanes } from "../src/lanes";
import { resolveIdentifier } from "../src/resolve";
import type { EngineOutput, Pattern, ProgressionTemplate, Result } from "../src/types";
import { loadTemplate } from "./helpers";

/**
 * SPEC_engine.md §5.1 (step 3: `status === "finish"` の結果だけを対象にする) と
 * §6 エッジケース表 (DNS/DNF/DQ は直接進出・タイム拾い上げとも対象外) の検証。
 *
 * これらのテストはヘルパーの部分一致 (projectOutput) を使わず、
 * エンジン出力そのものを完全一致で比較する。
 */

/** Picks the entries_min..entries_max pattern from a template. */
function patternFor(template: ProgressionTemplate, entriesMin: number, entriesMax: number): Pattern {
  const pattern = template.patterns.find((p) => p.entries_min === entriesMin && p.entries_max === entriesMax);
  if (!pattern) {
    throw new Error(`No pattern ${entriesMin}-${entriesMax}`);
  }
  return pattern;
}

/** Runs heat results straight through the engine with no synthetic backfill. */
function advanceHeats(template: ProgressionTemplate, pattern: Pattern, heats: Record<string, Result[]>): EngineOutput {
  return computeAdvancementFromSources(pattern, buildSourcesFromHeatResults(pattern, heats), template.lanes);
}

/** Collects every crew_id that received a lane anywhere in the output. */
function assignedCrewIds(output: EngineOutput): string[] {
  return Object.values(output.races)
    .flatMap((race) => (Array.isArray(race) ? race : race.assignments))
    .map((assignment) => assignment.crew_id ?? "")
    .filter((crewId) => crewId !== "");
}

describe("status eligibility (SPEC §5.1 / §6)", () => {
  const templateA = loadTemplate("alljapan-2026-A");
  const patternTwo = patternFor(templateA, 7, 12);

  /**
   * A版パターン2 / 12艇・予選2組。SPECからの手計算:
   *
   * 入力 H1: A=200000 finish, C=210000 finish, E=220000 finish, G=230000 finish,
   *          I=240000 dnf, K=null dns
   *      H2: B=205000 finish, D=215000 finish, F=225000 finish, H=235000 finish,
   *          J=245000 dq, L=250000 finish
   *
   * 1. §5.1 step3: 各組で status==="finish" のみを着順対象にする。
   *    H1 完漕: A(1), C(2), E(3), G(4)          ← I(dnf)/K(dns) は着順が付かない
   *    H2 完漕: B(1), D(2), F(3), H(4), L(5)    ← J(dq) は着順が付かない
   * 2. protected rank は {1} (テンプレの 1.1.H / 2.1.H)。1着はタイム順で並べる:
   *    A=200000 < B=205000 → 1.1.H=A, 2.1.H=B
   * 3. 残りの完漕艇 (tail) をタイム昇順で HT ランク付け:
   *    C=210000→1.HT, D=215000→2.HT, E=220000→3.HT, F=225000→4.HT,
   *    G=230000→5.HT, H=235000→6.HT, L=250000→7.HT
   * 4. tail のレーン枠は 全12行 − protected 2枠 = 10。完漕 tail は7艇なので
   *    8.HT/9.HT/10.HT は占有者なし (§6「対象外艇を除外した後に上から N 艇を取る」)。
   * 5. FA テンプレ [1:3.HT, 2:1.HT, 3:1.1.H, 4:2.1.H, 5:2.HT, 6:4.HT]
   *    → 満員6艇なのでテンプレの bn をそのまま使う: bn1=E, bn2=C, bn3=A, bn4=B, bn5=D, bn6=F
   * 6. FB テンプレ [1:9.HT, 2:7.HT, 3:5.HT, 4:6.HT, 5:8.HT, 6:10.HT]
   *    → 8/9/10.HT が欠員。残るのは G(5.HT) / H(6.HT) / L(7.HT) の3艇。
   *    §5.2「レーンは中央から外側へ割り当てる」の推奨順 [3,4,2,5,1,6] の先頭3枠を
   *    速い順に与える → 1位G=bn3, 2位H=bn4, 3位L=bn2（レーン2/3/4）。
   */
  const statusEdgeHeats: Record<string, Result[]> = {
    H1: [
      { crew_id: "crew_A", time_ms: 200000, status: "finish" },
      { crew_id: "crew_C", time_ms: 210000, status: "finish" },
      { crew_id: "crew_E", time_ms: 220000, status: "finish" },
      { crew_id: "crew_G", time_ms: 230000, status: "finish" },
      { crew_id: "crew_I", time_ms: 240000, status: "dnf" },
      { crew_id: "crew_K", time_ms: null, status: "dns" }
    ],
    H2: [
      { crew_id: "crew_B", time_ms: 205000, status: "finish" },
      { crew_id: "crew_D", time_ms: 215000, status: "finish" },
      { crew_id: "crew_F", time_ms: 225000, status: "finish" },
      { crew_id: "crew_H", time_ms: 235000, status: "finish" },
      { crew_id: "crew_J", time_ms: 245000, status: "dq" },
      { crew_id: "crew_L", time_ms: 250000, status: "finish" }
    ]
  };

  it("assigns every lane exactly as derived from the SPEC (full-equality)", () => {
    const output = advanceHeats(templateA, patternTwo, statusEdgeHeats);

    expect(output).toEqual({
      races: {
        FA: [
          { bn: 1, crew_id: "crew_E", source: "3.HT" },
          { bn: 2, crew_id: "crew_C", source: "1.HT" },
          { bn: 3, crew_id: "crew_A", source: "1.1.H" },
          { bn: 4, crew_id: "crew_B", source: "2.1.H" },
          { bn: 5, crew_id: "crew_D", source: "2.HT" },
          { bn: 6, crew_id: "crew_F", source: "4.HT" }
        ],
        FB: [
          { bn: 2, crew_id: "crew_L", source: "7.HT" },
          { bn: 3, crew_id: "crew_G", source: "5.HT" },
          { bn: 4, crew_id: "crew_H", source: "6.HT" }
        ]
      }
    });
  });

  it("gives no lane to DNF, DQ, or DNS crews", () => {
    const assigned = assignedCrewIds(advanceHeats(templateA, patternTwo, statusEdgeHeats));

    expect(assigned).not.toContain("crew_I"); // dnf
    expect(assigned).not.toContain("crew_J"); // dq
    expect(assigned).not.toContain("crew_K"); // dns
  });

  it("keeps every completed finisher (no finisher is dropped)", () => {
    const output = advanceHeats(templateA, patternTwo, statusEdgeHeats);
    const finisherCount = Object.values(statusEdgeHeats)
      .flat()
      .filter((row) => row.status === "finish").length;

    // 完漕9艇 (A,B,C,D,E,F,G,H,L) = FA 6艇 + FB 3艇。1艇も消滅させない。
    expect(finisherCount).toBe(9);
    expect(assignedCrewIds(output).sort()).toEqual([
      "crew_A",
      "crew_B",
      "crew_C",
      "crew_D",
      "crew_E",
      "crew_F",
      "crew_G",
      "crew_H",
      "crew_L"
    ]);
  });

  it("promotes the next finisher into a protected rank when the heat winner is DQ'd", () => {
    // §6「直接進出枠の DQ が次順位へ繰り上がること」。
    // H1 の最速 crew_A を DQ にすると、次の完漕艇 crew_C が1着=1.1.H 相当へ繰り上がる。
    // crew_C=210000 > crew_B=205000 なので protected のタイム順は B が先:
    // 1.1.H=crew_B(205000), 2.1.H=crew_C(210000)
    const heats: Record<string, Result[]> = {
      H1: [
        { crew_id: "crew_A", time_ms: 200000, status: "dq" },
        { crew_id: "crew_C", time_ms: 210000, status: "finish" },
        { crew_id: "crew_E", time_ms: 220000, status: "finish" }
      ],
      H2: [
        { crew_id: "crew_B", time_ms: 205000, status: "finish" },
        { crew_id: "crew_D", time_ms: 215000, status: "finish" }
      ]
    };
    const sources = buildSourcesFromHeatResults(patternTwo, heats);

    expect(sources.get("1.1.H")?.crew_id).toBe("crew_B");
    expect(sources.get("2.1.H")?.crew_id).toBe("crew_C");
    // 残る完漕艇 E(220000) / D(215000) がタイム順で HT を埋める
    expect(sources.get("1.HT")?.crew_id).toBe("crew_D");
    expect(sources.get("2.HT")?.crew_id).toBe("crew_E");
    // 回帰の要: DQ艇 crew_A はどのソースにも現れてはならない
    // （修正前エンジンは status順ソートで A を末尾の HT に残していた）
    expect(Array.from(sources.values()).map((boat) => boat.crew_id)).not.toContain("crew_A");
  });

  it("promotes later finishers past an excluded boat in the HT time pool", () => {
    // §6「タイム拾い上げ4枠で、全体タイム3位が DQ の場合、1位、2位、4位、5位が進出」。
    // protected rank1 = A(H1) / B(H2)。tail は C=210000, D=215000, E=220000(dq),
    // F=225000, G=230000 → E を飛ばして 1.HT=C, 2.HT=D, 3.HT=F, 4.HT=G。
    const heats: Record<string, Result[]> = {
      H1: [
        { crew_id: "crew_A", time_ms: 200000, status: "finish" },
        { crew_id: "crew_C", time_ms: 210000, status: "finish" },
        { crew_id: "crew_E", time_ms: 220000, status: "dq" },
        { crew_id: "crew_G", time_ms: 230000, status: "finish" }
      ],
      H2: [
        { crew_id: "crew_B", time_ms: 205000, status: "finish" },
        { crew_id: "crew_D", time_ms: 215000, status: "finish" },
        { crew_id: "crew_F", time_ms: 225000, status: "finish" }
      ]
    };
    const sources = buildSourcesFromHeatResults(patternTwo, heats);

    expect(sources.get("1.HT")?.crew_id).toBe("crew_C");
    expect(sources.get("2.HT")?.crew_id).toBe("crew_D");
    expect(sources.get("3.HT")?.crew_id).toBe("crew_F");
    expect(sources.get("4.HT")?.crew_id).toBe("crew_G");
    // 回帰の要: DQ艇 crew_E は末尾の 5.HT すら得てはならない
    // （修正前エンジンは E を 5.HT に残し FB のレーンを与えていた）
    expect(Array.from(sources.values()).map((boat) => boat.crew_id)).not.toContain("crew_E");
  });

  // B版 13-18 / 3組×6、protected rank={1,2}。H1 が完漕1艇のみという退化形状。
  // 「protected枠を埋められない組」と「tail枠の会計」を同時に突く形状。
  const dns = (id: string): Result => ({ crew_id: id, time_ms: null, status: "dns" });
  const templateB = loadTemplate("alljapan-2026-B");
  const patternThreeB = patternFor(templateB, 13, 18);
  const shortHeat: Record<string, Result[]> = {
    H1: [{ crew_id: "crew_A", time_ms: 200000, status: "finish" }, dns("x1"), dns("x2"), dns("x3"), dns("x4"), dns("x5")],
      H2: [
        { crew_id: "crew_B", time_ms: 201000, status: "finish" },
        { crew_id: "crew_E", time_ms: 211000, status: "finish" },
        { crew_id: "crew_H", time_ms: 221000, status: "finish" },
        { crew_id: "crew_K", time_ms: 231000, status: "finish" },
        { crew_id: "crew_N", time_ms: 241000, status: "finish" },
        { crew_id: "crew_Q", time_ms: 251000, status: "finish" }
      ],
      H3: [
        { crew_id: "crew_C", time_ms: 202000, status: "finish" },
        { crew_id: "crew_F", time_ms: 212000, status: "finish" },
        { crew_id: "crew_I", time_ms: 222000, status: "finish" },
        { crew_id: "crew_L", time_ms: 232000, status: "finish" },
        { crew_id: "crew_O", time_ms: 242000, status: "finish" },
        { crew_id: "crew_R", time_ms: 252000, status: "finish" }
      ]
    };

  it("leaves no lane hole when a heat cannot fill a protected rank", () => {
    // H1 は完漕1艇のみなので rank2 を埋められず、3枠ある `N.2.H` のうち1枠が欠員になる。
    // 欠員はレーン詰めで吸収し、空きレーンを含む発艇表を出力してはならない。
    const output = advanceHeats(templateB, patternThreeB, shortHeat);

    for (const [raceCode, race] of Object.entries(output.races)) {
      const lanes = (Array.isArray(race) ? race : race.assignments).map((assignment) => assignment.bn);
      const contiguous = lanes.every((lane, index) => index === 0 || lane === lanes[index - 1] + 1);
      expect(`${raceCode}:${contiguous}`).toBe(`${raceCode}:true`);
    }
    expect(assignedCrewIds(output).filter((crewId) => crewId.startsWith("x"))).toEqual([]);
  });

  it("bounds the HT rank space by nominal tail slots, not by excluded-boat count", () => {
    // tail枠は「行数 − protected枠数」の総和で決まる: (6-2)×3 = 12。
    // 実際に埋まった protected 数(5)を引く実装だと 18-5=13 となり `13.HT` という幻ランクが生じ、
    // その分だけ後続艇のレーンが余計に前へずれる。枠数は除外艇の数に依存してはならない。
    const sources = buildSourcesFromHeatResults(patternThreeB, shortHeat);
    const htRanks = Array.from(sources.keys()).filter((key) => /^\d+\.HT$/.test(key));

    expect(htRanks.length).toBe(12);
    expect(sources.has("13.HT")).toBe(false);
  });

  it("excludes non-finishers from preliminary time ranks", () => {
    // §6: DNS は「出漕していないためタイム順位対象外」。
    // 完漕 A=200000, C=210000, D=215000 → 1.P=A, 2.P=C, 3.P=D。B(dns) はランクを得ない。
    const sources = buildSourcesFromPreliminary([
      { crew_id: "crew_A", time_ms: 200000, status: "finish" },
      { crew_id: "crew_B", time_ms: null, status: "dns" },
      { crew_id: "crew_C", time_ms: 210000, status: "finish" },
      { crew_id: "crew_D", time_ms: 215000, status: "finish" }
    ]);

    expect(sources.get("1.P")?.crew_id).toBe("crew_A");
    expect(sources.get("2.P")?.crew_id).toBe("crew_C");
    expect(sources.get("3.P")?.crew_id).toBe("crew_D");
    expect(Array.from(sources.values()).map((boat) => boat.crew_id)).not.toContain("crew_B");
  });

  it("does not seat an omitted placeholder in a lane via assignLanes", () => {
    // 除外で空いたランクのプレースホルダは source が一致してもレーンに座らせない
    // （座らせると crew_id 空の「幽霊艇」が発艇表に載る）。
    const sources = buildSourcesFromHeatResults(patternTwo, statusEdgeHeats);
    const mapping = assignLanes(Array.from(sources.values()), [
      { bn: 1, source: "9.HT" }, // 除外で空いたランク
      { bn: 2, source: "7.HT" } // 実在の完漕艇 crew_L
    ]);

    expect(mapping.map((row) => row.source)).toEqual(["7.HT"]);
    expect(mapping[0]?.boat.crew_id).toBe("crew_L");
  });

  it("does not resolve an identifier onto a non-finisher", () => {
    // §5.1 step3 は resolveIdentifier にも及ぶ。`2.1.H` は「完漕2番目」を指すべきで、
    // DNF艇 crew_D を返してはならない（返すとその艇が bn=2 のレーンを占める）。
    const boat = resolveIdentifier(
      "2.1.H",
      new Map<string, Result[]>([
        [
          "H",
          [
            { crew_id: "crew_A", time_ms: 200000, status: "finish" },
            { crew_id: "crew_D", time_ms: 210000, status: "dnf" },
            { crew_id: "crew_C", time_ms: 220000, status: "finish" }
          ]
        ]
      ])
    );

    expect(boat?.crew_id).toBe("crew_C");
  });

  it("sorts rows into finishing order before reading a rank positionally", () => {
    // SPEC §5.1 step4。§2.2 のとおり既存 race_NNN.json は lane 基準で並ぶため、
    // 入力がレーン順で届く前提。着順に並べ替えずに位置で引くと勝者を取り違える。
    // lane順入力: lane1=遅い(230000) / lane2=勝者(200000) / lane3=2着(210000)
    // → `1.1.H` は最速の crew_win を返さねばならない。
    const laneOrdered: Result[] = [
      { crew_id: "crew_slow", lane: 1, time_ms: 230000, status: "finish" },
      { crew_id: "crew_win", lane: 2, time_ms: 200000, status: "finish" },
      { crew_id: "crew_second", lane: 3, time_ms: 210000, status: "finish" }
    ];

    expect(resolveIdentifier("1.1.H", new Map([["H", laneOrdered]]))?.crew_id).toBe("crew_win");
    expect(resolveIdentifier("2.1.H", new Map([["H", laneOrdered]]))?.crew_id).toBe("crew_second");
  });
});
