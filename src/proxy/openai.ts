import type OpenAI from "openai";

import { enqueue } from "../queue.js";
import type { CostContext } from "../types.js";
import { resolveTags, stripLlmargus } from "./utils.js";

// Wraps an OpenAI client with instrumentation. The returned client is a
// transparent Proxy — every method works as normal; only
// chat.completions.create is intercepted to record cost/latency data.
export function wrapOpenAI(client: OpenAI, defaults?: CostContext): OpenAI {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "chat") return Reflect.get(target, prop, receiver);
      return wrapChat(target.chat, defaults);
    },
  });
}

// ─── proxy chain: client → chat → completions → create ───────────────────────

function wrapChat(chat: OpenAI["chat"], defaults?: CostContext): OpenAI["chat"] {
  return new Proxy(chat, {
    get(target, prop, receiver) {
      if (prop !== "completions") return Reflect.get(target, prop, receiver);
      return wrapCompletions(target.completions, defaults);
    },
  });
}

function wrapCompletions(
  completions: OpenAI["chat"]["completions"],
  defaults?: CostContext,
): OpenAI["chat"]["completions"] {
  return new Proxy(completions, {
    get(target, prop, receiver) {
      if (prop !== "create") return Reflect.get(target, prop, receiver);
      return makeCreate(target, defaults);
    },
  });
}

// ─── instrumented create ──────────────────────────────────────────────────────

type CreateParams = Parameters<OpenAI["chat"]["completions"]["create"]>[0];
type CreateOptions = Parameters<OpenAI["chat"]["completions"]["create"]>[1] & {
  llmargus?: CostContext; // stripped before forwarding to OpenAI
};

function makeCreate(completions: OpenAI["chat"]["completions"], defaults?: CostContext) {
  // We return `unknown` here and let callers rely on the Proxy typing above
  // (which presents the original OpenAI type). Overload signatures on wrapped
  // methods are complex to replicate exactly; the runtime behavior is correct.
  return async function create(body: CreateParams, options?: CreateOptions): Promise<unknown> {
    const start = performance.now();
    const tags = resolveTags(options?.llmargus, defaults);
    const stripped = stripLlmargus(options);

    if (body.stream) {
      return streamingCreate(completions, body, stripped, tags, start);
    }
    return nonStreamingCreate(completions, body, stripped, tags, start);
  };
}

// ─── non-streaming ────────────────────────────────────────────────────────────

async function nonStreamingCreate(
  completions: OpenAI["chat"]["completions"],
  body: CreateParams,
  options: Parameters<OpenAI["chat"]["completions"]["create"]>[1],
  tags: CostContext,
  start: number,
) {
  try {
    const res = await completions.create(
      body as Parameters<OpenAI["chat"]["completions"]["create"]>[0],
      options,
    );

    // res is ChatCompletion here (non-streaming path)
    const completion = res as Awaited<ReturnType<OpenAI["chat"]["completions"]["create"]>>;

    enqueue({
      provider: "openai",
      // response.model is the resolved model name (e.g. "gpt-4o-2024-08-06"),
      // more accurate than what was requested in body.model
      model: "model" in completion ? String(completion.model) : body.model,
      tokensIn: "usage" in completion ? (completion.usage?.prompt_tokens ?? null) : null,
      tokensOut: "usage" in completion ? (completion.usage?.completion_tokens ?? null) : null,
      latencyMs: performance.now() - start,
      ttftMs: null,
      stream: false,
      success: true,
      ...tags,
      ts: Date.now(),
    });

    return res;
  } catch (err) {
    enqueue({
      provider: "openai",
      model: body.model,
      tokensIn: null,
      tokensOut: null,
      latencyMs: performance.now() - start,
      ttftMs: null,
      stream: false,
      success: false,
      errorType: err instanceof Error ? err.name : "UnknownError",
      ...tags,
      ts: Date.now(),
    });
    throw err; // always rethrow — never swallow the host app's error
  }
}

// ─── streaming ────────────────────────────────────────────────────────────────

async function* streamingCreate(
  completions: OpenAI["chat"]["completions"],
  body: CreateParams,
  options: Parameters<OpenAI["chat"]["completions"]["create"]>[1],
  tags: CostContext,
  start: number,
): AsyncGenerator<unknown> {
  let ttftMs: number | null = null;
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;

  try {
    // Inject include_usage so the final chunk carries token counts.
    // Without this, OpenAI doesn't send usage in streamed responses.
    const bodyWithUsage = {
      ...body,
      stream_options: { include_usage: true },
    };

    const stream = await completions.create(
      bodyWithUsage as Parameters<OpenAI["chat"]["completions"]["create"]>[0],
      options,
    );

    // Tee the stream: yield each chunk to the caller immediately (no delay),
    // while observing the usage chunk that arrives at the end.
    for await (const chunk of stream as AsyncIterable<{
      usage?: { prompt_tokens: number; completion_tokens: number };
    }>) {
      if (ttftMs === null) {
        ttftMs = performance.now() - start; // first chunk = first token
      }
      if (chunk.usage) {
        tokensIn = chunk.usage.prompt_tokens;
        tokensOut = chunk.usage.completion_tokens;
      }
      yield chunk;
    }

    enqueue({
      provider: "openai",
      model: body.model,
      tokensIn,
      tokensOut,
      latencyMs: performance.now() - start,
      ttftMs,
      stream: true,
      success: true,
      ...tags,
      ts: Date.now(),
    });
  } catch (err) {
    // Enqueue whatever we managed to observe before the error, then rethrow.
    enqueue({
      provider: "openai",
      model: body.model,
      tokensIn,
      tokensOut,
      latencyMs: performance.now() - start,
      ttftMs,
      stream: true,
      success: false,
      errorType: err instanceof Error ? err.name : "UnknownError",
      ...tags,
      ts: Date.now(),
    });
    throw err;
  }
}

