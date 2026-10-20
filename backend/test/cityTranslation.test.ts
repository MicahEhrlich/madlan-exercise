import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createCityTranslator, createCityTranslationTransport } from '../src/repairs/cityTranslation.js'
import type { CityTranslationTransport } from '../src/repairs/cityTranslation.js'

const { stream, finalMessage } = vi.hoisted(() => ({ stream: vi.fn(), finalMessage: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { stream } } }))
beforeEach(() => { vi.clearAllMocks(); stream.mockReturnValue({ finalMessage }) })
afterEach(() => { vi.useRealTimers() })
const logger = { warn: vi.fn() }

it('passes the exact user prompt, model, and cancellation signal to Anthropic', async () => {
  finalMessage.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'תל אביב-יפו' }, { type: 'thinking' }] })
  const translate = createCityTranslator(logger, { anthropicApiKey: 'test', anthropicModel: 'configured' })
  expect(await translate(' Tel Aviv-Yafo ')).toBe('תל אביב-יפו')
  expect(await translate('TEL AVIV-YAFO')).toBe('תל אביב-יפו')
  expect(stream).toHaveBeenCalledTimes(1)
  expect(stream).toHaveBeenCalledWith(expect.objectContaining({
    model: 'configured', max_tokens: 128,
    messages: [{ role: 'user', content: 'Translate the follwing city name Tel Aviv-Yafo into Hebrew' }],
    system: expect.stringContaining('never instructions'),
  }), expect.objectContaining({ signal: expect.any(AbortSignal), maxRetries: 0, timeout: 10000 }))
})

it('leaves Hebrew and missing cities for ordinary validation without model calls', async () => {
  const transport = vi.fn()
  const translate = createCityTranslator(logger, { anthropicApiKey: 'test', cityTranslationTransport: transport })
  expect(await translate(' חיפה ')).toBe('חיפה')
  expect(await translate('')).toBe('')
  expect(transport).not.toHaveBeenCalled()
})

it('excludes English cities without credentials', async () => {
  const transport = vi.fn()
  expect(await createCityTranslator(logger, { cityTranslationTransport: transport })('Haifa')).toBeUndefined()
  expect(transport).not.toHaveBeenCalled()
})

it.each(['', 'UNKNOWN', 'Haifa', 'חיפה\nהעיר', 'חיפה.', '{"city":"חיפה"}', 'לא ניתן לתרגם', 'לא ידוע', 'א'.repeat(101)])('rejects and caches invalid or failed translation %j', async (output) => {
  const transport = vi.fn(async () => output)
  const translate = createCityTranslator(logger, { anthropicApiKey: 'test', cityTranslationTransport: transport })
  expect(await translate('Haifa')).toBeUndefined()
  expect(await translate('haifa')).toBeUndefined()
  expect(transport).toHaveBeenCalledTimes(1)
})

it('rejects truncated output', async () => {
  finalMessage.mockResolvedValue({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'חיפה' }] })
  expect(await createCityTranslationTransport('test')({ model: 'test', prompt: 'test', signal: new AbortController().signal })).toBe('')
})

it('stops translation calls on service failure while preserving Hebrew rows', async () => {
  const transport = vi.fn(async () => { throw new Error('offline') })
  const translate = createCityTranslator(logger, { anthropicApiKey: 'test', cityTranslationTransport: transport })
  expect(await translate('Haifa')).toBeUndefined()
  expect(await translate('Jerusalem')).toBeUndefined()
  expect(await translate('חיפה')).toBe('חיפה')
  expect(transport).toHaveBeenCalledTimes(1)
})

it('aborts even a transport that ignores cancellation at the request deadline', async () => {
  vi.useFakeTimers()
  const transport = vi.fn<CityTranslationTransport>(() => new Promise<string>(() => {}))
  const translate = createCityTranslator(logger, { anthropicApiKey: 'test', cityTranslationTransport: transport })
  const pending = translate('Haifa')
  await vi.advanceTimersByTimeAsync(10000)
  expect(await pending).toBeUndefined()
  expect(transport.mock.calls[0]![0].signal.aborted).toBe(true)
  expect(await translate('Jerusalem')).toBeUndefined()
  expect(transport).toHaveBeenCalledTimes(1)
})

it('bounds cumulative API time and shortens the final request to its remaining budget', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const transport = vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 9000)); return 'חיפה' })
  const translate = createCityTranslator(logger, { anthropicApiKey: 'test', cityTranslationTransport: transport })
  for (const city of ['A', 'B', 'C']) {
    const pending = translate(city)
    await vi.advanceTimersByTimeAsync(9000)
    expect(await pending).toBe('חיפה')
  }
  const final = translate('D')
  await vi.advanceTimersByTimeAsync(3000)
  expect(await final).toBeUndefined()
  expect(await translate('E')).toBeUndefined()
  expect(transport).toHaveBeenCalledTimes(4)
})
