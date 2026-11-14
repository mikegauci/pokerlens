"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/track";
import { TOUR_EVENT, TOUR_STEPS, stepFromSearch, stepHref } from "@/lib/tour";

/** Starts the tour at step 1 from anywhere, without a page load. */
export function startTour() {
  track("tour_started");
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: 1 }));
}

/** How long to wait for a step's element, which may render after data loads. */
const FIND_TIMEOUT_MS = 4000;
/** Gap between the sticky header and the highlighted element. */
const GAP = 16;
/**
 * A page may still be laying out after its element appears (the review focuses its title, animations
 * change heights), so the element is lined up again at these times unless the visitor has scrolled.
 */
const SETTLE_MS = [400, 900, 1600, 2500];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * The tour panel and the highlight around the step's element. Mounted by AppShell on every page; it
 * shows only while the URL has `?tour=N`. Leaving the tour removes the parameter, so nothing is kept.
 */
export function Tour() {
  const router = useRouter();
  const pathname = usePathname();
  // The step lives only in the URL, so there is no tour state to keep or clear.
  const index = stepFromSearch(useSearchParams().toString());
  /** What was found for one step on one page; stale results from an earlier step are ignored. */
  const [found, setFound] = useState<{ key: string; rect: Rect | null; missing: boolean }>({ key: "", rect: null, missing: false });
  const heading = useRef<HTMLHeadingElement>(null);
  /** True until the first step on this page has been lined up; a fresh page load jumps there without animating. */
  const firstOnPage = useRef(true);

  const go = useCallback(
    (next: number) => {
      const step = TOUR_STEPS[next];
      if (!step) return;
      track("tour_step_viewed", { step: step.id, number: next + 1 });
      if (step.path === pathname) router.replace(stepHref(next), { scroll: false });
      else router.push(stepHref(next));
    },
    [pathname, router],
  );

  // The home page's button starts the tour with an event, so it works without a page load.
  useEffect(() => {
    const onStart = (e: Event) => go((e as CustomEvent<number>).detail - 1);
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, [go]);

  const close = useCallback(
    (finished: boolean) => {
      if (index !== null) track(finished ? "tour_finished" : "tour_left", { step: TOUR_STEPS[index].id, number: index + 1 });
      router.replace(pathname, { scroll: false });
    },
    [index, pathname, router],
  );

  const step = index === null ? null : TOUR_STEPS[index];
  const onPage = step !== null && step.path === pathname;
  const key = `${index}:${pathname}`;
  const rect = found.key === key ? found.rect : null;
  const missing = found.key === key && found.missing;

  // Find the element, scroll it under the header, and keep the highlight on it while the page moves.
  useEffect(() => {
    if (!step || !onPage) return;
    let el: Element | null = null;
    let frame = 0;
    let observer: ResizeObserver | null = null;
    let settles: number[] = [];
    let userScrolled = false;
    const onUser = () => {
      userScrolled = true;
    };
    window.addEventListener("wheel", onUser, { passive: true });
    window.addEventListener("touchmove", onUser, { passive: true });
    const measure = () => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      setFound({ key, rect: { top: r.top, left: r.left, width: r.width, height: r.height }, missing: false });
    };
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const started = Date.now();
    const timer = window.setInterval(() => {
      el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el && Date.now() - started < FIND_TIMEOUT_MS) return;
      window.clearInterval(timer);
      if (!el) return setFound({ key, rect: null, missing: true });
      // Animate only when moving between steps on the same page. On a fresh load the page is still settling,
      // and a smooth scroll that is still running when the page changes height can end up in the wrong place.
      const animate = !firstOnPage.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      firstOnPage.current = false;
      const scrollToEl = (behavior: ScrollBehavior) => {
        if (!el) return;
        const header = document.querySelector("header")?.getBoundingClientRect().height ?? 64;
        window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - header - GAP), behavior });
      };
      scrollToEl(animate ? "smooth" : "auto");
      settles = SETTLE_MS.map((ms) => window.setTimeout(() => !userScrolled && scrollToEl("auto"), ms));
      measure();
      observer = new ResizeObserver(onMove);
      observer.observe(el);
      window.addEventListener("scroll", onMove, { passive: true });
      window.addEventListener("resize", onMove);
    }, 100);
    return () => {
      window.clearInterval(timer);
      settles.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("wheel", onUser);
      window.removeEventListener("touchmove", onUser);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
    };
  }, [step, onPage, key]);

  // Keyboard: Escape leaves, arrows move. Focus goes to the step title so screen readers announce it.
  useEffect(() => {
    if (index === null) return;
    heading.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === "Escape") close(false);
      else if (!typing && e.key === "ArrowRight" && index < TOUR_STEPS.length - 1) go(index + 1);
      else if (!typing && e.key === "ArrowLeft" && index > 0) go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, close, go]);

  if (!step || index === null) return null;
  const last = index === TOUR_STEPS.length - 1;
  const pad = 6;

  return (
    <>
      {rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-40 rounded-xl border-2 border-accent shadow-[0_0_0_9999px_rgba(3,7,18,0.55)] transition-all duration-200 motion-reduce:transition-none"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      )}
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        className="fixed inset-x-2 bottom-2 z-50 flex max-h-[44vh] flex-col rounded-xl border border-accent/50 bg-panel p-3 shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:max-h-[70vh] sm:w-[400px] sm:p-4"
      >
        <div className="flex shrink-0 items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Guided tour · {index + 1} of {TOUR_STEPS.length}
          </p>
          <button type="button" onClick={() => close(false)} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-panel-2 hover:text-ink">
            Skip tour <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="mt-2 h-1 shrink-0 overflow-hidden rounded-full bg-panel-2" aria-hidden="true">
          <div className="h-full rounded-full bg-accent" style={{ width: `${((index + 1) / TOUR_STEPS.length) * 100}%` }} />
        </div>
        <div className="mt-2 min-h-0 overflow-y-auto">
          <h2 id="tour-title" ref={heading} tabIndex={-1} className="text-base font-semibold outline-none sm:text-lg">{step.title}</h2>
          <p className="mt-1 text-sm leading-relaxed">{step.what}</p>
          {onPage && missing && <p className="mt-2 text-xs text-amber-200">This part of the page is not showing right now; scroll to find it.</p>}
          {!onPage && <p className="mt-2 text-xs text-muted">Loading the page…</p>}
        </div>
        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 border-t border-line pt-3">
          <button type="button" disabled={index === 0} onClick={() => go(index - 1)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-panel-2 disabled:opacity-35">
            Back
          </button>
          {last ? (
            <button type="button" onClick={() => close(true)} className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-300">
              Finish
            </button>
          ) : (
            <button type="button" onClick={() => go(index + 1)} className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-300">
              Next: {TOUR_STEPS[index + 1].page} <span aria-hidden="true">→</span>
            </button>
          )}
          <Link
            href={step.path}
            onClick={() => track("tour_left", { step: step.id, number: index + 1 })}
            className="ml-auto text-sm text-accent hover:underline"
          >
            Open {step.page.toLowerCase()} on its own
          </Link>
        </div>
      </div>
    </>
  );
}
