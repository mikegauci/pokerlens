/// <reference lib="webworker" />
import { sessionSteps } from "@/lib/poker/session";

/** Runs a session analysis off the main thread so the page stays responsive. Messages carry a run id. */
self.onmessage = (event: MessageEvent<{ id: number; text: string }>) => {
  const { id, text } = event.data;
  try {
    const steps = sessionSteps(text);
    let step = steps.next();
    let last = 0;
    while (!step.done) {
      const now = Date.now();
      if (now - last > 50 || step.value.done === step.value.total) {
        self.postMessage({ id, type: "progress", ...step.value });
        last = now;
      }
      step = steps.next();
    }
    self.postMessage({ id, type: "done", outcome: step.value });
  } catch (e) {
    self.postMessage({ id, type: "error", message: e instanceof Error ? e.message : "Analysis failed." });
  }
};
