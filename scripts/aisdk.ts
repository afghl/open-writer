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
            location: tool({
                description: 'Get the location of curr_user',
                inputSchema: z.object({
                    email: z.string().describe('The email of the user'),
                }),
                execute: async ({ email }) => {
                    console.log(`email ${email}`)
                    return {
                        location: "San Francisco",
                    }
                },
            }),
        },
        stopWhen: stepCountIs(7),
        providerOptions: {
            openai: {
                reasoningEffort: "high", // none | minimal | low | medium | high | xhigh
                reasoningSummary: "auto"
            },

        },
        prompt: '我的账户是ads@qq.com，帮我看看这里的天气',
    })
    let text = ""
    let reasoning = ""
    for await (const chunk of rsp.fullStream) {
        if (chunk.type === "reasoning-delta") {
            reasoning += chunk.text
            continue
        }
        if (chunk.type === "text-delta") {
            text += chunk.text
            continue
        }
        if (chunk.type === "tool-input-delta") {
            continue
        }
        console.log(chunk.type)
    }
    console.log(reasoning)
    console.log(text)
}

stream().then(console.log).catch(console.error)