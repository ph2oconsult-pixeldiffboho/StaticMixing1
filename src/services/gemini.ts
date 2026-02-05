// src/services/gemini.ts
import { GoogleGenAI } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

if (!apiKey) {
  throw new Error("VITE_GEMINI_API_KEY is not defined. Set it in Vercel env vars.");
}

const ai = new GoogleGenAI({ apiKey });

function extractText(resp: any): string {
  return (
    resp?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text)
      .filter(Boolean)
      .join("") || ""
  );
}

export async function getAIRecommendations(
  inputs: any,
  results: any,
  guideContent: string
): Promise<string> {
  const model = "gemini-1.5-flash";

  const prompt = [
    "You are a senior water treatment engineer reviewing static mixing in pipes/channels.",
    "Provide a concise professional audit with headings and actionable recommendations.",
    "",
    "INPUTS (JSON):",
    JSON.stringify(inputs, null, 2),
    "",
    "RESULTS (JSON):",
    JSON.stringify(results, null, 2),
    "",
    "REFERENCE GUIDE (if any):",
    (guideContent || "").slice(0, 12000)
  ].join("\n");

  const resp = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  return extractText(resp);
}

export async function extractGuideData(base64Pdf: string): Promise<string> {
  const model = "gemini-1.5-flash";

  const resp = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: base64Pdf
            }
          },
          { text: "Extract relevant hydraulic and mixing design guidance." }
        ]
      }
    ]
  });

  return extractText(resp);
}
