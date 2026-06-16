import { AsyncLocalStorage } from "node:async_hooks";

import type { CostContext } from "./types.js";

const storage = new AsyncLocalStorage<CostContext>();

// Runs fn inside a context. Every call made inside fn (even after awaits,
// even in nested helpers) can read the context via getContext().
export function withContext<T>(ctx: CostContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

// Called inside the proxy on every intercepted call to pick up attribution tags.
export function getContext(): CostContext | undefined {
  return storage.getStore();
}
