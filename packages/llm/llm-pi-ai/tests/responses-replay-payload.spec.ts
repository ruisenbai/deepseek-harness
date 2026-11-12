import { describe, expect, it } from 'vitest'
import { withoutResponsesReplayPayload } from '../src/responses-replay.ts'

describe('Responses replay payload projection', () => {
  it('removes native reasoning and item ids without changing tool correlation, phases, or unrelated fields', () => {
    const payload = {
      model: 'gateway-model',
      store: false,
      reasoning: { effort: 'high', summary: 'auto' },
      include: ['reasoning.encrypted_content', 'message.output_text.logprobs'],
      input: [
        { role: 'user', content: 'continue' },
        { type: 'reasoning', id: 'rs_old', encrypted_content: 'opaque', summary: [] },
        { type: 'message', id: 'msg_old', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: 'Checking' }] },
        { type: 'function_call', id: 'fc_old', call_id: 'call_1', name: 'echo', arguments: '{"text":"hello"}' },
        { type: 'function_call_output', call_id: 'call_1', output: 'hello' },
        { type: 'custom_tool_call', id: 'ctc_old', call_id: 'call_2', name: 'patch', input: 'patch text' },
        { type: 'custom_tool_call_output', call_id: 'call_2', output: 'done' },
      ],
    }
    const original = structuredClone(payload)
    expect(withoutResponsesReplayPayload(payload)).toEqual({
      model: 'gateway-model',
      store: false,
      reasoning: { effort: 'high', summary: 'auto' },
      include: ['message.output_text.logprobs'],
      input: [
        { role: 'user', content: 'continue' },
        { type: 'message', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: 'Checking' }] },
        { type: 'function_call', call_id: 'call_1', name: 'echo', arguments: '{"text":"hello"}' },
        { type: 'function_call_output', call_id: 'call_1', output: 'hello' },
        { type: 'custom_tool_call', call_id: 'call_2', name: 'patch', input: 'patch text' },
        { type: 'custom_tool_call_output', call_id: 'call_2', output: 'done' },
      ],
    })
    expect(payload).toEqual(original)
  })

  it.each([undefined, [], ['reasoning.encrypted_content']])('omits an empty include field: %j', (include) => {
    expect(withoutResponsesReplayPayload({ model: 'm', input: [], include })).toEqual({ model: 'm', input: [] })
  })

  it.each([null, [], 'bad', {}, { input: 'bad' }, { input: [null] }, { input: [[]] }, { input: [], include: 'bad' }])(
    'refuses an unsupported SDK payload without returning it: %j', (payload) => {
      expect(() => withoutResponsesReplayPayload(payload)).toThrow(expect.objectContaining({ code: 'INVALID_REQUEST' }))
    },
  )
})
