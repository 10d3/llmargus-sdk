# llmargus

> Track LLM costs per user, per feature — in one line of code.

[![npm](https://img.shields.io/npm/v/llmargus)](https://www.npmjs.com/package/llmargus)
[![License: EL2](https://img.shields.io/badge/License-Elastic_2.0-blue.svg)](LICENSE)

`llmargus` wraps your OpenAI or Anthropic client and silently tracks every call — tokens in, tokens out, latency, streaming or not — then ships the data to your [LLMargus](https://llmargus.io) dashboard fire-and-forget with **zero added latency**.

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
import llmargus from "llmargus"

llmargus.init({ apiKey: "lmg_..." })

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
import llmargus from "llmargus"

llmargus.init({ apiKey: "lmg_..." })

const anthropic = llmargus.wrap(new Anthropic())

const response = await anthropic.messages.create({
  model: "claude-opus-4-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
})
```

---

## Attribution — tag by user & feature

### Option 1: `withContext` (recommended for request handlers)

Wraps a block of async code and automatically tags every LLM call inside it.

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
| `apiKey` | `string` | **required** | Your LLMargus API key |
| `ingestUrl` | `string` | `https://llmargus.io/api/ingest` | Custom ingest endpoint |
| `flushIntervalMs` | `number` | `2000` | How often to flush the event queue (ms) |
| `maxBatchSize` | `number` | `50` | Max events per batch before early flush |

### `llmargus.wrap(client, defaults?)`

Returns a proxied version of the client. Accepts an optional `{ userId, feature }` default context.

### `llmargus.withContext(ctx, fn)`

Runs `fn` with `ctx` available to all wrapped calls inside it. Uses `AsyncLocalStorage` — works across `await`s.

### `llmargus.track(event)`

Manually enqueue a `CostEvent`. Useful for unsupported providers.

---

## How it works

- Wraps your client using JavaScript's `Proxy` API — the original client is never mutated
- Events are buffered in memory and flushed in batches every 2 seconds (configurable)
- Flush also triggers on `process.beforeExit` to prevent event loss in serverless environments
- Failures are swallowed silently — LLMargus never throws into your application

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
