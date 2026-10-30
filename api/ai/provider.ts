import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { listModels } from "../lib/ai-client";

export const kimiGw = createOpenAICompatible({
  name: "kimi-gw",
  baseURL: process.env.KIMI_AGENTGW_BASE_URL!,
  apiKey: process.env.KIMI_AGENTGW_API_KEY!,
  includeUsage: true,
  supportsStructuredOutputs: true,
});

export async function getDefaultVisionModel() {
  const { models, defaultModelId } = await listModels();
  const defaultModel = models.find((model) => model.id === defaultModelId);
  if (defaultModel?.supportsImageIn === false) {
    throw new Error("The currently available AI model cannot read photos. Nutrition can still be entered manually.");
  }
  return kimiGw(defaultModelId);
}
