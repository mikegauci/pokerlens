import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { SolverLab } from "@/components/SolverLab";
import { SPOT_PRESETS } from "@/lib/poker/solver-spots";
import { metadata, solverSections } from "../page";

export { metadata };

export function generateStaticParams() {
  return SPOT_PRESETS.map(({ id }) => ({ spotId: id }));
}

async function Spot({ params }: Pick<PageProps<"/solver/[spotId]">, "params">) {
  const { spotId } = await params;
  if (!SPOT_PRESETS.some(({ id }) => id === spotId)) notFound();
  return <SolverLab key={spotId} initialPreset={spotId} />;
}

export default function SolverSpotPage({ params }: PageProps<"/solver/[spotId]">) {
  return (
    <AppShell links={solverSections}>
      <Suspense>
        <Spot params={params} />
      </Suspense>
    </AppShell>
  );
}
