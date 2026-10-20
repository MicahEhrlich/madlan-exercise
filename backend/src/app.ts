import Fastify from 'fastify'
import type { FastifyServerOptions } from 'fastify'
import { loadDeals } from './deals/loadDeals.js'
import type { LoadDealsOptions } from './deals/loadDeals.js'
import type { DealCollection } from './deals/types.js'

declare module 'fastify' {
  interface FastifyInstance {
    deals: DealCollection
  }
}

export function buildApp(options: FastifyServerOptions = {}, data: LoadDealsOptions & { csvPath?: string | URL } = {}) {
  const app = Fastify(options)

  app.decorate('deals', Object.freeze([]))
  app.addHook('onReady', async () => {
    app.deals = await loadDeals(app.log, data.csvPath, data)
  })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
