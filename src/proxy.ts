import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/metrics-auth";

/**
 * Puts the metrics page behind HTTP Basic auth. The page checks the same credential again before
 * reading any data, so this is the browser prompt, not the only guard. With no METRICS_PASSWORD
 * set the request passes through and the page explains that metrics are switched off.
 */
export function proxy(request: NextRequest) {
  const password = process.env.METRICS_PASSWORD;
  if (!password || isAuthorized(request.headers.get("authorization"), password)) return NextResponse.next();
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="PokerLens metrics", charset="UTF-8"', "Cache-Control": "no-store" },
  });
}

export const config = {
  matcher: "/metrics/:path*",
};
