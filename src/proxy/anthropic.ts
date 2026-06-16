import type Anthropic from "@anthropic-ai/sdk";

import { enqueue } from "../queue.js";
import type { CostContext } from "../types.js";
import { resolveTags, stripLlmargus } from "./utils.js";

// Wraps an Anthropic client with instrumentation. Transparent Proxy —
// only messages.create is intercepted.
export function wrapAnthropic(client: Anthropic, defaults?: CostContext): Anthropic {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "messages") return Reflect.get(target, prop, receiver);
      return wrapMessages(target.messages, defaults);
    },
  });
}

// ─── proxy chain: client → messages → create ─────────────────────────────────

function wrapMessages(
  messages: Anthropic["messages"],
  defaults?: CostContext,
): Anthropic["messages"] {
  return new Proxy(messages, {
    get(target, prop, receiver) {
      if (prop !== "create") return Reflect.get(target, prop, receiver);
      return makeCreate(target, defaults);
    },
  });
}

// ─── instrumented create ──────────────────────────────────────────────────────

type CreateParams = Parameters<Anthropic["messages"]["create"]>[0];
type CreateOptions = Parameters<Anthropic["messages"]["create"]>[1] & {
  llmargus?: CostContext;
};

function makeCreate(messages: Anthropic["messages"], defaults?: CostContext) {
  return async function create(body: CreateParams, options?: CreateOptions): Promise<unknown> {
    const start = performance.now();
    const tags = resolveTags(options?.llmargus, defaults);
    const stripped = stripLlmargus(options);

    if (body.stream) {
      return streamingCreate(messages, body, stripped, tags, start);
    }
    return nonStreamingCreate(messages, body, stripped, tags, start);
  };
}

// ─── non-streaming ────────────────────────────────────────────────────────────

async function nonStreamingCreate(
  messages: Anthropic["messages"],
  body: CreateParams,
  options: Parameters<Anthropic["messages"]["create"]>[1],
  tags: CostContext,
  start: number,
) {
  try {
    const res = await messages.create(body, options);
    const msg = res as Anthropic.Message;

    enqueue({
      provider: "anthropic",
      model: msg.model ?? body.model,
      tokensIn: msg.usage?.input_tokens ?? null,
      tokensOut: msg.usage?.output_tokens ?? null,
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
      provider: "anthropic",
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
    throw err;
  }
}

// ─── streaming ────────────────────────────────────────────────────────────────

// Anthropic streaming emits typed SSE events. Usage arrives in two separate
// events rather than a single final chunk like OpenAI:
//
//   message_start  → event.message.usage.input_tokens   (tokens in)
//   message_delta  → event.usage.output_tokens          (tokens out, final count)
//
// Everything else (content_block_*) is the actual content and is yielded
// straight through to the caller.

async function* streamingCreate(
  messages: Anthropic["messages"],
  body: CreateParams,
  options: Parameters<Anthropic["messages"]["create"]>[1],
  tags: CostContext,
  start: number,
): AsyncGenerator<unknown> {
  let ttftMs: number | null = null;
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;

  try {
    const stream = await messages.create(body, options);

    for await (const event of stream as AsyncIterable<Anthropic.MessageStreamEvent>) {
      if (ttftMs === null) {
        ttftMs = performance.now() - start;
      }

      if (event.type === "message_start") {
        tokensIn = event.message.usage.input_tokens;
      }

      if (event.type === "message_delta" && "usage" in event) {
        tokensOut = (event as Anthropic.RawMessageDeltaEvent).usage.output_tokens;
      }

      yield event;
    }

    enqueue({
      provider: "anthropic",
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
    enqueue({
      provider: "anthropic",
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

