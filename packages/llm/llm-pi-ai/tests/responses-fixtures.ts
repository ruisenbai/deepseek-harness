/** Synthetic Responses history and SSE frames; no provider-issued encrypted data. */

import { createAssistantMessage, createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import type { Api } from '@earendil-works/pi-ai'
import type { PiAiReplayResponse } from '../src/replay.ts'

/** A deliberately artificial reasoning item used only by local mock servers. */
export const responsesReasoningItem = {
  type: 'reasoning',
  id: 'rs_saved',
  summary: [{ type: 'summary_text', text: 'Old reasoning summary.' }],
  encrypted_content: 'synthetic-test-payload-not-provider-ciphertext',
}

/** Historical assistant output and its completed tool result. */
export interface ResponsesHistoryOptions {
  provider?: string
  model?: string
  api?: Api
  thinkingSignature?: string
}

/**
 * Create frozen durable history carrying native Responses replay metadata.
 * @param options - historical source identity and an optional corrupt signature.
 * @returns one assistant message followed by its real tool result.
 */
export function responsesHistory(options: ResponsesHistoryOptions = {}): Message[] {
  const provider = options.provider ?? 'responses-test'
  const model = options.model ?? 'responses-model'
  const callId = ToolCallId('call_lookup|fc_saved')
  const response: PiAiReplayResponse = {
    kind: 'pi-ai',
    version: 2,
    api: options.api ?? 'openai-responses',
    provider,
    model,
    responseId: 'resp_saved',
    stopReason: 'toolUse',
  }
  return [
    createAssistantMessage({
      content: [
        { type: 'reasoning', text: 'Old reasoning summary.' },
        { type: 'text', text: 'Checking the saved result.' },
        { type: 'tool-call', id: callId, name: 'lookup', arguments: '{"key":"saved"}' },
      ],
      source: {
        provider,
        model,
        replayState: {
          response,
          blocks: [
            { type: 'reasoning', thinkingSignature: options.thinkingSignature ?? JSON.stringify(responsesReasoningItem) },
            { type: 'text', textSignature: JSON.stringify({ v: 1, id: 'msg_saved', phase: 'commentary' }) },
            { type: 'tool-call' },
          ],
        },
      },
    }),
    createToolResultMessage({
      callId,
      content: [{ type: 'text', text: 'The saved result is available.' }],
      isError: false,
    }),
  ]
}

/**
 * Produce a complete text response through the real Responses SSE decoder.
 * @param text - assistant text the local server returns.
 * @returns the event payloads accepted by the package's mock server.
 */
export function responsesTextEvents(text = 'Recovered.'): string[] {
  const item = {
    type: 'message',
    id: 'msg_recovered',
    role: 'assistant',
    phase: 'final_answer',
    status: 'completed',
    content: [{ type: 'output_text', text, annotations: [] }],
  }
  return [
    JSON.stringify({ type: 'response.created', response: { id: 'resp_recovered' } }),
    JSON.stringify({ type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } }),
    JSON.stringify({ type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: text }),
    JSON.stringify({ type: 'response.output_item.done', output_index: 0, item }),
    JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_recovered',
        status: 'completed',
        output: [item],
        usage: { input_tokens: 9, output_tokens: 2, total_tokens: 11 },
      },
    }),
  ]
}
