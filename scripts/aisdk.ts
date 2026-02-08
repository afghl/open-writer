import { z } from 'zod';
import { streamText, generateText, tool, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';


const provider = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://aihubmix.com/v1",
})

async function generate() {
    const model = provider("gpt-5")
    const rsp = await generateText({
        model: model,
        tools: {
            weather: tool({
                description: 'Get the weather in a location',
                inputSchema: z.object({
                    location: z.string().describe('The location to get the weather for'),
                }),
                execute: async ({ location }) => {
                    console.log(`location ${location}`)
                    return {

                        location,
                        temperature: 72 + Math.floor(Math.random() * 21) - 10,
                    }
                },
            }),
        },
        stopWhen: stepCountIs(1),
        prompt: 'What is the weather in San Francisco?',
    })
    console.log(rsp.text)
}

async function stream() {
    const model = provider("gpt-5")
    const rsp = await streamText({
        model: model,

        tools: {
            weather: tool({
                description: 'Get the weather in a location',
                inputSchema: z.object({
                    location: z.string().describe('The location to get the weather for'),
                }),
                execute: async ({ location }) => {
                    console.log(`location ${location}`)
                    return {
                        location,
                        temperature: 72 + Math.floor(Math.random() * 21) - 10,
                    }
                },
            }),
        },
        // stopWhen: stepCountIs(1),
        providerOptions: {
            openai: {
                reasoningEffort: "high", // none | minimal | low | medium | high | xhigh
            },
        },
        prompt: 'What is the weather in San Francisco?',
    })
    for await (const chunk of rsp.fullStream) {
        console.log(chunk.type)
    }
}

stream().then(console.log).catch(console.error)