// Main export — everything a user needs
export { llmargus } from "./llmargus.js";

// Types
export type { CostContext, CostEvent, LLMargusConfig, Provider } from "./types.js";

// Escape hatches (advanced use)
export { withContext, getContext } from "./context.js";
export { wrapOpenAI } from "./proxy/openai.js";
export { wrapAnthropic } from "./proxy/anthropic.js";
