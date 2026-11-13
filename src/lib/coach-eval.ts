/**
 * Checks that a coach reply only states numbers that appear in the fact sheet it was given.
 *
 * The coach is an LLM, so this cannot be proved by construction; it is checked by reading the reply.
 * Both texts are reduced to a list of quantities (value plus unit). A reply quantity passes when the
 * fact sheet has the same value with a compatible unit. A number with a unit may be rounded to fewer
 * decimals ("about 14bb" for 14.2bb); a bare number must match exactly. Anything else, including a number the coach derived itself such
 * as the gap between equity and price, is reported.
 *
 * Tokens that contain digits but are not quantities are removed first: cards (7h), hand classes and
 * range notation (99, 76s, A5s-A2s, 22+), "3-bet", "6-max", "7-high", plural ranks (9s), a rank with
 * any kicker (6x, but not "3x open"), ordinals and Markdown list markers.
 */

export type Unit = "%" | "bb" | "x" | "combos" | "" | "ratio" | "#";

export interface Quantity {
  /** The text as written, for error messages. */
  raw: string;
  /** Absolute value. Signs are not compared: "+14.2bb" and "lost 14.2bb" state the same amount. */
  value: number;
  /** Decimal places as written, used for rounding. */
  decimals: number;
  unit: Unit;
}

const RANK = "[2-9TJQKA]";
const SUIT = "[hdcs]";
const UNIT_WORDS: [RegExp, Unit][] = [
  [/^\s*(?:%|percent\b|per cent\b)/i, "%"],
  [/^\s*(?:bb\b|big blinds?\b)/i, "bb"],
  [/^x\b/i, "x"],
  [/^\s*(?:weighted\s+)?combos?\b/i, "combos"],
];

/** Replaces tokens that contain digits but are not quantities with a space. */
function stripNonQuantities(text: string): string {
  const unitAhead = String.raw`(?!\s*(?:%|bb\b|big blinds?\b|x\b|percent\b|combos?\b))`;
  return (
    text
      // Markdown numbered list markers at the start of a line.
      .replace(/^(\s*)\d+[.)]\s/gm, "$1 ")
      // Cards, alone or in a board: 7h, Td.
      .replace(new RegExp(String.raw`\b${RANK}${SUIT}\b`, "g"), " ")
      // Range notation with suits or a plus: 76s, K8o+, A5s-A2s, 22+, 99-22, K2s:0.96.
      .replace(new RegExp(String.raw`\b${RANK}${RANK}[so]?(?:\+|-${RANK}${RANK}[so]?)(?::\d*\.?\d+)?`, "g"), " ")
      .replace(new RegExp(String.raw`\b${RANK}${RANK}[so](?::\d*\.?\d+)?\b`, "g"), " ")
      // A bare pair such as 99 or 22, unless it is followed by a unit and so is an amount.
      .replace(new RegExp(String.raw`(?<![\d.])([2-9])\1\b(?!\.\d)${unitAhead}`, "g"), " ")
      // Poker vocabulary: 3-bet, 4-bettor, 6-max, 9-handed, 3-way, 7-high, 9s (plural rank).
      .replace(/\b\d+-?(?:bet\w*|max|handed|way)\b/gi, " ")
      .replace(/\b[2-9T]-high\b/gi, " ")
      // A rank with any kicker, as in "Kx and 6x", unless it is a sizing such as "3x open".
      .replace(/\b[2-9]x\b(?!\s*(?:open|raise|re-?raise|pot|bet|size|sizing|the))/gi, " ")
      .replace(/\b[2-9]s\b/g, " ")
      // Ordinals: 2nd pair, 4th street.
      .replace(/\b\d+(?:st|nd|rd|th)\b/gi, " ")
  );
}

/** Lists the quantities stated in a text. */
export function extractQuantities(text: string): Quantity[] {
  const s = stripNonQuantities(text);
  const out: Quantity[] = [];
  // A decision reference (#2), a ratio (2:1, 3-to-1), or a number with thousands separators or decimals.
  const re = /#(\d+)|(\d+(?:\.\d+)?)\s*(?::|-to-)\s*(\d+(?:\.\d+)?)|(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)/g;
  for (let m; (m = re.exec(s)); ) {
    // Digits glued to letters on the left, such as "Seat3", are labels, not quantities.
    if (m.index > 0 && /[A-Za-z]/.test(s[m.index - 1])) continue;
    if (m[1] !== undefined) {
      out.push({ raw: m[0], value: Number(m[1]), decimals: 0, unit: "#" });
    } else if (m[2] !== undefined) {
      out.push({ raw: m[0], value: Number(m[2]) / Number(m[3]), decimals: 6, unit: "ratio" });
    } else {
      const num = m[4].replace(/,/g, "");
      const decimals = num.includes(".") ? num.split(".")[1].length : 0;
      const rest = s.slice(m.index + m[4].length);
      const unit = UNIT_WORDS.find(([w]) => w.test(rest))?.[1] ?? "";
      out.push({ raw: m[4] + (unit === "combos" ? " combos" : unit), value: Number(num), decimals, unit });
    }
  }
  return out;
}

const roundTo = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/** Which fact-sheet units a reply unit may be matched against. */
const COMPATIBLE: Record<Unit, Unit[]> = {
  "%": ["%"],
  bb: ["bb"],
  x: ["bb"], // "a 2.5x open" is 2.5 big blinds.
  combos: ["combos"],
  "": ["", "%", "bb", "combos"], // A bare number in prose usually refers back to a stated one.
  ratio: ["ratio"],
  "#": ["#"],
};

function supported(q: Quantity, facts: Quantity[]): boolean {
  return facts.some((f) => {
    if (!COMPATIBLE[q.unit].includes(f.unit)) return false;
    if (q.unit === "ratio") return Math.abs(f.value - q.value) < 1e-6;
    // A bare number must match exactly: "9 outs" is not a rounded 9.1bb pot.
    if (q.unit === "") return f.value === q.value;
    // A number with a unit may round a stated one ("about 14bb" for 14.2bb), never add precision to it.
    return q.decimals <= f.decimals && roundTo(f.value, q.decimals) === q.value;
  });
}

export interface CheckResult {
  ok: boolean;
  /** Reply quantities with no match in the fact sheet. */
  unsupported: Quantity[];
  /** Every quantity found in the reply. */
  checked: Quantity[];
}

/** Checks a coach reply against the fact sheet it was given. */
export function checkReply(reply: string, factSheet: string): CheckResult {
  const facts = extractQuantities(factSheet);
  const checked = extractQuantities(reply);
  const unsupported = checked.filter((q) => !supported(q, facts));
  return { ok: unsupported.length === 0, unsupported, checked };
}
