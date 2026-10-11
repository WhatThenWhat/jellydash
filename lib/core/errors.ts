export type JellyfinErrorKind = 'unreachable' | 'tls' | 'unauthorized' | 'timeout' | 'http' | 'bad_response';

export class JellyfinError extends Error {
  kind: JellyfinErrorKind;
  status?: number;
  constructor(kind: JellyfinErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'JellyfinError';
    this.kind = kind;
    this.status = status;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

const TLS_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_GET_ISSUER_CERT',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_UNTRUSTED'
]);

/** Map a thrown fetch error to a JellyfinError with a specific kind. */
export function classifyFetchError(error: unknown): JellyfinError {
  if (error instanceof JellyfinError) return error;
  const err = error as { name?: string; code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = err?.cause?.code ?? err?.code;
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return new JellyfinError('timeout', 'Request to the Jellyfin server timed out');
  }
  if (code && TLS_CODES.has(code)) {
    return new JellyfinError('tls', `TLS verification failed (${code}). Check the certificate or add a CA with EXTRA_CA_FILE.`);
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return new JellyfinError('unreachable', `Cannot reach the Jellyfin server (${code})`);
  }
  return new JellyfinError('unreachable', `Request failed: ${err?.cause?.message ?? err?.message ?? 'unknown error'}`);
}
