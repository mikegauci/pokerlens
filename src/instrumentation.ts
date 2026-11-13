import type { Instrumentation } from "next";

/** Server errors from rendering, route handlers, server actions and the proxy. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportServerError } = await import("./lib/report-error-server");
  await reportServerError(err, { kind: context.routeType, path: request.path });
};
