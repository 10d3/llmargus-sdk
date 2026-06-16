/**
 * Measures the latency overhead the LLMargus SDK adds to native LLM calls.
 *
 * Method:
 *   1. Warm up the HTTP connection with a few un-timed calls.
 *   2. Run ROUNDS baseline calls (no wrapper) and record each duration.
 *   3. Run ROUNDS instrumented calls (with wrapper) and record each duration.
 *   4. Report min / median / p95 / p99 and the overhead delta.
 *
 * The ingest endpoint is intentionally NOT called during the benchmark —
 * we're measuring proxy overhead only (the queue flush is background anyway).
 *
 * Usage:
 *   pnpm --filter llmargus benchmark
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotenv(path: string) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch {}
}

loadDotenv(join(__dirname, "../.env"));

const OPENAI_API_KEY = process.env["OPENAI_API_KEY"];
if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY not set in packages/sdk/.env");
  process.exit(1);
}

const WARMUP = 3;   // un-timed calls to establish the TCP connection
const ROUNDS = 20;  // timed calls per group

// ─── helpers ─────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    min:    s[0]!,
    median: percentile(s, 50),
    mean:   Math.round(mean),
    p95:    percentile(s, 95),
    p99:    percentile(s, 99),
    max:    s[s.length - 1]!,
  };
}

function fmt(ms: number) {
  return ms.toFixed(1).padStart(7) + " ms";
}

// ─── setup ───────────────────────────────────────────────────────────────────

const { default: OpenAI } = await import("openai");

// Init SDK with a no-op ingest URL so the queue never actually sends —
// we're benchmarking proxy overhead, not network latency to our server.
const { llmargus } = await import("../src/llmargus.js");
llmargus.init({
  apiKey: "benchmark",
  ingestUrl: "http://localhost:1/devnull", // intentionally unreachable
  flushIntervalMs: 60_000,                 // never flush during benchmark
});

const baseClient  = new OpenAI({ apiKey: OPENAI_API_KEY });
const wrappedClient = llmargus.wrap(
  new OpenAI({ apiKey: OPENAI_API_KEY }),
  { feature: "benchmark" },
);

const CALL_PARAMS = {
  model: "gpt-4o-mini",
  messages: [{ role: "user" as const, content: "Say the word: ok" }],
  max_tokens: 1,
} as const;

// ─── warm up (shared connection, no timing) ───────────────────────────────────

process.stdout.write(`Warming up (${WARMUP} calls)…`);
for (let i = 0; i < WARMUP; i++) {
  await baseClient.chat.completions.create(CALL_PARAMS);
  process.stdout.write(" .");
}
console.log(" done\n");

// ─── baseline (unwrapped) ────────────────────────────────────────────────────

console.log(`Baseline — no SDK wrapper (${ROUNDS} calls)…`);
const baselineSamples: number[] = [];
for (let i = 0; i < ROUNDS; i++) {
  const t0 = performance.now();
  await baseClient.chat.completions.create(CALL_PARAMS);
  baselineSamples.push(performance.now() - t0);
  process.stdout.write(".");
}
console.log("\n");

// ─── instrumented (wrapped) ───────────────────────────────────────────────────

console.log(`Instrumented — with SDK wrapper (${ROUNDS} calls)…`);
const wrappedSamples: number[] = [];
for (let i = 0; i < ROUNDS; i++) {
  const t0 = performance.now();
  await wrappedClient.chat.completions.create(CALL_PARAMS);
  wrappedSamples.push(performance.now() - t0);
  process.stdout.write(".");
}
console.log("\n");

llmargus.shutdown();

// ─── report ───────────────────────────────────────────────────────────────────

const b = stats(baselineSamples);
const w = stats(wrappedSamples);

console.log("┌──────────────────────────────────────────────────────┐");
console.log("│              LLMargus SDK overhead report             │");
console.log("├───────────┬───────────────────┬───────────────────────┤");
console.log("│           │    Baseline (ms)  │   Instrumented (ms)   │");
console.log("├───────────┼───────────────────┼───────────────────────┤");
console.log(`│ min       │ ${fmt(b.min)}     │ ${fmt(w.min)}          │`);
console.log(`│ median    │ ${fmt(b.median)}  │ ${fmt(w.median)}       │`);
console.log(`│ mean      │ ${fmt(b.mean)}    │ ${fmt(w.mean)}         │`);
console.log(`│ p95       │ ${fmt(b.p95)}     │ ${fmt(w.p95)}          │`);
console.log(`│ p99       │ ${fmt(b.p99)}     │ ${fmt(w.p99)}          │`);
console.log(`│ max       │ ${fmt(b.max)}     │ ${fmt(w.max)}          │`);
console.log("├───────────┴───────────────────┴───────────────────────┤");

const overheadMedian = w.median - b.median;
const overheadP95    = w.p95    - b.p95;
const pct = ((overheadMedian / b.median) * 100).toFixed(2);

console.log(`│ overhead  median ${fmt(overheadMedian)}  p95 ${fmt(overheadP95)}             │`);
console.log(`│ overhead% median ${(pct + "%").padStart(7)}                               │`);
console.log("└──────────────────────────────────────────────────────┘");
console.log("\nNote: queue flush runs in the background after each call —");
console.log("it does NOT block the LLM response and is NOT included above.");
