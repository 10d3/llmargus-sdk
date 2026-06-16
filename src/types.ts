export type Provider = "openai" | "anthropic" | "openrouter" | "google" | "mistral" | "groq" | "cohere";

// Attribution tags — can be set at wrap-time, per-request, or per-call.
export type CostContext = {
  feature?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
};

// The event shape sent to the ingest endpoint.
// Cost ($) is intentionally absent — the server computes it from
// (model, tokensIn, tokensOut) using the pricing package.
export type CostEvent = {
  provider: Provider;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number;
  ttftMs: number | null; // time-to-first-token; streaming only, else null
  stream: boolean;
  success: boolean;
  errorType?: string; // error.name on failure
  feature?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  ts: number; // Date.now() at call time
  estimated?: boolean; // true when token count came from a tokenizer, not the API
};

// Passed to llmargus.init()
export type LLMargusConfig = {
  apiKey: string;
  ingestUrl?: string; // defaults to https://llmargus.io/api/ingest
  flushIntervalMs?: number; // default: 2000
  maxBatchSize?: number; // default: 50
};
