/**
 * SSE transport hook — mounts MCP over an Express app.
 *
 *   GET  /mcp/sse              → opens an SSE stream, returns sessionId
 *   POST /mcp/messages?sessionId=… → client-to-server JSON-RPC frame
 *
 * Each SSE connection creates a fresh McpServer instance bound to the shared
 * dependency set. Sessions live until the client disconnects.
 *
 * Note: SSEServerTransport is marked deprecated in SDK 1.29 in favor of
 * StreamableHTTPServerTransport, but the dashboard + `claude mcp` clients
 * still target SSE. Migration is tracked for v3.1.
 */
import type { Router, Request, Response } from 'express';
import { Router as ExpressRouter } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  createKortextMcpServer,
  type KortextMcpDeps,
} from './server.ts';

const MESSAGES_PATH = '/mcp/messages';

export function mcpSseRouter(deps: KortextMcpDeps): Router {
  const r = ExpressRouter();
  const transports = new Map<string, SSEServerTransport>();

  r.get('/mcp/sse', async (_req: Request, res: Response) => {
    const transport = new SSEServerTransport(MESSAGES_PATH, res);
    transports.set(transport.sessionId, transport);
    transport.onclose = () => {
      transports.delete(transport.sessionId);
    };
    const server = createKortextMcpServer(deps);
    try {
      await server.connect(transport);
    } catch (err) {
      transports.delete(transport.sessionId);
      res.status(500).end(
        `mcp connect failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  r.post(MESSAGES_PATH, async (req: Request, res: Response) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
    if (!sessionId) {
      res.status(400).json({ error: 'missing_session_id' });
      return;
    }
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'unknown_session' });
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  return r;
}
