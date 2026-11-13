import OpenAI from "openai";
import { analyzeHand, VillainProfile } from "@/lib/poker/analyze";
import { HandParseError, parseHand } from "@/lib/poker/parser";
import { buildFacts, coachRequest, fallbackExplanation } from "@/lib/coach";

export const maxDuration = 60;

interface Body {
  handText?: string;
  profile?: VillainProfile;
  rangeOverrides?: Record<string, string>;
  messages?: { role: "user" | "assistant"; content: string }[];
}

const text = (s: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...headers } });

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return text("Invalid request.", 400);
  }
  const handText = (body.handText ?? "").slice(0, 20000);
  const profile: VillainProfile = body.profile && ["passive", "standard", "aggressive"].includes(body.profile) ? body.profile : "standard";
  const messages = (body.messages ?? []).slice(-8).map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: String(m.content).slice(0, 1500) }));

  // The analysis is recomputed on the server so the model only sees numbers we produced.
  let analysis;
  try {
    analysis = analyzeHand(parseHand(handText), { profile, rangeOverrides: body.rangeOverrides });
  } catch (e) {
    return text(e instanceof HandParseError ? e.message : "Could not analyse that hand.", 400);
  }

  if (!process.env.OPENAI_API_KEY) {
    return text(fallbackExplanation(analysis), 200, { "X-Coach-Mode": "fallback" });
  }

  const client = new OpenAI();
  const facts = buildFacts(analysis, profile);
  try {
    const stream = await client.responses.create({ ...coachRequest(facts, messages), stream: true });
    const encoder = new TextEncoder();
    const out = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "response.output_text.delta") controller.enqueue(encoder.encode(event.delta));
          }
        } catch {
          controller.enqueue(encoder.encode("\n\n_The coach was interrupted. Try again._"));
        }
        controller.close();
      },
    });
    return text(out as unknown as string, 200, { "X-Coach-Mode": "ai", "Cache-Control": "no-store" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("coach error", msg);
    return text(`${fallbackExplanation(analysis)}\n\n_The AI coach is unavailable right now (${msg.slice(0, 120)})._`, 200, { "X-Coach-Mode": "fallback" });
  }
}
