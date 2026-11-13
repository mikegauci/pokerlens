import type { Metadata } from "next";
import { SessionReport } from "@/components/SessionReport";

export const metadata: Metadata = {
  title: "Session Leak Report | PokerLens",
  description: "Import a PokerStars session and see EV lost by spot type, the biggest mistakes, and VPIP, PFR and 3-bet with their sample sizes.",
};

export default function SessionPage() {
  return <SessionReport />;
}
