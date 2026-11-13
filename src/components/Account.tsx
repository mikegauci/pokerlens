"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { HandAnalysis, VillainProfile } from "@/lib/poker/analyze";
import { SavedHand, supabase } from "@/lib/supabase";
import { track } from "@/lib/track";

export function useUser(): User | null {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return user;
}

export function AccountButton({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  if (!supabase) return null;
  if (!user) {
    return (
      <button onClick={onSignIn} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-panel-2">
        Sign in
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="hidden max-w-[180px] truncate text-muted md:inline">{user.email}</span>
      <button onClick={() => supabase!.auth.signOut()} className="rounded-lg border border-line px-3 py-1.5 hover:bg-panel-2">
        Sign out
      </button>
    </div>
  );
}

export function AuthDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = mode === "signin" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (res.error) {
      setError(res.error.message);
    } else if (res.data.session) {
      track("signed_in", { method: mode });
      onClose();
    } else {
      setNotice("Check your inbox and confirm your email, then sign in here.");
      setMode("signin");
    }
  };

  const field = "mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="auth-title" className="w-full max-w-sm rounded-xl border border-line bg-panel p-5" onClick={(e) => e.stopPropagation()}>
        <h2 id="auth-title" className="text-lg font-semibold">
          {mode === "signin" ? "Sign in" : "Create an account"}
        </h2>
        <p className="mt-1 text-sm text-muted">Save reviewed hands and see which mistakes keep coming back.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-sm">
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </label>
          <label className="block text-sm">
            Password
            <input type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            {mode === "signup" && <span className="mt-1 block text-xs text-muted">At least 8 characters.</span>}
          </label>
          {error && (
            <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
              {notice}
            </p>
          )}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300 disabled:opacity-50">
            {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <div className="mt-4 flex justify-between text-sm">
          <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-accent hover:underline">
            {mode === "signin" ? "Create an account" : "I already have an account"}
          </button>
          <button onClick={onClose} className="text-muted hover:text-ink">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function SaveButton({
  user,
  analysis,
  handText,
  profile,
  overrides,
  onNeedAuth,
}: {
  user: User | null;
  analysis: HandAnalysis;
  handText: string;
  profile: VillainProfile;
  overrides: Record<string, string>;
  onNeedAuth: () => void;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  if (!supabase) return null;

  const save = async () => {
    if (!user) return onNeedAuth();
    setState("saving");
    const { summary, decisions } = analysis;
    const flags = decisions
      .filter((d) => d.verdict === "mistake" || d.verdict === "inaccuracy")
      .map((d) => ({ street: d.street, title: d.title, verdict: d.verdict, evLossBb: d.evLossBb ? Math.round(d.evLossBb * 10) / 10 : undefined }));
    const { error } = await supabase!.from("hands").insert({
      title: `${summary.heroClass} in ${summary.heroPosition}`,
      hand_text: handText,
      hero_class: summary.heroClass,
      hero_position: summary.heroPosition,
      net_bb: Math.round(summary.netBb * 10) / 10,
      ev_loss_bb: Math.round(summary.evLossBb * 10) / 10,
      mistakes: summary.counts.mistake,
      inaccuracies: summary.counts.inaccuracy,
      flags,
      profile,
      range_overrides: overrides,
    });
    setState(error ? "error" : "saved");
    if (!error) track("hand_saved", { mistakes: summary.counts.mistake, inaccuracies: summary.counts.inaccuracy });
  };

  return (
    <button
      onClick={save}
      disabled={state === "saving" || state === "saved"}
      className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-panel-2 disabled:opacity-60"
      title={user ? undefined : "Sign in to save hands"}
    >
      {state === "saved" ? "Saved ✓" : state === "saving" ? "Saving…" : state === "error" ? "Could not save, retry" : "Save hand"}
    </button>
  );
}

export function SavedHands({ user, onOpen }: { user: User | null; onOpen: (h: SavedHand) => void }) {
  const [hands, setHands] = useState<SavedHand[] | null>(null);
  const [error, setError] = useState(false);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!supabase || !user) return;
    let cancelled = false;
    supabase
      .from("hands")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (cancelled) return;
        setError(Boolean(error));
        setHands((data as SavedHand[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [user, version]);

  if (!supabase || !user) return null;

  const remove = async (id: string) => {
    if (!window.confirm("Delete this saved hand? This cannot be undone.")) return;
    await supabase!.from("hands").delete().eq("id", id);
    setVersion((v) => v + 1);
  };

  const list = hands ?? [];
  const evLost = list.reduce((s, h) => s + Number(h.ev_loss_bb), 0);
  const leakCounts = new Map<string, number>();
  for (const h of list) for (const f of h.flags ?? []) leakCounts.set(f.title, (leakCounts.get(f.title) ?? 0) + 1);
  const topLeaks = [...leakCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <section className="mt-12" aria-label="Your saved hands">
      <h2 className="text-sm font-medium uppercase tracking-wider text-muted">Your saved hands</h2>
      {error && <p className="mt-2 text-sm text-rose-300">Could not load your hands. Refresh to try again.</p>}
      {hands === null ? (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nothing saved yet. Review a hand and press “Save hand” to start tracking your leaks.</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-panel p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted">Hands reviewed</div>
              <div className="tabular text-xl font-semibold">{list.length}</div>
            </div>
            <div className="rounded-xl border border-line bg-panel p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted">EV lost (quantified)</div>
              <div className="tabular text-xl font-semibold text-rose-300">{Math.round(evLost * 10) / 10}bb</div>
            </div>
            <div className="rounded-xl border border-line bg-panel p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted">Recurring leaks</div>
              {topLeaks.length ? (
                <ul className="mt-1 text-sm">
                  {topLeaks.map(([title, n]) => (
                    <li key={title} className="flex justify-between gap-2">
                      <span className="truncate">{title}</span>
                      <span className="tabular text-muted">×{n}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted">None flagged</div>
              )}
            </div>
          </div>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-panel">
            {list.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <button onClick={() => onOpen(h)} className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left hover:text-accent">
                  <span className="font-medium">{h.title}</span>
                  <span className={`tabular ${Number(h.net_bb) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {Number(h.net_bb) >= 0 ? "+" : ""}
                    {Number(h.net_bb)}bb
                  </span>
                  {h.mistakes > 0 && <span className="rounded-full border border-rose-400/30 bg-rose-400/15 px-2 text-[11px] text-rose-300">{h.mistakes} mistake{h.mistakes > 1 ? "s" : ""}</span>}
                  {h.inaccuracies > 0 && <span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-2 text-[11px] text-amber-300">{h.inaccuracies} inaccurac{h.inaccuracies > 1 ? "ies" : "y"}</span>}
                  <span className="text-xs text-muted">{new Date(h.created_at).toLocaleDateString()}</span>
                </button>
                <button onClick={() => remove(h.id)} aria-label={`Delete ${h.title}`} className="rounded-md px-2 py-1 text-muted hover:bg-panel-2 hover:text-rose-300">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
