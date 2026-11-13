import { useState } from "react";
import { parseCards } from "@/lib/poker/cards";
import { glossaryVisuals, type GlossaryFrame, type GlossaryVisualId } from "@/lib/poker/glossary-visuals";
import { GRID } from "@/lib/poker/ranges";
import { Cards } from "./PlayingCard";

const rangeExcerpt = GRID.slice(0, 4).flatMap((row) => row.slice(0, 4));
const toneClass = {
  mint: "text-accent",
  amber: "text-amber-200",
  sky: "text-sky-200",
  muted: "text-muted",
};

export function GlossaryVisual({ visual, term }: { visual: GlossaryVisualId; term: string }) {
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState(0);
  const frames = glossaryVisuals[visual];

  return (
    <details className="group/visual mt-3" onToggle={(event) => {
      const open = event.currentTarget.open;
      setExpanded(open);
      if (!open) setStep(0);
    }}>
      <summary aria-label={`Visual example for ${term}`} className="cursor-pointer list-none rounded-lg [&::-webkit-details-marker]:hidden">
        <span className="block group-open/visual:hidden">
          <Frame frame={frames[0]} />
        </span>
        <span className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-accent">
          <span aria-hidden="true" className="text-[10px] group-open/visual:hidden">▶</span>
          <span className="group-open/visual:hidden">Open visual example</span>
          <span className="hidden group-open/visual:inline">Close visual example</span>
        </span>
      </summary>
      {expanded && (
        <div className="mt-2 rounded-lg border border-line bg-bg p-2.5">
          <div aria-live="polite" aria-atomic="true">
            <Frame key={step} frame={frames[step]} animate />
            <p className="mt-2 text-xs leading-relaxed text-muted">{frames[step].caption}</p>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="tabular text-xs text-muted">Step {step + 1} of {frames.length}</span>
            <button type="button" onClick={() => setStep((current) => (current + 1) % frames.length)}
              className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink hover:border-accent/50">
              {step === frames.length - 1 ? "Replay example" : "Next step →"}
            </button>
          </div>
        </div>
      )}
    </details>
  );
}

function Frame({ frame, animate = false }: { frame: GlossaryFrame; animate?: boolean }) {
  return (
    <span className={`sample-felt flex min-h-24 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-accent/15 px-2.5 py-2 ${animate ? "panel-enter" : ""}`}>
      {frame.items.map((item) => (
        <span key={item.label} className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-medium leading-tight text-emerald-50/85">{item.label}</span>
          {item.kind === "cards" && <Cards cards={parseCards(item.cards)} size="sm" deal={animate} />}
          {item.kind === "chips" && (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-200">
              <span aria-hidden="true" className="inline-block size-3.5 shrink-0 rounded-full border-[3px] border-dashed border-amber-200/90 bg-amber-400/25 shadow-[0_2px_0_#8a622d]" />
              {item.amount}
            </span>
          )}
          {item.kind === "metric" && <span className={`tabular text-sm font-semibold ${toneClass[item.tone]}`}>{item.value}</span>}
          {item.kind === "grid" && (
            <span role="img" aria-label={`Highlighted hands: ${item.selected.join(", ")}`} className="grid grid-cols-4 gap-px">
              {rangeExcerpt.map((hand) => (
                <span key={hand} aria-hidden="true" className={`rounded-sm px-0.5 text-center font-mono text-[9px] leading-3 ${item.selected.includes(hand) ? "bg-accent font-semibold text-emerald-950" : "bg-bg/65 text-muted"}`}>
                  {hand}
                </span>
              ))}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
