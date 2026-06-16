import { withContext } from "./context.js";
import { enqueue, flush, initQueue, shutdownQueue } from "./queue.js";
import { wrapAnthropic } from "./proxy/anthropic.js";
import { wrapOpenAI } from "./proxy/openai.js";
import { wrapVercel, type WrappableVercelAI } from "./proxy/vercel.js";
import type { CostContext, CostEvent, LLMargusConfig } from "./types.js";

const DEFAULTS = {
  ingestUrl: "https://llmargus.io/api/ingest",
  flushIntervalMs: 2000,
  maxBatchSize: 50,
} as const;

class LLMargus {
  // ─── init ──────────────────────────────────────────────────────────────────

  init(config: LLMargusConfig): void {
    initQueue({
      apiKey: config.apiKey,
      ingestUrl: config.ingestUrl ?? DEFAULTS.ingestUrl,
      flushIntervalMs: config.flushIntervalMs ?? DEFAULTS.flushIntervalMs,
      maxBatchSize: config.maxBatchSize ?? DEFAULTS.maxBatchSize,
    });
  }

  // ─── wrap ──────────────────────────────────────────────────────────────────

  // Generic T so the caller keeps the original client type.
  //   const openai = llmargus.wrap(new OpenAI())  → still typed as OpenAI
  wrap<T>(client: T, defaults?: CostContext): T {
    if (isOpenAIClient(client)) {
      return wrapOpenAI(client, defaults) as T;
    }
    if (isAnthropicClient(client)) {
      return wrapAnthropic(client, defaults) as T;
    }
    throw new Error(
      "[llmargus] unsupported client. Supported: OpenAI, Anthropic. " +
        "For other providers use llmargus.track() directly.",
    );
  }

  // ─── wrapVercel ───────────────────────────────────────────────────────────

  // Wraps Vercel AI SDK's generateText / streamText functions with cost tracking.
  //   const { generateText, streamText } = llmargus.wrapVercel(ai, { feature: "chat" })
  wrapVercel<T extends WrappableVercelAI>(ai: T, defaults?: CostContext): T {
    return wrapVercel(ai, defaults);
  }

  // ─── withContext ───────────────────────────────────────────────────────────

  withContext<T>(ctx: CostContext, fn: () => T): T {
    return withContext(ctx, fn);
  }

  // ─── track ─────────────────────────────────────────────────────────────────

  // Manual escape hatch — push a fully-formed event straight into the queue.
  // Use this for providers the SDK doesn't wrap yet, or raw fetch() calls.
  track(event: CostEvent): void {
    enqueue(event);
  }

  // ─── flush / shutdown ──────────────────────────────────────────────────────

  // Drain the queue immediately. Useful in tests and short-lived scripts where
  // you can't rely on the beforeExit handler to fire in time.
  flush(): Promise<void> {
    return flush();
  }

  shutdown(): void {
    shutdownQueue();
  }
}

// ─── provider detection ───────────────────────────────────────────────────────

// Duck-type check — avoids importing the OpenAI class (it's a peer dep).
// We look for the shape of the client rather than instanceof.
function isOpenAIClient(client: unknown): client is import("openai").default {
  return (
    typeof client === "object" &&
    client !== null &&
    "chat" in client &&
    typeof (client as Record<string, unknown>)["chat"] === "object"
  );
}

function isAnthropicClient(client: unknown): client is import("@anthropic-ai/sdk").default {
  return (
    typeof client === "object" &&
    client !== null &&
    "messages" in client &&
    typeof (client as Record<string, unknown>)["messages"] === "object"
  );
}

// ─── singleton ────────────────────────────────────────────────────────────────

// One instance for the whole process — init() is called once at startup.
export const llmargus = new LLMargus();
