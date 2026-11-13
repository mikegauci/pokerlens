import { notFound } from "next/navigation";
import Review from "@/components/Review";
import { SAMPLES } from "@/lib/poker/samples";

export function generateStaticParams() {
  return SAMPLES.map(({ id }) => ({ sampleId: id }));
}

export default async function SamplePage({ params }: PageProps<"/samples/[sampleId]">) {
  const { sampleId } = await params;
  const sample = SAMPLES.find(({ id }) => id === sampleId);
  if (!sample) notFound();
  return <Review key={sample.id} initialSample={sample} />;
}
