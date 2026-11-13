"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";

/** Last resort when the root layout itself fails. It replaces the whole document, so it styles itself. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error && typeof error === "object" && "digest" in error ? String(error.digest) : null;
  useEffect(() => reportClientError(error, "global-boundary", digest), [error, digest]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#0b101a", color: "#edf3fc", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", padding: 16 }}>
        <title>Something went wrong | PokerLens</title>
        <main style={{ maxWidth: 520 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>PokerLens hit an error</h1>
          <p style={{ color: "#a2b0c5", lineHeight: 1.5 }}>
            It has been recorded{digest ? ` with reference ${digest}` : ""}. Trying again usually works.
          </p>
          <button type="button" onClick={() => retry()} style={{ background: "#63e6ba", color: "#052e1f", border: 0, borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
