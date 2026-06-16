import type { CostEvent } from "./types.js";

type TransportOptions = {
  ingestUrl: string;
  apiKey: string;
};

// Sends a batch of events to the ingest endpoint.
// Throws on network error or non-2xx so the queue can decide whether to retry.
export async function sendBatch(
  events: CostEvent[],
  opts: TransportOptions,
): Promise<void> {
  const res = await fetch(opts.ingestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({ events }),
  });

  if (!res.ok) {
    throw new Error(`ingest responded ${res.status}`);
  }
}
