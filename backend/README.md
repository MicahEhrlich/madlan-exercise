# Backend

Simple Node.js server using Fastify and TypeScript with strict type checking.

```sh
pnpm install
pnpm dev
```

Check types with `pnpm typecheck`.

For production, compile the TypeScript and start the server:

```sh
pnpm build
pnpm start
```

The server defaults to `http://127.0.0.1:3000`. Override the address with the
`HOST` and `PORT` environment variables.

`GET /health` returns HTTP 200 with `{"status":"ok"}` when the server is running.
