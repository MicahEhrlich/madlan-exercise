import Fastify from 'fastify'
import type { FastifyServerOptions } from 'fastify'
import { loadDeals } from './deals/loadDeals.js'
import type { LoadDealsOptions } from './deals/loadDeals.js'
import type { DealCollection } from './deals/types.js'
import { dealsQuerySchema, queryDeals } from './deals/queryDeals.js'

declare module 'fastify' {
  interface FastifyInstance {
    deals: DealCollection
  }
}

export function buildApp(options: FastifyServerOptions = {}, data: LoadDealsOptions & { csvPath?: string | URL } = {}) {
  // Streaming a large CSV plus bounded API repairs can exceed Fastify's 10s
  // boot timeout. Repair requests enforce their own 10s/30s deadlines.
  const app = Fastify({ pluginTimeout: 0, ...options })

  app.decorate('deals', Object.freeze([]))
  app.addHook('onReady', async () => {
    app.deals = await loadDeals(app.log, data.csvPath, data)
  })

  app.get('/health', async () => ({ status: 'ok' }))

  app.get('/deals', async (request, reply) => {
    const parsed = dealsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'פרמטרי החיפוש אינם תקינים',
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      })
    }
    return queryDeals(app.deals, parsed.data)
  })

  return app
}
