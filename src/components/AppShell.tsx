"use client";

import Image from "next/image";
import Link from "next/link";

export function AppShell({ children, onHome, reviewing = false, learning = false, account, links }: {
  children: React.ReactNode;
  onHome?: () => void;
  learning?: boolean;
  reviewing?: boolean;
  account?: React.ReactNode;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-panel focus:px-3 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto grid max-w-7xl grid-cols-[auto_minmax(0,1fr)] items-center gap-x-1.5 gap-y-2 px-2.5 py-2.5 sm:grid-cols-[auto_1fr_auto] sm:gap-x-4 sm:px-6">
          <Link href="/" aria-label="PokerLens home" onNavigate={onHome && ((event) => {
            event.preventDefault();
            onHome();
          })} className="flex w-fit shrink-0 items-center gap-2 rounded-md">
            <Image src="/pokerlens-mark.png" alt="" width={38} height={38} className="size-8 shrink-0 sm:size-[38px]" unoptimized priority />
            <span className="font-semibold tracking-tight max-[439px]:sr-only sm:text-lg">Poker<span className="text-accent">Lens</span></span>
          </Link>
          <nav aria-label={learning ? "Learn sections" : "Workspace"} className="order-last col-span-2 flex flex-wrap items-center gap-1 border-t border-line pt-1.5 sm:order-none sm:col-span-1 sm:border-0 sm:pt-0">
            {links.map((link) => <Link key={link.href} href={link.href} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-panel-2 hover:text-ink sm:text-sm">{link.label}</Link>)}
          </nav>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-1 sm:gap-2">
            <Link href="/solver" className="rounded-lg px-1.5 py-1.5 text-sm font-medium text-accent hover:bg-panel-2 sm:px-2">Solver</Link>
            <Link href="/train" className="rounded-lg px-1.5 py-1.5 text-sm font-medium text-accent hover:bg-panel-2 sm:px-2">Train</Link>
            <Link href="/pushfold" className="rounded-lg px-1.5 py-1.5 text-sm font-medium text-accent hover:bg-panel-2 sm:px-2">Push/fold</Link>
            {learning ? (
              <Link href="/" className="rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-panel-2">Review hands</Link>
            ) : (
              <Link href="/learn" className="rounded-lg px-1.5 py-1.5 text-sm font-medium text-accent hover:bg-panel-2 sm:px-2">Learn</Link>
            )}
            {reviewing && (onHome ? (
              <button onClick={onHome} className="rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-panel-2">New hand</button>
            ) : (
              <Link href="/" className="rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-panel-2">New hand</Link>
            ))}
            {account}
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="jump-target">{children}</main>
    </div>
  );
}
