/**
 * HTTP Basic auth check for the metrics page. Pure, so the proxy and the page share it and tests can cover it.
 * Any user name is accepted; only the password, `METRICS_PASSWORD`, is checked.
 */

/** Compares two strings in time that depends only on their lengths, not on where they first differ. */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** True when `header` is a Basic credential whose password matches. An unset or empty password never matches. */
export function isAuthorized(header: string | null | undefined, password: string | undefined): boolean {
  if (!password || !header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  return safeEqual(decoded.slice(colon + 1), password);
}
