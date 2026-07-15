import { describe, expect, it } from "vitest";
import { buildSourcesFromHeatResults, buildSourcesFromPreliminary, sortRows } from "../src/advance";
import { resolveIdentifier } from "../src/resolve";
import type { Pattern, ProgressionTemplate, Result } from "../src/types";
import { loadTemplate } from "./helpers";

/**
 * 公式着順（finish_rank）と計測タイムが食い違う場合の優先順位。
 *
 * SPEC_engine.md §5.1 は2つの並べ替えを区別している:
 *  - `resolveRaceRank`（組内の着順解決）      → `compareByFinishRank` = 着順で並べる
 *  - `resolveHeatTimeRank`（組跨ぎのタイム拾い上げ）→ `compareByTimeWithTie` = タイムで並べる
 *
 * 写真判定・審判裁定・記録訂正はすべて finish_rank に載り、time_ms は計測値のまま
 * 残るため、両者は食い違い得る。組内では公式着順が正、組跨ぎでは着順は比較不能
 * （他組の1着より速い2着は普通にある）なのでタイムが正。
 */

/** Picks the entries_min..entries_max pattern from a template. */
function patternFor(template: ProgressionTemplate, entriesMin: number, entriesMax: number): Pattern {
  const pattern = template.patterns.find((p) => p.entries_min === entriesMin && p.entries_max === entriesMax);
  if (!pattern) {
    throw new Error(`No pattern ${entriesMin}-${entriesMax}`);
  }
  return pattern;
}

