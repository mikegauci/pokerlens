import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SolverLab } from "@/components/SolverLab";

export const metadata: Metadata = {
  title: "River Solver | PokerLens",
  description: "Solve a heads-up river spot for its Nash equilibrium: mixed strategies per hand, bluff-to-value ratios, minimum defence frequency, and what a leak is worth.",
};

export const solverSections = [
  { href: "#setup", label: "The spot" },
  { href: "#strategy", label: "Strategy" },
  { href: "#exploit", label: "Exploit" },
];

export default function SolverPage() {
  return (
    <AppShell links={solverSections}>
      <SolverLab />
    </AppShell>
  );
}
