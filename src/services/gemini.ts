import type { MixingInputs, CalculationResults } from "../types";

/**
 * Calls the Vercel serverless function that runs Gemini
 */
export async function getAIRecommendations(
  inputs: MixingInputs,
  results: CalculationResults,
  guideContent: string
): Promise<string> {
  const res = await fetch("/api/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs, results, guideContent })
  });

  if (!res.ok) {
    throw new Error(`AI request failed (${res.status})`);
  }

  const data = await res.json();
  return data.text || "";
}

/**
 * Uploads a PDF (base64) to the server for reference extraction
 */
export async function extractGuideData(base64Pdf: string): Promise<string> {
  const res = await fetch("/api/extract-guide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64Pdf })
  });

  if (!res.ok) {
    throw new Error(`Guide extraction failed (${res.status})`);
  }

  const data = await res.json();
  return data.text || "";
}
