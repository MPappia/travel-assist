import "server-only";

import { extractListing, finalizeFields, missingFields } from "@/lib/listing-extract";
import { applyLlmValues } from "@/lib/listing-extract/llm";
import type { ListingExtraction, ListingSource } from "@/lib/listing-extract/types";
import { callListingLlm, getLlmConfig, type LlmConfig } from "@/server/listing-llm";

/** Extraction complète : étage déterministe puis, si configuré et utile, étage LLM. */
export async function runListingExtraction(
  source: ListingSource,
  options: { now?: Date; llm?: LlmConfig | null; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<ListingExtraction> {
  const base = extractListing(source, { now: options.now });
  const llm = options.llm === undefined ? getLlmConfig() : options.llm;
  if (!llm) return { ...base, llm: { status: "disabled" } };

  const missing = missingFields(base.fields);
  if (missing.length === 0 || !source.text?.trim()) return { ...base, llm: { status: "skipped" } };

  const result = await callListingLlm(llm, { text: source.text, url: source.url, missing }, options);
  if (!result.ok) return { ...base, llm: { status: "failed", message: result.message } };
  return { ...base, fields: finalizeFields(applyLlmValues(base.fields, result.values)), llm: { status: "ok" } };
}