describe("finish_rank vs raw time (SPEC §5.1)", () => {
  const templateA = loadTemplate("alljapan-2026-A");
  const patternTwo = patternFor(templateA, 7, 12);

  it("lets the official finish rank beat the recorded time inside one heat", () => {
    /**
     * 手計算:
     * H1 は写真判定で crew_C を1着に確定。計測タイムは crew_A の方が 100ms 速いが、
     * 公式着順は C=1 / A=2 / E=3。§5.1 resolveRaceRank は finish_rank で並べるので
     * 組内の着順は C(1), A(2), E(3)。
     * protected rank={1} なので H1 の1着枠は crew_C（crew_A ではない）。
     * H2 は crew_B が 205000 で1着。
     * 1着どうしはタイム順に並べる: C=200100 < B=205000 → 1.1.H=crew_C, 2.1.H=crew_B。
     */
    const sources = buildSourcesFromHeatResults(patternTwo, {
      H1: [
        { crew_id: "crew_A", time_ms: 200000, finish_rank: 2, status: "finish" },
        { crew_id: "crew_C", time_ms: 200100, finish_rank: 1, status: "finish" },
        { crew_id: "crew_E", time_ms: 210000, finish_rank: 3, status: "finish" }
      ],
      H2: [
        { crew_id: "crew_B", time_ms: 205000, finish_rank: 1, status: "finish" },
        { crew_id: "crew_D", time_ms: 215000, finish_rank: 2, status: "finish" }
      ]
    });

    // 生タイム優先なら 1.1.H=crew_A になってしまう。公式着順が正。
    expect(sources.get("1.1.H")?.crew_id).toBe("crew_C");
    expect(sources.get("2.1.H")?.crew_id).toBe("crew_B");
  });

  it("keeps a photo-finish loser out of the direct-advance slot", () => {
    // 同着タイムを写真判定で分けた場合。time_ms が完全一致でも finish_rank で確定する。
    // protected rank1 = H1 は crew_C（finish_rank 1）、crew_A は2着で tail へ落ちる。
    const sources = buildSourcesFromHeatResults(patternTwo, {
      H1: [
        { crew_id: "crew_A", time_ms: 200000, finish_rank: 2, photo_flag: true, status: "finish" },
        { crew_id: "crew_C", time_ms: 200000, finish_rank: 1, photo_flag: true, status: "finish" }
      ],
      H2: [{ crew_id: "crew_B", time_ms: 205000, finish_rank: 1, status: "finish" }]
    });

    expect(sources.get("1.1.H")?.crew_id).toBe("crew_C");
    expect(sources.get("2.1.H")?.crew_id).toBe("crew_B");
    // 敗れた crew_A は直接進出枠を得ず、タイム拾い上げ側へ回る
    expect(sources.get("1.HT")?.crew_id).toBe("crew_A");
  });

  it("ranks the cross-heat time pick-up by the clock, never by finish rank", () => {
    /**
     * ここが要。組跨ぎで着順を優先すると壊れる。
     * protected rank={1} → 各組1着は直接進出。tail は各組2着以降:
     *   crew_C  H1 2着 time=230000
     *   crew_D  H2 2着 time=215000
     *   crew_F  H2 3着 time=225000
     * 着順優先なら 2着どうし(C,D)が3着(F)より前に来て 1.HT=D, 2.HT=C, 3.HT=F。
     * §5.1 resolveHeatTimeRank はタイム順なので正解は
     *   1.HT=crew_D(215000), 2.HT=crew_F(225000), 3.HT=crew_C(230000)
     * ＝他組の3着 crew_F が2着 crew_C を追い越す。
     */
    const sources = buildSourcesFromHeatResults(patternTwo, {
      H1: [
        { crew_id: "crew_A", time_ms: 200000, finish_rank: 1, status: "finish" },
        { crew_id: "crew_C", time_ms: 230000, finish_rank: 2, status: "finish" }
      ],
      H2: [
        { crew_id: "crew_B", time_ms: 205000, finish_rank: 1, status: "finish" },
        { crew_id: "crew_D", time_ms: 215000, finish_rank: 2, status: "finish" },
        { crew_id: "crew_F", time_ms: 225000, finish_rank: 3, status: "finish" }
      ]
    });

    expect(sources.get("1.HT")?.crew_id).toBe("crew_D");
    expect(sources.get("2.HT")?.crew_id).toBe("crew_F");
    expect(sources.get("3.HT")?.crew_id).toBe("crew_C");
  });

  it("orders same-rank heat winners by the clock, not by their equal ranks", () => {
    // 1着どうしは finish_rank が同値なので比較不能 → タイムで 1.1.H / 2.1.H を決める。
    const sources = buildSourcesFromHeatResults(patternTwo, {
      H1: [{ crew_id: "crew_slow", time_ms: 210000, finish_rank: 1, status: "finish" }],
      H2: [{ crew_id: "crew_fast", time_ms: 200000, finish_rank: 1, status: "finish" }]
    });

    expect(sources.get("1.1.H")?.crew_id).toBe("crew_fast");
    expect(sources.get("2.1.H")?.crew_id).toBe("crew_slow");
  });

  it("falls back to time when the official rank is absent", () => {
    // finish_rank が無い行（既存データの大半）はタイム順のまま。回帰防止。
    const sources = buildSourcesFromHeatResults(patternTwo, {
      H1: [
        { crew_id: "crew_A", time_ms: 200000, status: "finish" },
        { crew_id: "crew_C", time_ms: 210000, status: "finish" }
      ],
      H2: [{ crew_id: "crew_B", time_ms: 205000, status: "finish" }]
    });

    expect(sources.get("1.1.H")?.crew_id).toBe("crew_A");
    expect(sources.get("1.HT")?.crew_id).toBe("crew_C");
  });

  it("applies the official rank to preliminary time-final ranking", () => {
    // プレリミナリーは1レース＝組内なので finish_rank が正。
    // 生タイムは A が最速だが、公式着順は C=1 → 1.P=crew_C。
    const sources = buildSourcesFromPreliminary([
      { crew_id: "crew_A", time_ms: 200000, finish_rank: 2, status: "finish" },
      { crew_id: "crew_C", time_ms: 200100, finish_rank: 1, status: "finish" },
      { crew_id: "crew_D", time_ms: 210000, finish_rank: 3, status: "finish" }
    ]);

    expect(sources.get("1.P")?.crew_id).toBe("crew_C");
    expect(sources.get("2.P")?.crew_id).toBe("crew_A");
    expect(sources.get("3.P")?.crew_id).toBe("crew_D");
  });

  it("stays a total order when the finish_rank column is only partly filled", () => {
    /**
     * 比較器の推移性。着順を「両方の行が持つときだけ」比較すると循環する:
     *   A(公式1着・300000) < B(公式2着・100000)   ← 着順で比較
     *   B(100000)          < C(着順なし・200000)  ← タイムで比較
     *   C(200000)          < A(300000)           ← タイムで比較 → A<B<C<A の循環
     * 循環した比較器に渡すと Array.sort の結果は入力順に依存し、
     * 「誰が進出するか」がスプレッドシートの行順で変わってしまう。
     * 着順なしを「未着順＝最後」として扱えば全順序になり、結果は A,B,C で安定する。
     */
    const A: Result = { crew_id: "A", time_ms: 300000, finish_rank: 1, status: "finish" };
    const B: Result = { crew_id: "B", time_ms: 100000, finish_rank: 2, status: "finish" };
    const C: Result = { crew_id: "C", time_ms: 200000, status: "finish" };
    const permutations: Result[][] = [
      [A, B, C],
      [A, C, B],
      [B, A, C],
      [B, C, A],
      [C, A, B],
      [C, B, A]
    ];

    for (const rows of permutations) {
      const got = sortRows(rows).map((row) => row.crew_id);
      expect(`${rows.map((r) => r.crew_id).join("")}: ${got.join(",")}`).toBe(`${rows.map((r) => r.crew_id).join("")}: A,B,C`);
    }
  });

  it("orders a cross-race tail identifier by the clock, not by finish rank", () => {
    /**
     * `N.HT` は組跨ぎのタイム拾い上げ（§5.1.1 の⚠️）。resolveIdentifier も
     * buildSourcesFromHeatResults と同じ順序で解決しなければ、2つの公開APIが
     * 別々の艇を決勝に送り込む。
     * タイム順: h2_2nd(215000) → h2_3rd(225000) → h1_2nd(230000)
     * 着順優先だと 2着どうし(h2_2nd, h1_2nd)が3着より前に来て 2.HT=h1_2nd になる。
     */
    const tail: Result[] = [
      { crew_id: "h2_2nd", time_ms: 215000, finish_rank: 2, status: "finish" },
      { crew_id: "h2_3rd", time_ms: 225000, finish_rank: 3, status: "finish" },
      { crew_id: "h1_2nd", time_ms: 230000, finish_rank: 2, status: "finish" }
    ];
    const pool = new Map([["HT", tail]]);

    expect(resolveIdentifier("1.HT", pool)?.crew_id).toBe("h2_2nd");
    expect(resolveIdentifier("2.HT", pool)?.crew_id).toBe("h2_3rd");
    expect(resolveIdentifier("3.HT", pool)?.crew_id).toBe("h1_2nd");
  });

  it("resolves an identifier by the official rank", () => {
    // resolveIdentifier も同じ並べ替えを使う（§5.1 step4）。
    const rows: Result[] = [
      { crew_id: "crew_A", lane: 1, time_ms: 200000, finish_rank: 2, status: "finish" },
      { crew_id: "crew_C", lane: 2, time_ms: 200100, finish_rank: 1, status: "finish" }
    ];

    expect(resolveIdentifier("1.1.H", new Map([["H", rows]]))?.crew_id).toBe("crew_C");
    expect(resolveIdentifier("2.1.H", new Map([["H", rows]]))?.crew_id).toBe("crew_A");
  });
});
