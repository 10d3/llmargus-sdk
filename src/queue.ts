import { sendBatch } from "./transport.js";
import type { CostEvent, LLMargusConfig } from "./types.js";

const MAX_RETRIES = 3;

let queue: CostEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let config: Required<Pick<LLMargusConfig, "apiKey" | "ingestUrl" | "flushIntervalMs" | "maxBatchSize">> | null =
  null;

export function initQueue(cfg: typeof config): void {
  config = cfg;

  // Flush on a regular interval (background — non-blocking).
  timer = setInterval(() => {
    void flush();
  }, cfg!.flushIntervalMs);

  // Don't let the timer keep the process alive on its own.
  // This matters in scripts and serverless functions: without unref() the
  // process would hang waiting for the next interval tick even after all
  // real work is done.
  if (timer.unref) timer.unref();

  // Last-chance flush when the event loop drains (e.g. serverless wind-down).
  process.once("beforeExit", () => {
    void flush();
  });
}

export function enqueue(event: CostEvent): void {
  if (!config) return; // init() not called — drop silently
  queue.push(event);
  if (queue.length >= config.maxBatchSize) {
    void flush();
  }
}

// Exposed so callers can await a clean drain (e.g. in tests, or on shutdown).
export async function flush(): Promise<void> {
  if (!config || queue.length === 0) return;

  // Snapshot and clear immediately so new events that arrive during the
  // async send go into a fresh queue, not into the batch we're about to send.
  const batch = queue.splice(0);

  await sendWithRetry(batch, 0);
}

export function shutdownQueue(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function sendWithRetry(batch: CostEvent[], attempt: number): Promise<void> {
  try {
    await sendBatch(batch, { ingestUrl: config!.ingestUrl, apiKey: config!.apiKey });
  } catch {
    if (attempt < MAX_RETRIES - 1) {
      // Exponential backoff: 1s → 2s → 4s
      await sleep(1000 * 2 ** attempt);
      await sendWithRetry(batch, attempt + 1);
    }
    // Final attempt failed — drop silently. Never throw into the host app.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
