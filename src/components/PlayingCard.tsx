import { Card, RANKS, rankOf, suitOf } from "@/lib/poker/cards";

const SYMBOL = ["♣", "♦", "♥", "♠"];
// Four-colour deck so suits read at a glance.
const COLOR = ["text-emerald-700", "text-sky-700", "text-rose-600", "text-zinc-900"];

export function PlayingCard({ card, size = "md" }: { card: Card | null; size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "h-8 w-6 text-xs" : size === "lg" ? "h-14 w-10 text-lg" : "h-11 w-8 text-sm";
  if (card === null) {
    return <span className={`${dims} inline-block rounded-md border border-emerald-900 bg-emerald-950/60`} aria-label="Unknown card" />;
  }
  const r = RANKS[rankOf(card)];
  const s = suitOf(card);
  return (
    <span
      className={`${dims} ${COLOR[s]} inline-flex flex-col items-center justify-center rounded-md bg-zinc-50 font-bold leading-none shadow-sm`}
      aria-label={`${r} of ${["clubs", "diamonds", "hearts", "spades"][s]}`}
    >
      <span>{r === "T" ? "10" : r}</span>
      <span className="-mt-0.5">{SYMBOL[s]}</span>
    </span>
  );
}

export function Cards({ cards, size }: { cards: Card[]; size?: "sm" | "md" | "lg" }) {
  return (
    <span className="inline-flex gap-1">
      {cards.map((c) => (
        <PlayingCard key={c} card={c} size={size} />
      ))}
    </span>
  );
}
