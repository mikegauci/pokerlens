import { ParsedHand } from "@/lib/poker/parser";
import { Snapshot } from "@/lib/poker/analyze";
import { Cards, PlayingCard } from "./PlayingCard";

const fmt = (x: number) => (Math.round(x * 10) / 10).toString();

export function TableView({ hand, snap, showdown }: { hand: ParsedHand; snap: Snapshot; showdown: boolean }) {
  const n = hand.players.length;
  const heroIdx = hand.players.findIndex((p) => p.isHero);
  const bb = hand.bb;
  const folded = new Set(snap.folded);
  // After the last action, show the full run-out (covers all-ins before the river).
  const board = showdown ? hand.board : snap.board;

  return (
    <div className="relative mx-auto mb-6 mt-3 aspect-[5/6] w-full max-w-[620px] sm:aspect-[16/10]">
      <div className="absolute inset-[9%_6%] rounded-[50%] border-[6px] border-emerald-950 bg-gradient-to-b from-emerald-800 to-emerald-900 shadow-[inset_0_0_60px_rgba(0,0,0,0.45)]" />
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        <div className="flex h-8 gap-1 sm:hidden">{board.length ? <Cards cards={board} size="sm" /> : <span className="self-center text-xs uppercase tracking-widest text-emerald-200/60">Preflop</span>}</div>
        <div className="hidden h-11 gap-1 sm:flex">
          {board.length ? <Cards cards={board} /> : <span className="self-center text-xs uppercase tracking-widest text-emerald-200/60">Preflop</span>}
        </div>
        <div className="tabular rounded-full bg-black/35 px-3 py-0.5 text-xs font-medium text-emerald-50">Pot {fmt(snap.pot / bb)}bb</div>
      </div>
      {hand.players.map((p, i) => {
        // Hero sits at the bottom; others go clockwise from there.
        const angle = Math.PI / 2 + ((i - heroIdx) / n) * 2 * Math.PI;
        const x = 50 + 40 * Math.cos(angle);
        const y = 50 + 41 * Math.sin(angle);
        const bx = 50 + 22 * Math.cos(angle);
        const by = 50 + 22 * Math.sin(angle);
        const out = folded.has(p.name);
        const acting = snap.player === p.name;
        const bet = snap.committed[p.name] ?? 0;
        const cards = p.isHero ? hand.heroCards : showdown ? hand.shown[p.name] : undefined;
        return (
          <div key={p.name}>
            <div className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 transition-opacity ${out ? "opacity-35" : ""}`} style={{ left: `${x}%`, top: `${y}%` }}>
              <div className="flex h-8 gap-0.5">
                {cards ? <Cards cards={cards} size="sm" /> : !out ? (<><PlayingCard card={null} size="sm" /><PlayingCard card={null} size="sm" /></>) : null}
              </div>
              <div className={`min-w-[68px] rounded-lg border px-1.5 py-1 sm:min-w-[84px] sm:px-2 text-center ${acting ? "border-amber-300 bg-panel-2" : p.isHero ? "border-emerald-400/60 bg-panel-2" : "border-line bg-panel"}`}>
                <div className="flex items-center justify-center gap-1 text-[11px] font-semibold">
                  <span className="rounded bg-emerald-400/15 px-1 text-[10px] text-accent">{p.position}</span>
                  <span className="max-w-[52px] truncate sm:max-w-[80px]">{p.isHero ? "Hero" : p.name}</span>
                </div>
                <div className="tabular text-[11px] text-muted">{fmt((snap.stacks[p.name] ?? p.stack) / bb)}bb</div>
              </div>
            </div>
            {bet > 0 && (
              <div className="tabular absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-950" style={{ left: `${bx}%`, top: `${by}%` }}>
                {fmt(bet / bb)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
