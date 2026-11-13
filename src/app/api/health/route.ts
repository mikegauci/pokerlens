import { connection } from "next/server";
import { DEPLOY_ENV, RELEASE } from "@/lib/release";

/**
 * Health check for uptime monitoring: always 200 while the app can serve requests, with the release
 * and whether the optional services are configured. It reports configuration only, never secrets.
 */
export async function GET() {
  await connection();
  return Response.json(
    {
      status: "ok",
      release: RELEASE,
      environment: DEPLOY_ENV,
      time: new Date().toISOString(),
      services: {
        database: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
        serverReads: Boolean(process.env.SUPABASE_SECRET_KEY),
        coach: Boolean(process.env.OPENAI_API_KEY),
        metrics: Boolean(process.env.METRICS_PASSWORD),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
