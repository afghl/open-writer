import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { getEnv } from "@/config/config"

export const generate = async (prompt: string) => {
  const apiKey = getEnv("OPENAI_API_KEY")
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set")
  }

  const provider = createOpenAI({
    apiKey,
    baseURL: getEnv("OPENAI_BASE_URL"),
  })
  const model = provider("gpt-4o-mini")

  const result = await generateText({
    model,
    prompt,
  })

  return result.text
}
