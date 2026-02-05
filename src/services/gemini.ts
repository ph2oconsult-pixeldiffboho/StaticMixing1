import { GoogleGenerativeAI } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("VITE_GEMINI_API_KEY is not defined");
}

const genAI = new GoogleGenerativeAI(apiKey);

export async function getAIRecommendations(
  inputs: any,
  results: any,
  guideContent?: string
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  const prompt = `
You are a senior water treatment engineer.

Inputs:
${JSON.stringify(inputs, null, 2)}

Results:
${JSON.stringify(results, null, 2)}

${guideContent ? `Reference Guide:\n${guideContent}` : ""}

Provide a concise professional audit.
`;

  const response = await model.generateContent(prompt);
  return response.response.text();
}

export async function extractGuideData(base64Pdf: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  const result = await model.generateContent([
    {
      inlineData: {
        data: base64Pdf,
        mimeType: "application/pdf",
      },
    },
    "Extract relevant hydraulic and mixing design guidance.",
  ]);

  return result.response.text();
}
