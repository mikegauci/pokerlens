import { GRID } from "@/lib/poker/ranges";

/** 13x13 range grid. Cell opacity shows how much of that hand class is left in the range. */
export function RangeGrid({ weights, highlight }: { weights: Record<string, number>; highlight?: string }) {
  return (
    <div className="grid w-full max-w-[340px] grid-cols-13 gap-px overflow-hidden rounded-md bg-line text-[9px] leading-none sm:text-[10px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
      {GRID.flat().map((cls) => {
        const w = weights[cls] ?? 0;
        const isHero = cls === highlight;
        return (
          <div
            key={cls}
            title={`${cls}: ${Math.round(w * 100)}% of combos remain`}
            className={`relative flex aspect-square items-center justify-center bg-panel-2 ${isHero ? "outline outline-2 -outline-offset-2 outline-amber-300" : ""}`}
          >
            <span className="absolute inset-0 bg-emerald-500" style={{ opacity: w * 0.85 }} />
            <span className={`relative ${w > 0.45 ? "font-semibold text-emerald-950" : w > 0 ? "text-ink" : "text-muted/50"}`}>{cls}</span>
          </div>
        );
      })}
    </div>
  );
}
