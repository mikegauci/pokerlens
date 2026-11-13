/**
 * The release this build came from: the short git commit Vercel built, or "dev" locally.
 * NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA is inlined into browser code at build time; the server also has
 * VERCEL_GIT_COMMIT_SHA. Errors and the health check carry it, so a report points at one commit.
 */
export const RELEASE = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7);

/** Vercel's environment for this build: "production", "preview" or "development". */
export const DEPLOY_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || "development";
