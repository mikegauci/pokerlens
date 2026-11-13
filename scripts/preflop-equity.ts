/**
 * Generates src/lib/poker/preflop-equity-data.ts: the exact all-in equity of every
 * starting-hand class against every other, by enumerating every five-card board with the
 * evaluator in src/lib/poker/evaluator.ts. Nothing is sampled.
 *
 * Boards that differ only by a relabelling of suits give the same class-versus-class counts,
 * so each suit-distinct board (134,459 of the 2,598,960) is evaluated once and weighted by
 * how many boards it stands for.
 *
 * Run (about ten minutes on four cores):
 *   npx rolldown scripts/preflop-equity.ts --platform node --file /tmp/preflop-equity.mjs
 *   for k in 0 1 2 3; do node /tmp/preflop-equity.mjs shard $k 4 /tmp & done; wait
 *   node /tmp/preflop-equity.mjs merge 4 /tmp
 */
import { readFileSync, writeFileSync } from "node:fs";
import { handClass } from "../src/lib/poker/cards";
import { evaluate } from "../src/lib/poker/evaluator";
import { ALL_CLASSES } from "../src/lib/poker/ranges";

const N = 169;
const CLASS_INDEX = new Map(ALL_CLASSES.map((c, i) => [c, i]));

const comboA: number[] = [];
const comboB: number[] = [];
const comboClass: number[] = [];
for (let a = 0; a < 52; a++) {
  for (let b = a + 1; b < 52; b++) {
    comboA.push(a);
    comboB.push(b);
    comboClass.push(CLASS_INDEX.get(handClass(a, b))!);
  }
}

const PERMS: number[][] = [];
for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++) {
  if (new Set([a, b, c, d]).size === 4) PERMS.push([a, b, c, d]);
}

/** Suit-distinct boards as [key, number of boards it stands for], in key order. */
function canonicalBoards(): [number, number][] {
  const counts = new Map<number, number>();
  const t = [0, 0, 0, 0, 0];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) for (let d = c + 1; d < 52; d++) for (let e = d + 1; e < 52; e++) {
    const board = [a, b, c, d, e];
    let best = Infinity;
    for (const p of PERMS) {
      for (let i = 0; i < 5; i++) t[i] = (board[i] & ~3) | p[board[i] & 3];
      t.sort((x, y) => x - y);
      const key = (((t[0] * 52 + t[1]) * 52 + t[2]) * 52 + t[3]) * 52 + t[4];
      if (key < best) best = key;
    }
    counts.set(best, (counts.get(best) ?? 0) + 1);
  }
  return [...counts.entries()].sort((x, y) => x[0] - y[0]);
}

function shard(k: number, n: number, dir: string) {
  const boards = canonicalBoards();
  const win = new Float64Array(N * N);
  const tie = new Float64Array(N * N);
  const cards = [0, 0, 0, 0, 0, 0, 0];
  const onBoard = new Uint8Array(52);
  const idx = new Int32Array(1326);
  const score = new Int32Array(1326);
  for (let bi = k; bi < boards.length; bi += n) {
    const [key, mult] = boards[bi];
    let rest = key;
    onBoard.fill(0);
    for (let i = 6; i >= 2; i--) {
      cards[i] = rest % 52;
      onBoard[cards[i]] = 1;
      rest = Math.floor(rest / 52);
    }
    let live = 0;
    for (let c = 0; c < 1326; c++) {
      if (onBoard[comboA[c]] || onBoard[comboB[c]]) continue;
      cards[0] = comboA[c];
      cards[1] = comboB[c];
      score[c] = evaluate(cards);
      idx[live++] = c;
    }
    const order = Array.from(idx.subarray(0, live)).sort((x, y) => score[y] - score[x]);
    for (let p = 0; p < live; p++) {
      const c1 = order[p];
      const a1 = comboA[c1];
      const b1 = comboB[c1];
      const s1 = score[c1];
      const row = comboClass[c1] * N;
      for (let q = p + 1; q < live; q++) {
        const c2 = order[q];
        const a2 = comboA[c2];
        const b2 = comboB[c2];
        if (a2 === a1 || a2 === b1 || b2 === a1 || b2 === b1) continue;
        const k2 = comboClass[c2];
        if (score[c2] === s1) {
          tie[row + k2] += mult;
          tie[k2 * N + comboClass[c1]] += mult;
        } else win[row + k2] += mult;
      }
    }
  }
  writeFileSync(`${dir}/preflop-equity-${k}.json`, JSON.stringify({ win: Array.from(win), tie: Array.from(tie) }));
}

function merge(n: number, dir: string) {
  const win = new Float64Array(N * N);
  const tie = new Float64Array(N * N);
  for (let k = 0; k < n; k++) {
    const part = JSON.parse(readFileSync(`${dir}/preflop-equity-${k}.json`, "utf8")) as { win: number[]; tie: number[] };
    for (let i = 0; i < N * N; i++) {
      win[i] += part.win[i];
      tie[i] += part.tie[i];
    }
  }
  const BOARDS = 1712304; // C(48, 5)
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      // The same pair of holdings is counted once from each side when both are in one class, never across classes.
      const total = win[i * N + j] + win[j * N + i] + tie[i * N + j];
      if (total % BOARDS !== 0 || total === 0) throw new Error(`Bad total for ${ALL_CLASSES[i]} v ${ALL_CLASSES[j]}: ${total}`);
      out.push(Math.round(((win[i * N + j] + tie[i * N + j] / 2) / total) * 1e6));
    }
  }
  const lines: string[] = [];
  for (let i = 0; i < out.length; i += 20) lines.push(out.slice(i, i + 20).join(","));
  writeFileSync(
    "src/lib/poker/preflop-equity-data.ts",
    `// Generated by scripts/preflop-equity.ts. Do not edit by hand.
// Exact preflop all-in equity (win plus half of ties) in millionths, for class i against class j with i < j,
// in the order of ALL_CLASSES in ranges.ts, row by row.
export const PREFLOP_EQUITY_MILLIONTHS: number[] = [
${lines.join(",\n")},
];
`,
  );
  console.log(`wrote ${out.length} matchups`);
}

const [mode, a, b, c] = process.argv.slice(2);
if (mode === "shard") shard(Number(a), Number(b), c);
else if (mode === "merge") merge(Number(a), b);
else throw new Error("usage: shard <k> <n> <dir> | merge <n> <dir>");
