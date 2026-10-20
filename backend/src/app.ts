import Fastify from 'fastify'
import cors from '@fastify/cors'
import type { FastifyReply, FastifyServerOptions, RouteHandlerMethod } from 'fastify'
import { loadDealsWithSummary } from './deals/loadDeals.js'
import type { LoadDealsOptions } from './deals/loadDeals.js'
import type { DealCollection, DealImportSummary } from './deals/types.js'
import { dealsQuerySchema } from './deals/queryDeals.js'
import { createCachedDealsQuery } from './cache/cachedDeals.js'
import { createRedisCache } from './cache/redisCache.js'
import { defaultCacheTtlSeconds, validateCacheTtlSeconds } from './cache/types.js'
import type { CacheOptions } from './cache/types.js'
import { rowIdSchema } from './deals/rowId.js'
import { createDealAnalyzer } from './analysis/analyzeDeal.js'
import type { AnalysisOptions } from './analysis/transport.js'
import type { SavedDeal } from './deals/types.js'

declare module 'fastify' {
  interface FastifyInstance {
    deals: DealCollection
    importSummary: Readonly<DealImportSummary> | null
    waitForDeals(): Promise<void>
  }
}

export function buildApp(options: FastifyServerOptions = {}, data: LoadDealsOptions & CacheOptions & AnalysisOptions & { csvPath?: string | URL; corsOrigins?: string[] } = {}) {
  const app = Fastify(options)
  app.register(cors, {
    origin: data.corsOrigins ?? [],
    methods: ['GET', 'HEAD'],
    exposedHeaders: ['Retry-After'],
  })
  const ttlSeconds = validateCacheTtlSeconds(data.redisCacheTtlSeconds ?? defaultCacheTtlSeconds)
  const cache = data.cache ?? (data.redisUrl ? createRedisCache(data.redisUrl, app.log) : undefined)
  let getDeals: ReturnType<typeof createCachedDealsQuery>
  let analyzeDeal: ReturnType<typeof createDealAnalyzer>
  let rowsById: Map<string, Readonly<SavedDeal>>
  let state: 'processing' | 'ready' | 'error' = 'processing'
  let importTask: Promise<void>
  let importError: unknown
  let closed = false

  app.decorate('deals', Object.freeze([]))
  app.decorate('importSummary', null)
  app.decorate('waitForDeals', async () => {
    await app.ready()
    await importTask
    if (state !== 'ready') throw importError ?? new Error('Server closed before import completed')
  })
  app.addHook('onReady', async () => {
    // Do not return this task: the HTTP server must serve processing responses.
    importTask = loadDealsWithSummary(app.log, data.csvPath, data).then((result) => {
      if (closed) return
      getDeals = createCachedDealsQuery(result.deals, cache, app.log, ttlSeconds)
      analyzeDeal = createDealAnalyzer(result.deals, cache, app.log, data)
      rowsById = new Map(result.deals.map((deal) => [deal.row_id, deal]))
      app.deals = result.deals
      app.importSummary = result.summary
      state = 'ready'
      cache?.start()
    }).catch((error: unknown) => {
      importError = error
      state = 'error'
      app.log.error('Deals import failed; data endpoints are unavailable')
    })
  })
  app.addHook('onClose', async () => { closed = true; cache?.close() })

  const unavailable = (reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store')
    if (state === 'error') return reply.code(503).send({ status: 'error', message: 'טעינת הנתונים נכשלה. נסו שוב מאוחר יותר.' })
    return reply.header('Retry-After', '2').code(202).send({ status: 'processing', message: 'הנתונים עדיין בעיבוד. נא להמתין.' })
  }

  app.get('/health', async () => ({ status: 'ok' }))
  app.get('/deals/summary', async (_request, reply) => state === 'ready' ? app.importSummary : unavailable(reply))
  app.get<{ Params: { row_id: string } }>('/deals/:row_id/analysis', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    const parsed = rowIdSchema.safeParse(request.params.row_id)
    if (!parsed.success) return reply.code(400).send({ error: 'מזהה הרשומה אינו תקין.' })
    if (state !== 'ready') return unavailable(reply)
    const deal = rowsById.get(parsed.data)
    if (!deal) return reply.code(404).send({ error: 'הרשומה לא נמצאה בנתונים שנקלטו.' })
    return analyzeDeal(deal)
  })

  const dealsHandler: RouteHandlerMethod = async (request, reply) => {
    const parsed = dealsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'פרמטרי החיפוש אינם תקינים',
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      })
    }
    if (state !== 'ready') return unavailable(reply)
    return getDeals(parsed.data)
  }
  app.get('/deals', dealsHandler)
  app.get('/deal', dealsHandler)

  return app
}
