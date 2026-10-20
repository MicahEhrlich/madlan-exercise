import { rm } from 'node:fs/promises'
import { afterEach, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { csv, fixture } from './fixtures.js'

const origin = 'https://frontend-rust-pi-90.vercel.app'
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true }))) })

it('allows configured origins on data, validation errors, and preflight responses', async () => {
  const { path, directory } = await fixture(csv([{}]))
  directories.push(directory)
  const app = buildApp({}, { csvPath: path, corsOrigins: [origin, 'http://localhost:5173'] })
  try {
    await app.waitForDeals()
    for (const allowedOrigin of [origin, 'http://localhost:5173']) {
      for (const url of ['/deals?page=1&count=20', '/deals/summary', '/deals?page=0']) {
        const response = await app.inject({ url, headers: { origin: allowedOrigin } })
        expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin)
        expect(response.headers.vary).toContain('Origin')
        expect(response.headers['access-control-expose-headers']).toBe('Retry-After')
        expect(response.statusCode).toBe(url.endsWith('page=0') ? 400 : 200)
      }
    }
    const preflight = await app.inject({ method: 'OPTIONS', url: '/deals', headers: {
      origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'content-type',
    } })
    expect(preflight.statusCode).toBe(204)
    expect(preflight.headers['access-control-allow-origin']).toBe(origin)
    expect(preflight.headers['access-control-allow-methods']).toBe('GET, HEAD')
    expect(preflight.headers['access-control-allow-headers']).toBe('content-type')
    const blocked = await app.inject({ url: '/deals', headers: { origin: origin + '.evil.example' } })
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined()
    expect((await app.inject('/health')).statusCode).toBe(200)
  } finally { await app.close() }
})

it('keeps processing and import failure responses readable across origins', async () => {
  const { path, directory } = await fixture('bad headers')
  directories.push(directory)
  const app = buildApp({}, { csvPath: path, corsOrigins: [origin] })
  try {
    const processing = await app.inject({ url: '/deals', headers: { origin } })
    expect(processing.statusCode).toBe(202)
    expect(processing.headers['access-control-allow-origin']).toBe(origin)
    expect(processing.headers['retry-after']).toBe('2')
    await expect(app.waitForDeals()).rejects.toThrow()
    const failure = await app.inject({ url: '/deals', headers: { origin } })
    expect(failure.statusCode).toBe(503)
    expect(failure.headers['access-control-allow-origin']).toBe(origin)
  } finally { await app.close() }
})

it('does not allow cross-origin access when no origins are configured', async () => {
  const { path, directory } = await fixture(csv([{}]))
  directories.push(directory)
  const app = buildApp({}, { csvPath: path })
  try {
    await app.waitForDeals()
    const response = await app.inject({ url: '/deals', headers: { origin } })
    expect(response.statusCode).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  } finally { await app.close() }
})
