import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { MixingInputs, CalculationResults } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Utility function to handle retries with exponential backoff.
 */
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isRateLimit = error?.message?.includes('429') || error?.status === 429;
      const isServerError = error?.status >= 500;
      
      if (i < maxRetries - 1 && (isRateLimit || isServerError)) {
        const waitTime = Math.pow(2, i) * 1000 + Math.random() * 1000;
        console.warn(`API call failed (Attempt ${i + 1}). Retrying in ${Math.round(waitTime)}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Extracts technical data from an uploaded PDF design guide.
 * Specifically tuned for BHR Report CR 7469.
 */
export const extractGuideData = async (pdfBase64: string): Promise<string> => {
  const prompt = `
    Analyze the attached BHR Group Design Guide (Report CR 7469 / WWM 4). 
    Extract and summarize the following technical details:
    1. Coefficients and specific CoV formulas for helical (Kenics), tab (HEV), and corrugated (SMV/STM) mixers.
    2. Guidelines for Momentum Ratio (sqrt(ma/mm)) and its impact on empty conduit mixing.
    3. Headloss (Pressure Drop) constants (Darcy Friction Factors FD) for specific mixers.
    4. Differences between Single and Twin feed injection effectiveness.
    
    Structure the response clearly using Markdown headers. 
    IMPORTANT: Do not use dollar signs ($) for math formatting or units. Use plain text.
  `;

  try {
    const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfBase64,
            },
          },
          { text: prompt },
        ],
      },
    }));
    return response.text || "Reference guide synchronization complete.";
  } catch (error: any) {
    console.error("Gemini Guide Extraction Error:", error);
    return "Failed to synchronize reference guide.";
  }
};

/**
 * Generates an engineering assessment grounded in BHR CR 7469 methodology.
 */
export const getAIRecommendations = async (
  inputs: MixingInputs, 
  results: CalculationResults, 
  guideContext?: string
) => {
  const prompt = `
    Act as a lead Fluid Dynamics Engineer specializing in BHR Group methodology (CR 7469).
    
    ${guideContext ? `BHR REFERENCE SYNC:\n${guideContext}\n\n` : ''}
    
    STRICT FORMATTING RULE: 
    - NEVER use dollar signs ($) for units, math, or highlighting. 
    - NEVER use currency formatting.
    - Use plain text units: m, s, kg/m3, m/s, kPa, s-1.
    
    ENGINEERING SCENARIO:
    - Conduit: ${inputs.conduitType}
    - Geometry: ${inputs.dimension}m Width/Dia x ${inputs.depth || 'N/A'}m Depth
    - Flow: ${inputs.flowRate} m3/h
    - Mixer: ${inputs.mixerModel} (${inputs.numElements} elements)
    - Injection: ${inputs.injectionType} point(s), ${inputs.pitchRatio} Pitch
    - Chemical: ${inputs.chemicalType} (${inputs.slurryConcentration || 'N/A'}% slurry)
    - Chemical Dose: ${inputs.chemicalDose} mg/L
    
    CALCULATED AUDIT RESULTS:
    - Achieved CoV: ${results.mixerCoV.toFixed(4)} (Target: ${inputs.targetCoV})
    - Momentum Ratio: ${results.momentumRatio.toFixed(3)}
    - Momentum Regime: ${results.momentumRegime}
    - Headloss: ${results.headloss.toFixed(2)} kPa (${results.headlossMeters.toFixed(3)} m)
    - Reynolds Number: ${results.reynoldsNumber.toLocaleString()}
    - G-Value: ${results.gValue.toFixed(0)} s-1
    
    TASK:
    Conduct a technical audit based on BHR CR 7469 Section C correlations. 
    1. Validate if the current feed arrangement is optimal for the calculated Momentum Regime.
    2. Assess density delta risks if chemical is > 5% denser than bulk.
    3. Evaluate if increasing elements or changing pitch is more efficient.
    4. List specific operational risks like ragging or pressure constraints.
    
    Format in professional Engineering Markdown without using LaTeX '$' delimiters.
  `;

  try {
    const response: GenerateContentResponse = await callWithRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    }));
    return response.text || "No recommendations generated.";
  } catch (error: any) {
    console.error("Gemini AI Assessment Error:", error);
    return "Audit generation failed.";
  }
};
