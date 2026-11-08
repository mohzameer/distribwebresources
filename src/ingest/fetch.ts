import { hashBody } from './keys';
import type { FetchOutcome } from './types';

/**
 * Honest, contactable user agent. We deliberately do NOT spoof a browser: a fake Chrome UA
 * might get past a WAF bot rule today and break unpredictably tomorrow, and it makes us
 * look worse to the sources (arXiv, hnrss) that are being generous. This is why uber.com,
 * which 406s non-browser clients, is simply off the roster.
 */
export const USER_AGENT =
  'distribwebresources/1.0 (+https://github.com/zameermfm/distribwebresources; personal RSS reader)';

const TIMEOUT_MS = 15_000;
/** Dan Luu's feed is 6.6 MB and Zalando's 2.4 MB, so this needs real headroom. */
const MAX_BYTES = 8 * 1024 * 1024;

export type ConditionalHeaders = { etag?: string | null; lastModified?: string | null };

export async function fetchFeed(
  url: string,
  conditional: ConditionalHeaders = {},
  signal?: AbortSignal,
): Promise<FetchOutcome> {
  const first = await attempt(url, conditional, signal);
  if (first.status !== 'failed') return first;

  // Retry ONCE, and only for things that are plausibly transient. A 403/404/406 is a
  // config problem, not a blip -- retrying it just doubles the time wasted on a dead feed.
  if (!first.retryable) return strip(first);
  await sleep(2000 + Math.random() * 1000, signal);
  return strip(await attempt(url, conditional, signal));
}

type Attempt = FetchOutcome & { retryable?: boolean };

async function attempt(
  url: string,
  conditional: ConditionalHeaders,
  signal?: AbortSignal,
): Promise<Attempt> {
  const headers: Record<string, string> = {
    'user-agent': USER_AGENT,
    accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.1',
    'accept-encoding': 'gzip, deflate, br',
  };
  // Best-effort only: AWS and hnrss send Last-Modified, Cloudflare sends no validator at
  // all, and Medium-hosted feeds send only cache-control. Never assume support.
  if (conditional.etag) headers['if-none-match'] = conditional.etag;
  if (conditional.lastModified) headers['if-modified-since'] = conditional.lastModified;

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  try {
    const res = await fetch(url, { headers, signal: combined, redirect: 'follow' });

    if (res.status === 304) return { status: 'notmodified', httpStatus: 304 };

    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      return {
        status: 'failed',
        httpStatus: res.status,
        error: `HTTP ${res.status} ${res.statusText}`.trim(),
        phase: 'fetch',
        retryable,
      };
    }

    const body = await readCapped(res, MAX_BYTES);
    if (body === null) {
      return {
        status: 'failed',
        httpStatus: res.status,
        error: `response exceeded ${MAX_BYTES} bytes`,
        phase: 'fetch',
        retryable: false,
      };
    }

    return {
      status: 'ok',
      httpStatus: res.status,
      body,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      bodyHash: hashBody(body),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = /timed? ?out|aborted/i.test(message);
    return {
      status: 'failed',
      httpStatus: null,
      error: isTimeout ? `timeout after ${TIMEOUT_MS}ms` : message,
      phase: 'fetch',
      retryable: true,
    };
  }
}

/** Read the body while enforcing a hard size cap; returns null if the cap is exceeded. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > max) return null;

  if (!res.body) return await res.text();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function strip(a: Attempt): FetchOutcome {
  if (a.status === 'failed') {
    const { retryable: _retryable, ...rest } = a;
    return rest;
  }
  return a;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}
