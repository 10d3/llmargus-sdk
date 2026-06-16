# Contributing to llmargus SDK

Thanks for your interest in contributing. This document explains how to get started.

> **Scope:** This repository contains only the `llmargus` npm SDK. It is maintained as a public mirror of a private monorepo. Contributions here are limited to the SDK package.

---

## What we welcome

- Bug fixes
- New provider support (e.g. Google Gemini, Mistral, Cohere)
- Documentation improvements
- Performance improvements to the queue and transport layer
- Tests and benchmarks

## What is out of scope

- The LLMargus web dashboard
- Billing or pricing changes
- Backend and database changes

If you are unsure whether something fits, [open an issue](../../issues) first before writing code.

---

## Getting started

### Prerequisites

- Node.js 18+
- pnpm 10+

### Setup

```bash
# Clone the repo
git clone https://github.com/10d3/llmargus-sdk.git
cd llmargus-sdk

# Install dependencies
pnpm install

# Build
pnpm build

# Watch mode during development
pnpm dev
```

### Run type checks

```bash
pnpm typecheck
```

---

## Project structure

```
src/
├── types.ts          # CostEvent, LLMargusConfig, CostContext — the data contract
├── context.ts        # withContext() / getContext() via AsyncLocalStorage
├── queue.ts          # In-memory event buffer, batching, flush, retry
├── transport.ts      # HTTP POST to ingest endpoint
├── proxy/
│   ├── openai.ts     # Proxy wrapper for OpenAI client
│   └── anthropic.ts  # Proxy wrapper for Anthropic client
├── llmargus.ts       # Public API: init(), wrap(), withContext(), track()
└── index.ts          # Re-exports
```

---

## Adding a new provider

1. Create `src/proxy/<provider>.ts` — model it after `openai.ts` or `anthropic.ts`
2. Map the provider's token field names to `CostEvent.tokensIn` / `tokensOut`
3. Handle both streaming and non-streaming paths
4. Export a `wrap<Provider>` function
5. Wire it into `llmargus.ts` so `llmargus.wrap()` detects the client type automatically
6. Update `README.md` with a quickstart example

Key requirements:
- **Zero added latency** — never `await` the ingest POST inside the critical path
- **Silent failure** — catch all errors from queue/transport; never throw into the host app
- **Streaming** — record `ttftMs` on first chunk, read usage from the final chunk

---

## Submitting a pull request

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Run `pnpm typecheck` and make sure it passes
4. Open a PR with a clear description of what changed and why
5. Link any related issues

### PR checklist

- [ ] TypeScript compiles without errors (`pnpm typecheck`)
- [ ] Both streaming and non-streaming paths are handled (if touching proxy code)
- [ ] No new runtime dependencies added without prior discussion
- [ ] README updated if the public API changed

---

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Gemini provider support
fix: handle stream abort before first chunk
docs: update withContext example
```

---

## License

By contributing, you agree that your contributions will be licensed under the [Elastic License 2.0](LICENSE).
