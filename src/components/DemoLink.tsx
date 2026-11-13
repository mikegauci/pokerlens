"use client";

import Link from "next/link";
import { track } from "@/lib/track";

/** A link out of the demo walkthroughs that records which hand and which page it opened. */
export function DemoLink({ href, hand, children, className }: { href: string; hand: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={className} onClick={() => track("demo_hand_opened", { hand, target: href.split("/")[1] || "home" })}>
      {children}
    </Link>
  );
}
