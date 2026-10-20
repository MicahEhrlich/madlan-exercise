import { beforeEach, expect, it, vi } from 'vitest'
import { createAnthropicTransport } from '../src/repairs/anthropicTransport.js'
import { candidate } from './repairFixtures.js'

const { construct, stream, finalMessage } = vi.hoisted(() => ({ construct: vi.fn(), stream: vi.fn(), finalMessage: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class {
  constructor(options: unknown) { construct(options) }
  messages = { stream }
} }))
beforeEach(() => {
  vi.clearAllMocks()
  stream.mockReturnValue({ finalMessage })
})

it('uses structured streaming output with retries and thinking disabled and forwards cancellation', async () => {
  finalMessage.mockResolvedValue({ content: [{ type: 'text', text: '{' }, { type: 'thinking', thinking: 'ignored' }, { type: 'text', text: '}' }], stop_reason: 'end_turn', usage: { input_tokens: 50, output_tokens: 20 } })
  const transport = createAnthropicTransport('test-key')
  const signal = new AbortController().signal
  const row = candidate()
  expect(await transport({ model: 'configured', candidates: [row], signal })).toEqual({ text: '{}', stopReason: 'end_turn', usage: { input_tokens: 50, output_tokens: 20 } })
  expect(construct).toHaveBeenCalledWith({ apiKey: 'test-key', maxRetries: 0, timeout: 10000 })
  expect(stream).toHaveBeenCalledWith(expect.objectContaining({
    model: 'configured', max_tokens: 2048, thinking: { type: 'disabled' },
    output_config: { format: { type: 'json_schema', schema: expect.any(Object) } },
    system: expect.stringContaining('You do not change the valid data.'),
  }), { signal, maxRetries: 0, timeout: 10000 })
  expect(JSON.parse(stream.mock.calls[0]![0].messages[0].content)).toEqual([{ original: row.original, prepared: row.prepared, reasons: row.reasons }])
})

it('uses bounded web search with citations for source lookups and includes the complete property profile', async () => {
  const row = candidate({ year_built: '' })
  finalMessage.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ auto_corrected: 0, rows_failed_to_correct: 1, auto_corrected_rows: [], failed_rows: [row.original], lookup_evidence: [] }) }],
    stop_reason: 'end_turn', usage: { input_tokens: 50, output_tokens: 20 },
  })
  const result = await createAnthropicTransport('test-key')({ model: 'configured', candidates: [row], signal: new AbortController().signal })
  expect(JSON.parse(result.text).failed_rows).toEqual([row.original])
  const params = stream.mock.calls[0]![0]
  expect(params.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }])
  expect(params.output_config).toBeUndefined()
  expect(params.system).toContain('total_floors, size_sqm, rooms, has_elevator, has_parking, has_balcony, and has_safe_room')
  expect(params.system).toContain("if not possible return 'unknown'")
  expect(JSON.parse(params.messages[0].content)[0].prepared).toEqual(row.prepared)
})

it('treats malformed lookup JSON as an invalid group, not a transport outage', async () => {
  finalMessage.mockResolvedValue({ content: [{ type: 'text', text: 'not JSON' }], stop_reason: 'end_turn', usage: { input_tokens: 50, output_tokens: 20 } })
  const result = await createAnthropicTransport('test-key')({ model: 'configured', candidates: [candidate({ neighborhood: '' })], signal: new AbortController().signal })
  expect(result.text).toBe('')
  expect(result.stopReason).toBe('end_turn')
})

it('does not parse or accept partial lookup responses', async () => {
  finalMessage.mockResolvedValue({ content: [{ type: 'text', text: '{' }], stop_reason: 'max_tokens', usage: { input_tokens: 50, output_tokens: 20 } })
  const result = await createAnthropicTransport('test-key')({ model: 'configured', candidates: [candidate({ year_built: '' })], signal: new AbortController().signal })
  expect(result.stopReason).toBe('max_tokens')
})
