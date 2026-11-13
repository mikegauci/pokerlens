"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";

/** Shown when a page fails to render. The error is reported once; the hand you pasted is never sent. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error && typeof error === "object" && "digest" in error ? String(error.digest) : null;
  useEffect(() => reportClientError(error, "boundary", digest), [error, digest]);
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong on this page</h1>
      <p className="mt-2 leading-relaxed text-muted">
        The error has been recorded{digest ? <> with reference <code className="font-mono text-ink">{digest}</code></> : null}. Trying again usually works; if it does not, start from the home page.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => retry()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300">Try again</button>
        <Link href="/" className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-panel-2">Home</Link>
      </div>
    </main>
  );
}
