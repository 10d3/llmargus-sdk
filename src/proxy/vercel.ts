import { enqueue } from "../queue.js";
import type { CostContext, Provider } from "../types.js";
import { resolveTags } from "./utils.js";

// ─── minimal duck-typed interfaces ───────────────────────────────────────────
// We never import from "ai" so it stays a true peer dep — never bundled.

type LanguageModel = {
  readonly provider: string; // e.g. "openai.chat", "anthropic.messages"
  readonly modelId: string;  // e.g. "gpt-4o-mini", "claude-3-5-sonnet-20241022"
};

// AI SDK v3/v4 used promptTokens/completionTokens; v5+ uses inputTokens/outputTokens.
type VercelUsage = {
  promptTokens?: number;
  completionTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
};

// We accept any object that looks like { model, ...rest } and returns a result
// with usage. Generic enough to cover both generateText and streamText params.
type VercelParams = {
  model: LanguageModel;
  llmargus?: CostContext; // our extension — stripped before forwarding
  onChunk?: (event: { chunk: { type: string } }) => void;
  [key: string]: unknown;
};

type GenerateTextResult = {
  usage: VercelUsage;
  [key: string]: unknown;
};

type StreamTextResult = {
  usage: Promise<VercelUsage>;
  [key: string]: unknown;
};

export type WrappableVercelAI = {
  generateText?: (params: VercelParams) => Promise<GenerateTextResult>;
  streamText?: (params: VercelParams) => StreamTextResult;
};

// ─── main export ─────────────────────────────────────────────────────────────

export function wrapVercel<T extends WrappableVercelAI>(ai: T, defaults?: CostContext): T {
  const patched: WrappableVercelAI = {};

  if (typeof ai.generateText === "function") {
    patched.generateText = makeGenerateText(ai.generateText, defaults);
  }
  if (typeof ai.streamText === "function") {
    patched.streamText = makeStreamText(ai.streamText, defaults);
  }

  return { ...ai, ...patched } as T;
}

// ─── provider detection ───────────────────────────────────────────────────────

function detectProvider(model: LanguageModel): Provider {
  const p = model.provider.toLowerCase();
  if (p.startsWith("anthropic")) return "anthropic";
  return "openai"; // covers openai, azure-openai, openai-compatible, etc.
}

// ─── generateText wrapper ─────────────────────────────────────────────────────

function makeGenerateText(
  fn: NonNullable<WrappableVercelAI["generateText"]>,
  defaults?: CostContext,
): NonNullable<WrappableVercelAI["generateText"]> {
  return async function wrappedGenerateText(params) {
    const { llmargus: perCall, onChunk: _onChunk, ...rest } = params;
    const tags = resolveTags(perCall, defaults);
    const { provider, modelId } = params.model;
    const resolvedProvider = detectProvider(params.model);

    const start = performance.now();
    const ts = Date.now();

    try {
      const result = await fn(rest as VercelParams);

      enqueue({
        provider: resolvedProvider,
        model: modelId,
        tokensIn:  result.usage?.inputTokens ?? result.usage?.promptTokens ?? null,
        tokensOut: result.usage?.outputTokens ?? result.usage?.completionTokens ?? null,
        latencyMs: performance.now() - start,
        ttftMs: null,
        stream: false,
        success: true,
        ...tags,
        ts,
      });

      return result;
    } catch (err) {
      enqueue({
        provider: resolvedProvider,
        model: modelId,
        tokensIn: null,
        tokensOut: null,
        latencyMs: performance.now() - start,
        ttftMs: null,
        stream: false,
        success: false,
        errorType: err instanceof Error ? err.name : "UnknownError",
        ...tags,
        ts,
      });
      throw err;
    }
  };
}

// ─── streamText wrapper ───────────────────────────────────────────────────────

function makeStreamText(
  fn: NonNullable<WrappableVercelAI["streamText"]>,
  defaults?: CostContext,
): NonNullable<WrappableVercelAI["streamText"]> {
  return function wrappedStreamText(params) {
    const { llmargus: perCall, onChunk: userOnChunk, ...rest } = params;
    const tags = resolveTags(perCall, defaults);
    const resolvedProvider = detectProvider(params.model);
    const { modelId } = params.model;

    const start = performance.now();
    const ts = Date.now();
    let ttftMs: number | null = null;

    // Merge onChunk — capture time-to-first-token from the first text-delta.
    const mergedParams: VercelParams = {
      ...rest,
      model: params.model,
      onChunk(event) {
        if (ttftMs === null && event.chunk.type === "text-delta") {
          ttftMs = performance.now() - start;
        }
        userOnChunk?.(event);
      },
    };

    const result = fn(mergedParams);

    // result.usage resolves when the stream drains — enqueue then.
    void result.usage
      .then((usage) => {
        enqueue({
          provider: resolvedProvider,
          model: modelId,
          tokensIn:  usage?.inputTokens ?? usage?.promptTokens ?? null,
          tokensOut: usage?.outputTokens ?? usage?.completionTokens ?? null,
          latencyMs: performance.now() - start,
          ttftMs,
          stream: true,
          success: true,
          ...tags,
          ts,
        });
      })
      .catch(() => {
        enqueue({
          provider: resolvedProvider,
          model: modelId,
          tokensIn: null,
          tokensOut: null,
          latencyMs: performance.now() - start,
          ttftMs,
          stream: true,
          success: false,
          ...tags,
          ts,
        });
      });

    return result;
  };
}
