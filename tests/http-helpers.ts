/**
 * Test helpers for the HTTP engine suite: a local node:http server with
 * declarative routes and per-path hit counters. The engine under test
 * explicitly approves `127.0.0.1`, so integration tests exercise the REAL
 * guard/pinning pipeline against loopback only — no real network is touched.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  body: Buffer,
) => void | Promise<void>;

export interface TestServer {
  port: number;
  /** URL for a path on this server. */
  url(path: string): string;
  /** Total hits per pathname (set by any request). */
  hits: Map<string, number>;
  /** Mutable route table — tests may add routes after start. */
  routes: Record<string, RouteHandler>;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Starts a loopback-only test server. Routes are matched by exact pathname;
 * unknown paths return 404. Each request increments `hits[pathname]`.
 */
export async function startTestServer(
  routes: Record<string, RouteHandler>,
): Promise<TestServer> {
  const hits = new Map<string, number>();
  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1`);
      hits.set(url.pathname, (hits.get(url.pathname) ?? 0) + 1);
      const handler = routes[url.pathname];
      const body = await readBody(req);
      if (handler === undefined) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      try {
        await handler(req, res, url, body);
      } catch (error: unknown) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(`test route error: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    })().catch(() => {
      /* response already destroyed */
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no server address');
  return {
    port: address.port,
    hits,
    routes,
    url(path: string) {
      return `http://127.0.0.1:${address.port}${path}`;
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}

/** Engine config approving the loopback test server (explicit approval only). */
export const LOOPBACK_APPROVAL = [{ host: '127.0.0.1' }];
