import { reportClientError } from "./lib/report-error";

// Errors that escape every handler: uncaught exceptions and rejected promises nobody awaited.
// Errors inside React rendering are caught by error.tsx and global-error.tsx, which report them too.
try {
  window.addEventListener("error", (event) => {
    // Failed image or script loads also fire "error" but carry no error object; skip them.
    if (event.error !== undefined || event.message) reportClientError(event.error ?? event.message, "window");
  });
  window.addEventListener("unhandledrejection", (event) => reportClientError(event.reason, "promise"));
} catch {
  // Never let monitoring break the page.
}
