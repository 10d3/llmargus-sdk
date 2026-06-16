import { getContext } from "../context.js";
import type { CostContext } from "../types.js";

// Precedence: per-call > async context > wrap-time defaults, field by field.
export function resolveTags(
  perCall: CostContext | undefined,
  defaults: CostContext | undefined,
): CostContext {
  const ctx = getContext();
  return {
    feature:    perCall?.feature    ?? ctx?.feature    ?? defaults?.feature,
    userId:     perCall?.userId     ?? ctx?.userId     ?? defaults?.userId,
    userName:   perCall?.userName   ?? ctx?.userName   ?? defaults?.userName,
    userEmail:  perCall?.userEmail  ?? ctx?.userEmail  ?? defaults?.userEmail,
    userAvatar: perCall?.userAvatar ?? ctx?.userAvatar ?? defaults?.userAvatar,
  };
}

// Strips the llmargus field before forwarding options to the provider.
// Returns undefined rather than {} so providers don't receive an empty options object.
export function stripLlmargus<T extends { llmargus?: CostContext }>(
  options?: T,
): Omit<T, "llmargus"> | undefined {
  if (!options) return undefined;
  const { llmargus: _, ...rest } = options;
  return Object.keys(rest).length > 0 ? (rest as Omit<T, "llmargus">) : undefined;
}
