# llmargus

> Track LLM costs per user, per feature — in one line of code.

[![GitHub Stars](https://www.shieldcn.dev/github/stars/10d3/llmargus-sdk.svg?variant=secondary&size=sm&font=jetbrains-mono)](https://github.com/10d3/llmargus-sdk)
[![GitHub Forks](https://www.shieldcn.dev/github/forks/10d3/llmargus-sdk.svg?variant=secondary&size=sm&font=jetbrains-mono)](https://github.com/10d3/llmargus-sdk)
[![Last commit](https://www.shieldcn.dev/github/last-commit/10d3/llmargus-sdk.svg?variant=secondary&size=sm&font=jetbrains-mono)](https://github.com/10d3/llmargus-sdk/commits/main)
[![Contributors](https://www.shieldcn.dev/github/contributors/10d3/llmargus-sdk.svg?theme=emerald&size=sm&font=jetbrains-mono)](https://github.com/10d3/llmargus-sdk/graphs/contributors)
[![Open issues](https://www.shieldcn.dev/github/open-issues/10d3/llmargus-sdk.svg?variant=secondary&size=sm&font=jetbrains-mono)](https://github.com/10d3/llmargus-sdk/issues)
[![Release](https://www.shieldcn.dev/github/release/10d3/llmargus-sdk.svg?size=sm&font=jetbrains-mono)](https://github.com/10d3/llmargus-sdk/releases)
[![License](https://www.shieldcn.dev/github/license/10d3/llmargus-sdk.svg?variant=ghost&size=sm&font=jetbrains-mono)](LICENSE)

[![npm Version](https://www.shieldcn.dev/npm/llmargus.svg?variant=secondary&size=sm&font=jetbrains-mono)](https://www.npmjs.com/package/llmargus)
[![npm Weekly Downloads](https://www.shieldcn.dev/npm/dw/llmargus.svg?size=sm&font=jetbrains-mono)](https://www.npmjs.com/package/llmargus)
[![npm Total Downloads](https://www.shieldcn.dev/npm/dt/llmargus.svg?variant=secondary&size=sm&font=jetbrains-mono)](https://www.npmjs.com/package/llmargus)
[![npm Types](https://www.shieldcn.dev/npm/types/llmargus.svg?theme=blue&size=sm&font=jetbrains-mono)](https://www.npmjs.com/package/llmargus)
[![npm Node](https://www.shieldcn.dev/npm/node/llmargus.svg?variant=secondary&size=sm&font=jetbrains-mono)](https://www.npmjs.com/package/llmargus)

[![Language · TypeScript](https://www.shieldcn.dev/badge/Language-TypeScript-3178C6.svg?logo=typescript&variant=branded&size=sm&font=jetbrains-mono)](https://www.typescriptlang.org)
[![AI SDK · OpenAI](https://www.shieldcn.dev/badge/Stack-AI_SDK_%C2%B7_OpenAI-412991.svg?logo=openai&variant=branded&size=sm&font=jetbrains-mono)](https://platform.openai.com)
[![AI SDK · Anthropic](https://www.shieldcn.dev/badge/Stack-AI_SDK_%C2%B7_Anthropic-D97757.svg?logo=anthropic&variant=branded&size=sm&font=jetbrains-mono)](https://anthropic.com)
[![AI SDK](https://www.shieldcn.dev/badge/Stack-AI_SDK-000000.svg?logo=vercel&variant=branded&size=sm&font=jetbrains-mono)](https://sdk.vercel.ai)
[![Dual package ESM+CJS](https://www.shieldcn.dev/badge/Dual_package-ESM%2BCJS-2563eb.svg?variant=secondary&size=sm&font=jetbrains-mono)](https://www.npmjs.com/package/llmargus)

`llmargus` wraps your OpenAI or Anthropic client and silently tracks every call — tokens in, tokens out, latency, streaming or not — then ships the data to your [LLMargus](https://llmargus.com) dashboard fire-and-forget with **zero added latency**.

---

## Install

```bash
npm install llmargus
# or
pnpm add llmargus
# or
yarn add llmargus
```

---

## Quickstart

### OpenAI

```ts
import OpenAI from "openai"
import { llmargus } from "llmargus"

llmargus.init({ apiKey: "llmg_..." })

const openai = llmargus.wrap(new OpenAI())

// Use exactly like you normally would
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
})
```

### Anthropic

```ts
import Anthropic from "@anthropic-ai/sdk"
import { llmargus } from "llmargus"

llmargus.init({ apiKey: "llmg_..." })

const anthropic = llmargus.wrap(new Anthropic())

const response = await anthropic.messages.create({
  model: "claude-opus-4-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
})
```

### Vercel AI SDK

```ts
import * as ai from "ai"
import { llmargus } from "llmargus"

llmargus.init({ apiKey: "llmg_..." })

const { generateText, streamText } = llmargus.wrapVercel(ai, { feature: "chat" })

// Per-call context via the llmargus option (stripped before forwarding to the provider)
const result = await generateText({
  model: openai("gpt-4o-mini"),
  prompt: "Hello!",
  llmargus: { userId: user.id },
})
```

---

## Attribution — tag by user & feature

### Option 1: `withContext` (recommended for request handlers)

Wraps a block of async code and automatically tags every LLM call inside it. Uses `AsyncLocalStorage` — works across `await`s and nested calls.

```ts
await llmargus.withContext({ userId: "user_123", feature: "summarizer" }, async () => {
  await openai.chat.completions.create({ ... })
  // automatically tagged with userId + feature
})
```

### Option 2: wrap-time defaults

```ts
const openai = llmargus.wrap(new OpenAI(), { feature: "chat" })
```

### Option 3: manual `track()`

For providers the SDK does not support yet, or raw `fetch` calls:

```ts
llmargus.track({
  provider: "openai",
  model: "gpt-4o",
  tokensIn: 500,
  tokensOut: 120,
  latencyMs: 800,
  ttftMs: null,
  stream: false,
  success: true,
  ts: Date.now(),
})
```

---

## Streaming

Works out of the box — no changes needed:

```ts
const stream = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Tell me a story" }],
  stream: true,
})

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "")
}
// event is enqueued once the stream ends — includes ttftMs
```

---

## API Reference

### `llmargus.init(config)`

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | **required** | Your `llmg_...` API key |
| `ingestUrl` | `string` | `https://llmargus.com/api/ingest` | Custom ingest endpoint |
| `flushIntervalMs` | `number` | `2000` | How often to flush the event queue (ms) |
| `maxBatchSize` | `number` | `50` | Max events per batch before early flush |

### `llmargus.wrap(client, defaults?)`

Returns an instrumented version of the client. Supports `OpenAI` and `Anthropic` instances. Accepts an optional `CostContext` default.

### `llmargus.wrapVercel(ai, defaults?)`

Instruments Vercel AI SDK's `generateText` and `streamText`. Compatible with v3, v4, and v5. Per-call context via the `llmargus` option on each call.

### `llmargus.withContext(ctx, fn)`

Runs `fn` with `ctx` available to all wrapped calls inside it. Uses `AsyncLocalStorage` — works across `await`s.

### `llmargus.track(event)`

Manually enqueue a `CostEvent`. Useful for unsupported providers.

### `llmargus.flush()`

Drain the event queue immediately. Useful in tests and short-lived scripts.

### `llmargus.shutdown()`

Stop the background flush interval.

---

## How it works

- Events are buffered in memory and flushed in batches every 2 seconds (configurable)
- Flush also triggers on `process.beforeExit` to prevent event loss in short-lived processes
- Failures are swallowed silently — LLMargus never throws into your application
- Cost is computed server-side from `(provider, model, tokensIn, tokensOut)` — you never pass a dollar amount

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This SDK is licensed under the **[Elastic License 2.0](LICENSE)**.

**Permitted:**
- Use in your own applications and businesses, including commercial products
- Modification and contribution back to this repository

**Not permitted:**
- Offering this software to third parties as a hosted or managed service
- Building and selling a competing LLM cost-tracking platform using this code
- Removing or obscuring copyright notices
