/// <reference types="chrome" />
/**
 * Pieces shared by the background worker, the side panel and the options page.
 *
 * Captures live in chrome.storage.session under one key per tab (`cap:<tabId>`), so the
 * worker and the panel can both write without read-modify-write races, and the worker can
 * be suspended at any time without losing them. Settings live in chrome.storage.local.
 */

export type Settings = { siteUrl: string; token: string };

export type NoteItem = { id: string; title: string; url: string; sourceName: string; topic: string };
export type NotePage = { id: string; url: string; title: string; sourceName: string | null; topic: string | null };
export type NoteEntry = {
  id: string;
  kind: 'highlight' | 'note';
  quote: string | null;
  doc: { type: 'doc'; content?: unknown[] } | null;
  createdAt: string;
  updatedAt: string;
};
export type Lookup = { item: NoteItem | null; page: NotePage | null; entries: NoteEntry[] };

/** A tab opened from the site. `url` is the link as clicked: the key the API knows. */
export type Capture = {
  url: string;
  /** Where the tab ended up after redirects; navigating away from it releases the capture. */
  finalUrl?: string;
  committed: boolean;
  title?: string;
  sourceName?: string | null;
  topic?: string | null;
};

export const capKey = (tabId: number) => `cap:${tabId}`;

export async function getCapture(tabId: number): Promise<Capture | null> {
  const key = capKey(tabId);
  const got = await chrome.storage.session.get(key);
  return (got[key] as Capture | undefined) ?? null;
}

export async function setCapture(tabId: number, cap: Capture): Promise<void> {
  await chrome.storage.session.set({ [capKey(tabId)]: cap });
}

export async function clearCapture(tabId: number): Promise<void> {
  await chrome.storage.session.remove(capKey(tabId));
}

export async function getSettings(): Promise<Settings | null> {
  const { settings } = await chrome.storage.local.get('settings');
  const s = settings as Settings | undefined;
  return s?.siteUrl && s.token ? s : null;
}

/** ApiError status when the options page has not been filled in. */
export const NO_SETTINGS = -1;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}, settings?: Settings | null): Promise<T> {
  const s = settings ?? (await getSettings());
  if (!s) throw new ApiError(NO_SETTINGS, 'Set the site URL and token in the extension options.');
  let res: Response;
  try {
    res = await fetch(new URL(path, s.siteUrl), {
      ...init,
      headers: {
        authorization: `Bearer ${s.token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, `Could not reach ${new URL(s.siteUrl).host}.`);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const lookup = (url: string, settings?: Settings | null) =>
  api<Lookup>(`/api/notes/lookup?url=${encodeURIComponent(url)}`, {}, settings);

export const isWebUrl = (url: string | undefined): url is string =>
  !!url && /^https?:\/\//i.test(url);

/** Same document, ignoring the fragment (text-fragment links, in-page anchors). */
export function sameDocument(a: string, b: string): boolean {
  return a.split('#')[0] === b.split('#')[0];
}

export type PanelMessage = { type: 'entries-changed'; url: string };
