/**
 * Stateless history for Responses gateways that reject replayed reasoning.
 *
 * A gateway that mints `reasoning.encrypted_content` but cannot decrypt its own
 * ciphertext on a later turn answers `invalid_encrypted_content` and refuses the
 * whole request. Nothing in the request can make such a gateway accept the
 * blob, so a route configured with `replayEncryptedReasoning: false` drops
 * Responses reasoning instead of resending it: the model loses its earlier
 * chain of thought, every other part of the history survives.
 *
 * @module dsh-llm-pi-ai/responses-replay
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { Context as PiContext } from '@earendil-works/pi-ai'

const RESPONSES_APIS: readonly string[] = ['openai-responses', 'azure-openai-responses', 'openai-codex-responses']

/**
 * Omit Responses-native thinking before pi-ai turns it into a reasoning item.
 *
 * Text signatures stay intact so the serializer can preserve assistant phases,
 * and every non-Responses provider's content passes through unchanged.
 * @param context - converted request history; never mutated.
 * @returns the same history with Responses reasoning blocks removed.
 */
export function withoutResponsesReasoning(context: PiContext): PiContext {
  return {
    ...context,
    messages: context.messages.map(message => message.role !== 'assistant' || !RESPONSES_APIS.includes(message.api)
      ? message
      : { ...message, content: message.content.filter(block => block.type !== 'thinking') }),
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidPayload(): never {
  throw new LlmError(
    'pi-ai produced an unsupported Responses payload for replayEncryptedReasoning=false',
    'INVALID_REQUEST',
  )
}

/**
 * Remove reasoning items and their paired native ids from a serialized request.
 *
 * pi-ai serializes history itself, so the converted history above is not the
 * last word: this projection is what actually leaves the process. Native
 * `rs_*`/`msg_*`/`fc_*` ids can require an item the projection dropped, and
 * `reasoning.encrypted_content` is exactly the escalation the gateway refuses,
 * so both are removed while tool-call ids and assistant phases survive.
 * @param payload - pi-ai's serialized request body, received through `onPayload`.
 * @returns a new body; neither the payload nor durable history is mutated.
 * @throws {LlmError} When the SDK no longer supplies an object with an `input` array.
 */
export function withoutResponsesReplayPayload(payload: unknown): unknown {
  if (!record(payload)) return invalidPayload()
  const { input, include, ...body } = payload
  if (!Array.isArray(input) || (include !== undefined && !Array.isArray(include))) return invalidPayload()
  const items: unknown[] = input
  const projected = items.flatMap((item: unknown) => {
    if (!record(item)) return invalidPayload()
    if (item['type'] === 'reasoning') return []
    if (item['type'] === 'message' || item['type'] === 'function_call' || item['type'] === 'custom_tool_call') {
      const { id: _id, ...content } = item
      return [content]
    }
    return [item]
  })
  const retainedInclude: unknown[] = (include ?? []).filter((value: unknown) => value !== 'reasoning.encrypted_content')
  return {
    ...body,
    input: projected,
    ...retainedInclude.length === 0 ? {} : { include: retainedInclude },
  }
}
