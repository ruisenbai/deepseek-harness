/** Route-scoped Responses recovery through the installed pi-ai HTTP converter. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiProviderProfile } from '../src/config.ts'
import { withoutResponsesReasoning } from '../src/responses-replay.ts'
import { assemble } from './assemble.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'
import type { MockServer } from './mock-server.ts'
import { responsesHistory, responsesReasoningItem, responsesTextEvents } from './responses-fixtures.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await closeMockServers()
  vi.unstubAllEnvs()
})

/** One fully declared local route, without catalog or ambient-key dependencies. */
function profile(baseURL: string, replayEncryptedReasoning?: boolean): PiAiProviderProfile {
  return {
    api: 'openai-responses',
    baseURL: `${baseURL}/v1`,
    apiKeyEnv: 'PI_REPLAY_TEST_KEY',
    reasoning: 'high',
    models: ['responses-model', 'responses-next'].map(id => ({
      id,
      contextWindow: 8192,
      maxTokens: 1024,
      reasoningEfforts: { high: 'high' },
    })),
    ...replayEncryptedReasoning === undefined ? {} : { replayEncryptedReasoning },
  }
}

async function harness(providers: Record<string, PiAiProviderProfile>): Promise<Context> {
  vi.stubEnv('PI_REPLAY_TEST_KEY', 'test-key')
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmPiAi, { providers })
  return ctx
}

interface ResponsesRequest {
  input: Record<string, unknown>[]
  include?: string[]
  reasoning?: { effort: string }
}

function requestOf(server: MockServer, index = 0): ResponsesRequest {
  expect(server.requests[index]).toMatchObject({ input: expect.any(Array) as unknown[] })
  return server.requests[index] as ResponsesRequest
}

/** The replay omits opaque state without severing the already-executed tool call. */
function expectRecoveredHistory(request: ResponsesRequest): void {
  expect(request.input).toHaveLength(3)
  expect(request.input[0]).toEqual({
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text: 'Checking the saved result.', annotations: [] }],
    status: 'completed',
    phase: 'commentary',
  })
  const call = request.input[1]
  expect(call).toMatchObject({
    type: 'function_call',
    call_id: expect.any(String) as string,
    name: 'lookup',
    arguments: '{"key":"saved"}',
  })
  expect(request.input[2]).toEqual({
    type: 'function_call_output',
    call_id: call?.['call_id'],
    output: 'The saved result is available.',
  })
  expect(request.input.every(item => item['type'] !== 'reasoning' && item['id'] === undefined)).toBe(true)
  expect(request.include ?? []).not.toContain('reasoning.encrypted_content')
  expect(request.reasoning).toMatchObject({ effort: 'high' })
}

