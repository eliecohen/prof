import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

export class LLMClient {
  constructor({ provider, baseUrl, model, apiKey }) {
    this.model = model
    this.provider = provider

    if (provider === 'anthropic') {
      this.client = new Anthropic({ apiKey })
      this.mode = 'anthropic'
    } else {
      this.client = new OpenAI({ baseURL: baseUrl, apiKey: apiKey || 'local' })
      this.mode = 'openai'
    }
  }

  async create({ system, messages, maxTokens = 2048, temperature = 0.7 }) {
    if (this.mode === 'anthropic') {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages
      })
      return {
        text: response.content[0]?.text ?? '',
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      }
    } else {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'system', content: system }, ...messages],
        // Disable Qwen3 chain-of-thought thinking mode
        extra_body: { enable_thinking: false }
      })
      const msg = response.choices[0]?.message
      // Strip Qwen3 <think>...</think> blocks from content or reasoning_content
      const raw = msg?.content || msg?.reasoning_content || ''
      const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      return {
        text,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0
      }
    }
  }
}
