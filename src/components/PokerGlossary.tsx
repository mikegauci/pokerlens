"use client";

import { useState } from "react";
import { glossary } from "@/lib/poker/learn";
import { GlossaryVisual } from "./GlossaryVisual";

export function PokerGlossary() {
  const [query, setQuery] = useState("");
  const tokens = query.toLowerCase().trim().split(/\s+/);
  const entries = glossary.filter(({ term, aliases }) => {
    const keywords = `${term} ${aliases}`.toLowerCase();
    return tokens.every((token) => keywords.includes(token));
  });

  return (
    <>
      <div className="mt-4 max-w-md">
        <label htmlFor="glossary-search" className="text-sm font-medium">Search poker terms</label>
        <input id="glossary-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Try EV, Nash, or 3-bet"
          className="mt-1.5 block w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm placeholder:text-muted" />
      </div>
      <p className="mt-3 text-xs text-muted" role="status">{entries.length ? `${entries.length} ${entries.length === 1 ? "term" : "terms"}` : "No matching terms. Try a shorter search."}</p>
      <dl className="mt-3 grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(({ term, definition, visual }) => (
          <div key={visual} className="rounded-xl border border-line bg-panel p-4">
            <dt className="font-semibold text-sky-200">{term}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted">{definition}</dd>
            <dd><GlossaryVisual visual={visual} term={term} /></dd>
          </div>
        ))}
      </dl>
    </>
  );
}