describe('Responses encrypted replay route policy', () => {
  it.each([undefined, true])('retains native replay when the route policy is %s', async (replayEncryptedReasoning) => {
    const server = await mockServer([{ events: responsesTextEvents() }])
    const ctx = await harness({ 'responses-test': profile(server.url, replayEncryptedReasoning) })
    const history = responsesHistory()
    const before = structuredClone(history)

    const result = await assemble(ctx, { provider: 'responses-test', model: 'responses-model', messages: history })

    expect(result.finish).toEqual({ kind: 'stop' })
    expect(server.paths).toEqual(['/v1/responses'])
    const request = requestOf(server)
    expect(request.input[0]).toEqual(responsesReasoningItem)
    expect(request.input[1]).toMatchObject({ type: 'message', id: 'msg_saved', phase: 'commentary' })
    expect(request.input[2]).toMatchObject({ type: 'function_call', id: 'fc_saved', call_id: 'call_lookup' })
    expect(request.input[3]).toMatchObject({ type: 'function_call_output', call_id: 'call_lookup' })
    expect(request.include).toContain('reasoning.encrypted_content')
    expect(history).toEqual(before)
  })

  it('continues a same-route tool exchange without old reasoning or paired native ids', async () => {
    const server = await mockServer([{ events: responsesTextEvents() }])
    const ctx = await harness({ 'responses-test': profile(server.url, false) })
    const history = responsesHistory()
    const before = structuredClone(history)

    const result = await assemble(ctx, { provider: 'responses-test', model: 'responses-model', messages: history })

    expect(result.finish).toEqual({ kind: 'stop' })
    expect(result.message.content).toEqual([{ type: 'text', text: 'Recovered.' }])
    expect(server.paths).toEqual(['/v1/responses'])
    const request = requestOf(server)
    expectRecoveredHistory(request)
    expect(request.input[1]?.['call_id']).toBe('call_lookup')
    expect(history).toEqual(before)
    expect(Object.isFrozen(history[0]?.source)).toBe(true)
  })

  it.each(['not-json', '{"type":"reasoning",', 'null'])('ignores an old signature that cannot be replayed: %s', async (thinkingSignature) => {
    const server = await mockServer([{ events: responsesTextEvents() }])
    const ctx = await harness({ 'responses-test': profile(server.url, false) })
    const history = responsesHistory({ thinkingSignature })
    const before = structuredClone(history)

    const result = await assemble(ctx, { provider: 'responses-test', model: 'responses-model', messages: history })

    expect(result.finish).toEqual({ kind: 'stop' })
    expectRecoveredHistory(requestOf(server))
    expect(server.paths).toEqual(['/v1/responses'])
    expect(history).toEqual(before)
  })

  it.each(['azure-openai-responses', 'openai-codex-responses'] as const)(
    'drops historical %s reasoning before cross-API conversion', async (api) => {
      const server = await mockServer([{ events: responsesTextEvents() }])
      const ctx = await harness({ 'responses-test': profile(server.url, false) })
      const result = await assemble(ctx, {
        provider: 'responses-test', model: 'responses-model', messages: responsesHistory({ api }),
      })

      expect(result.finish).toEqual({ kind: 'stop' })
      const request = requestOf(server)
      expect(request.input).toHaveLength(3)
      expect(request.input.some(item => JSON.stringify(item).includes('Old reasoning summary.'))).toBe(false)
      const call = request.input.find(item => item['type'] === 'function_call')
      const output = request.input.find(item => item['type'] === 'function_call_output')
      expect(call?.['call_id']).toEqual(expect.any(String))
      expect(output?.['call_id']).toBe(call?.['call_id'])
      expect(request.input.every(item => item['id'] === undefined)).toBe(true)
      expect(server.paths).toEqual(['/v1/responses'])
    },
  )

  it.each([
    ['different model', 'responses-test', 'responses-next', true],
    ['different model', 'responses-test', 'responses-next', false],
    ['different route', 'responses-other', 'responses-model', true],
    ['different route', 'responses-other', 'responses-model', false],
  ] as const)('keeps call/result correlation for a %s (%s/%s) with replay=%s', async (_case, provider, model, replayEncryptedReasoning) => {
    const server = await mockServer([{ events: responsesTextEvents() }])
    const ctx = await harness({
      'responses-test': profile(server.url),
      [provider]: profile(server.url, replayEncryptedReasoning),
    })
    const history = responsesHistory()
    const before = structuredClone(history)

    const result = await assemble(ctx, { provider, model, messages: history })

    expect(result.finish).toEqual({ kind: 'stop' })
    const request = requestOf(server)
    const call = request.input.find(item => item['type'] === 'function_call')
    const output = request.input.find(item => item['type'] === 'function_call_output')
    expect(call?.['call_id']).toEqual(expect.any(String))
    expect(output?.['call_id']).toBe(call?.['call_id'])
    expect(request.input.some(item => item['type'] === 'reasoning')).toBe(false)
    expect(request.input.some(item => item['id'] === 'fc_saved' || item['id'] === 'msg_saved')).toBe(false)
    if (!replayEncryptedReasoning) {
      expect(request.input).toHaveLength(3)
      expect(request.include ?? []).not.toContain('reasoning.encrypted_content')
    }
    expect(server.paths).toEqual(['/v1/responses'])
    expect(history).toEqual(before)
  })

  it('leaves a non-Responses assistant message untouched', () => {
    const context = {
      systemPrompt: [],
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'continue' }], timestamp: 0 },
        {
          role: 'assistant',
          api: 'anthropic-messages',
          provider: 'anthropic',
          model: 'claude',
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: 'stop',
          timestamp: 0,
          content: [{ type: 'thinking', thinking: 'Old reasoning summary.', thinkingSignature: 'synthetic' }],
        },
      ],
      tools: [],
    }
    expect(withoutResponsesReasoning(context as never).messages[1]).toBe(context.messages[1])
  })

  it('leaves non-Responses outgoing protocols unchanged', async () => {
    const server = await mockServer([{ events: textEvents }, { events: textEvents }])
    const history = responsesHistory()
    for (const replayEncryptedReasoning of [true, false]) {
      const ctx = await harness({
        'responses-test': { ...profile(server.url, replayEncryptedReasoning), api: 'openai-completions' },
      })
      const result = await assemble(ctx, { provider: 'responses-test', model: 'responses-model', messages: history })
      expect(result.finish).toEqual({ kind: 'stop' })
    }
    expect(server.paths).toEqual(['/v1/chat/completions', '/v1/chat/completions'])
    expect(server.requests[1]).toEqual(server.requests[0])
  })

  it.each([
    [400, 'invalid_encrypted_content', 'INVALID_REQUEST'],
    [400, 'unrelated invalid parameter', 'INVALID_REQUEST'],
    [401, 'unauthorized request', 'AUTH'],
    [429, 'rate limit', 'RATE_LIMIT'],
  ] as const)('does not hide a second attempt after HTTP %s: %s', async (status, message, code) => {
    const server = await mockServer([
      { status, body: JSON.stringify({ error: { message } }) },
      { events: responsesTextEvents('Unexpected hidden retry.') },
    ])
    const ctx = await harness({ 'responses-test': profile(server.url, false) })

    const result = await assemble(ctx, {
      provider: 'responses-test', model: 'responses-model', messages: responsesHistory(),
    })

    expect(result.finish).toMatchObject({ kind: 'error', failure: { code } })
    expectRecoveredHistory(requestOf(server))
    expect(server.paths).toEqual(['/v1/responses'])
  })

  it('reports a rejected native replay without silently retrying with less history', async () => {
    const server = await mockServer([
      { status: 400, body: JSON.stringify({ error: { code: 'invalid_encrypted_content', message: 'Replay cannot be decrypted' } }) },
      { events: responsesTextEvents('Unexpected hidden retry.') },
    ])
    const ctx = await harness({ 'responses-test': profile(server.url) })
    const result = await assemble(ctx, {
      provider: 'responses-test', model: 'responses-model', messages: responsesHistory(),
    })

    expect(result.finish).toMatchObject({ kind: 'error', failure: { code: 'INVALID_REQUEST' } })
    expect(requestOf(server).input[0]).toEqual(responsesReasoningItem)
    expect(server.paths).toEqual(['/v1/responses'])
  })
})
