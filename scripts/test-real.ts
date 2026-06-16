/**
 * End-to-end test with real LLM calls — covers native SDKs and Vercel AI SDK.
 *
 * Usage (from workspace root):
 *   pnpm --filter llmargus test:real
 *
 * Required env vars (set in packages/sdk/.env):
 *   LLMARGUS_API_KEY=llmargus_...   from /dashboard/settings/api-keys
 *   OPENAI_API_KEY=sk-...             and/or
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * Optional:
 *   INGEST_URL=http://localhost:3000/api/ingest  (default)
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

const COSTRADAR_API_KEY = process.env["LLMARGUS_API_KEY"] ?? process.env["COSTRADAR_API_KEY"];
const OPENAI_API_KEY    = process.env["OPENAI_API_KEY"];
const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"];
const INGEST_URL        = process.env["INGEST_URL"] ?? "http://localhost:3000/api/ingest";

if (!COSTRADAR_API_KEY) {
  console.error("LLMARGUS_API_KEY not set. Add it to packages/sdk/.env");
  process.exit(1);
}
if (!OPENAI_API_KEY && !ANTHROPIC_API_KEY) {
  console.error("Set OPENAI_API_KEY or ANTHROPIC_API_KEY in packages/sdk/.env");
  process.exit(1);
}

const { llmargus } = await import("../src/llmargus.js");

llmargus.init({
  apiKey: COSTRADAR_API_KEY,
  ingestUrl: INGEST_URL,
  flushIntervalMs: 500,
});

console.log("Ingest URL:", INGEST_URL);
console.log("");

// ── Native OpenAI SDK ─────────────────────────────────────────────────────────
if (OPENAI_API_KEY) {
  const { default: OpenAI } = await import("openai");

  const openai = llmargus.wrap(
    new OpenAI({ apiKey: OPENAI_API_KEY }),
    { feature: "native-openai", userId: "test-user" },
  );

  console.log("[ Native OpenAI ] non-streaming…");
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Reply with exactly: hello" }],
    max_tokens: 10,
  });
  console.log("  response:", res.choices[0]?.message.content);
  console.log("  tokens:  ", res.usage?.prompt_tokens, "in /", res.usage?.completion_tokens, "out");

  console.log("\n[ Native OpenAI ] streaming…");
  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Count to 3, one per line" }],
    max_tokens: 20,
    stream: true,
  });
  process.stdout.write("  response: ");
  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta.content ?? "");
  }
  console.log("");
}

// ── Native Anthropic SDK ──────────────────────────────────────────────────────
if (ANTHROPIC_API_KEY) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");

  const anthropic = llmargus.wrap(
    new Anthropic({ apiKey: ANTHROPIC_API_KEY }),
    { feature: "native-anthropic", userId: "test-user" },
  );

  console.log("\n[ Native Anthropic ] non-streaming…");
  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 10,
    messages: [{ role: "user", content: "Reply with exactly: hello" }],
  });
  const block = res.content[0];
  console.log("  response:", block?.type === "text" ? block.text : "—");
  console.log("  tokens:  ", res.usage.input_tokens, "in /", res.usage.output_tokens, "out");

  console.log("\n[ Native Anthropic ] streaming…");
  const stream = anthropic.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 20,
    messages: [{ role: "user", content: "Count to 3, one per line" }],
  });
  process.stdout.write("  response: ");
  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
      process.stdout.write(chunk.delta.text);
    }
  }
  console.log("");
}

// ── Vercel AI SDK ─────────────────────────────────────────────────────────────
if (OPENAI_API_KEY || ANTHROPIC_API_KEY) {
  const ai = await import("ai");

  // wrapVercel patches generateText/streamText in-place and returns them typed.
  const { generateText, streamText } = llmargus.wrapVercel(
    { generateText: ai.generateText, streamText: ai.streamText },
    { feature: "vercel-ai", userId: "test-user" },
  );

  if (OPENAI_API_KEY) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openaiProvider = createOpenAI({ apiKey: OPENAI_API_KEY });

    console.log("\n[ Vercel AI / OpenAI ] generateText…");
    const result = await generateText({
      model: openaiProvider("gpt-4o-mini"),
      prompt: "Reply with exactly: hello",
      maxTokens: 10,
    });
    console.log("  response:", result.text);
    console.log("  tokens:  ", result.usage.inputTokens ?? result.usage.promptTokens, "in /", result.usage.outputTokens ?? result.usage.completionTokens, "out");

    console.log("\n[ Vercel AI / OpenAI ] streamText…");
    const stream = streamText({
      model: openaiProvider("gpt-4o-mini"),
      prompt: "Count to 3, one per line",
      maxTokens: 20,
    });
    process.stdout.write("  response: ");
    for await (const chunk of stream.textStream) {
      process.stdout.write(chunk);
    }
    console.log("");
  }

  if (ANTHROPIC_API_KEY) {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const anthropicProvider = createAnthropic({ apiKey: ANTHROPIC_API_KEY });

    console.log("\n[ Vercel AI / Anthropic ] generateText…");
    const result = await generateText({
      model: anthropicProvider("claude-haiku-4-5-20251001"),
      prompt: "Reply with exactly: hello",
      maxTokens: 10,
    });
    console.log("  response:", result.text);
    console.log("  tokens:  ", result.usage.inputTokens ?? result.usage.promptTokens, "in /", result.usage.outputTokens ?? result.usage.completionTokens, "out");

    console.log("\n[ Vercel AI / Anthropic ] streamText…");
    const stream = streamText({
      model: anthropicProvider("claude-haiku-4-5-20251001"),
      prompt: "Count to 3, one per line",
      maxTokens: 20,
    });
    process.stdout.write("  response: ");
    for await (const chunk of stream.textStream) {
      process.stdout.write(chunk);
    }
    console.log("");
  }
}

// ── flush + summary ───────────────────────────────────────────────────────────
console.log("\nFlushing events to ingest…");
await llmargus.flush();
llmargus.shutdown();

const nativeCount = (OPENAI_API_KEY ? 2 : 0) + (ANTHROPIC_API_KEY ? 2 : 0);
const vercelCount = (OPENAI_API_KEY ? 2 : 0) + (ANTHROPIC_API_KEY ? 2 : 0);
console.log(`\nDone. Expect ${nativeCount + vercelCount} new rows in Neon events table.`);
