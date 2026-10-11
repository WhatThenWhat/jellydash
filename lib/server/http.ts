import { NextRequest, NextResponse } from 'next/server';
import { ConflictError, JellyfinError, NotFoundError, ValidationError } from '../core/errors.ts';
import { getService, isSecureDeployment } from './runtime.ts';

export const SERVER_COOKIE = 'jd_server';

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ValidationError) return NextResponse.json({ message: error.message }, { status: 400 });
  if (error instanceof NotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
  if (error instanceof ConflictError) return NextResponse.json({ message: error.message }, { status: 409 });
  if (error instanceof JellyfinError) {
    const status = error.kind === 'timeout' ? 504 : 502;
    return NextResponse.json({ message: error.message, kind: error.kind }, { status });
  }
  console.error('Unhandled error:', error instanceof Error ? error.message : error);
  return NextResponse.json({ message: 'Internal error' }, { status: 500 });
}

type Handler<C> = (request: NextRequest, ctx: C) => Promise<Response> | Response;

/** Wrap a route handler so thrown errors become JSON responses without leaking internals. */
export function route<C = unknown>(handler: Handler<C>): (request: NextRequest, ctx: C) => Promise<Response> {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** The server chosen in the header switcher (cookie), falling back to the first registered server. */
export function selectedServer(request: NextRequest) {
  const svc = getService();
  const wanted = request.cookies.get(SERVER_COOKIE)?.value;
  const servers = svc.store.listServers();
  const server = servers.find((s) => s.id === wanted) ?? servers[0];
  if (!server) throw new NotFoundError('No Jellyfin server is registered yet. Add one under Servers.');
  return { svc, server, client: svc.client(server) };
}

export function serverCookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: isSecureDeployment(), path: '/', maxAge: 60 * 60 * 24 * 365 };
}

export async function jsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const b = await request.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  } catch {
    throw new ValidationError('Request body must be JSON');
  }
}
