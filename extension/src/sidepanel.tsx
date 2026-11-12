/// <reference types="chrome" />
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EntryList, type EntryData } from '../../components/notes/EntryList';
import { NoteEditor, type NoteDocJSON } from '../../components/notes/NoteEditor';
import {
  ApiError,
  NO_SETTINGS,
  api,
  capKey,
  getCapture,
  getSettings,
  isWebUrl,
  lookup,
  setCapture,
  type Capture,
  type Lookup,
  type PanelMessage,
  type Settings,
} from './shared';
import '../../components/notes/notes.css';
import './panel.css';

/**
 * The side panel follows the active tab of its window. On a tab opened from the site it
 * shows that article's highlights and notes and lets you write new ones; anywhere else it
 * says why there is nothing to do.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'setup' }
  | { kind: 'idle'; reason: 'not-web' | 'not-captured' }
  | { kind: 'error'; message: string; capture: Capture }
  | { kind: 'ready'; capture: Capture; data: Lookup };

const draftKey = (url: string) => `draft:${url.split('#')[0]}`;

function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tabId, setTabId] = useState<number | null>(null);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<NoteDocJSON | null>(null);
  const windowId = useRef<number | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async (id: number | null) => {
    const s = await getSettings();
    setSettings(s);
    if (!s) return setState({ kind: 'setup' });
    if (id === null) return setState({ kind: 'idle', reason: 'not-web' });

    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(id);
    } catch {
      return setState({ kind: 'idle', reason: 'not-web' });
    }
    let capture = await getCapture(id);

    if (!capture) {
      if (!isWebUrl(tab.url) || new URL(tab.url).origin === new URL(s.siteUrl).origin) {
        return setState({ kind: 'idle', reason: 'not-web' });
      }
      // Not opened from the site this session -- but it may be an article you already
      // took notes on (reopened from /noteorg, say). Then it counts.
      try {
        const found = await lookup(tab.url, s);
        if (!found.page) return setState({ kind: 'idle', reason: 'not-captured' });
        capture = {
          url: found.page.url,
          finalUrl: tab.url,
          committed: true,
          title: found.page.title,
          sourceName: found.page.sourceName,
          topic: found.page.topic,
        };
        await setCapture(id, capture);
      } catch {
        return setState({ kind: 'idle', reason: 'not-captured' });
      }
    }

    try {
      const data = await lookup(capture.url, s);
      setState({ kind: 'ready', capture, data });
    } catch (err) {
      setState({ kind: 'error', capture, message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // Track the active tab of this panel's window.
  useEffect(() => {
    void (async () => {
      const win = await chrome.windows.getCurrent();
      windowId.current = win.id ?? null;
      const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
      setTabId(tab?.id ?? null);
    })();
    const onActivated = (info: chrome.tabs.OnActivatedInfo) => {
      if (info.windowId === windowId.current) setTabId(info.tabId);
    };
    chrome.tabs.onActivated.addListener(onActivated);
    return () => chrome.tabs.onActivated.removeListener(onActivated);
  }, []);

  // Reload whenever the tab, its capture, its URL or its entries change.
  useEffect(() => {
    setComposing(false);
    setState({ kind: 'loading' });
    void load(tabId);
    if (tabId === null) return;

    const onUpdated = (id: number, change: chrome.tabs.OnUpdatedInfo) => {
      if (id === tabId && (change.url || change.status === 'complete')) void load(tabId);
    };
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if ((area === 'session' && capKey(tabId) in changes) || (area === 'local' && 'settings' in changes)) {
        void load(tabId);
      }
    };
    const onMessage = (msg: PanelMessage) => {
      if (msg?.type === 'entries-changed') void load(tabId);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.storage.onChanged.addListener(onStorage);
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [tabId, load]);

  // Restore an unsaved draft for this article, and open the editor on it.
  const articleUrl = state.kind === 'ready' || state.kind === 'error' ? state.capture.url : null;
  useEffect(() => {
    if (!articleUrl) return setDraft(null);
    void chrome.storage.local.get(draftKey(articleUrl)).then((got) => {
      const d = (got[draftKey(articleUrl)] as NoteDocJSON | undefined) ?? null;
      setDraft(d);
      if (d) setComposing(true);
    });
  }, [articleUrl]);

  const saveDraft = (doc: NoteDocJSON) => {
    if (!articleUrl) return;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      void chrome.storage.local.set({ [draftKey(articleUrl)]: doc });
    }, 400);
  };
  const dropDraft = async () => {
    clearTimeout(draftTimer.current);
    setDraft(null);
    if (articleUrl) await chrome.storage.local.remove(draftKey(articleUrl));
  };

  const reload = () => load(tabId);

  if (state.kind === 'loading') return <div className="panel-pad panel-muted">Loading…</div>;

  if (state.kind === 'setup') {
    return (
      <Empty title="Connect to your news site">
        <p>Set the site URL and your notes API token to start.</p>
        <button className="note-btn primary" onClick={() => void chrome.runtime.openOptionsPage()}>
          Open settings
        </button>
      </Empty>
    );
  }

  const site = settings ? new URL(settings.siteUrl) : null;
  const noteorg = site ? new URL('/noteorg', site).toString() : '#';

  if (state.kind === 'idle') {
    return (
      <Empty title="No article here">
        <p>
          Notes are for articles you open from{' '}
          <a href={site?.toString()} target="_blank" rel="noreferrer">
            {site?.host}
          </a>
          . Open one from there, then select a passage and right-click{' '}
          <b>Add to page notes</b>, or write a note here.
        </p>
        <a className="note-btn ghost" href={noteorg} target="_blank" rel="noreferrer">
          All notes ↗
        </a>
      </Empty>
    );
  }

  const cap = state.capture;
  const page = state.kind === 'ready' ? state.data.page : null;
  const item = state.kind === 'ready' ? state.data.item : null;
  const entries: EntryData[] = state.kind === 'ready' ? (state.data.entries as EntryData[]) : [];
  const title = page?.title ?? item?.title ?? cap.title ?? cap.url;
  const kicker = [page?.sourceName ?? item?.sourceName ?? cap.sourceName].filter(Boolean).join(' · ');

  return (
    <div className="panel">
      <header className="panel-head">
        {kicker ? <div className="panel-kicker">{kicker}</div> : null}
        <h1 className="panel-title">{title}</h1>
        <div className="panel-links">
          {page ? (
            <a href={new URL(`/noteorg/${page.id}`, site!).toString()} target="_blank" rel="noreferrer">
              Open in Notes ↗
            </a>
          ) : (
            <span>No notes yet</span>
          )}
        </div>
      </header>

      {state.kind === 'error' ? (
        <div className="panel-error">
          {state.message} <button className="note-btn quiet" onClick={() => void reload()}>Retry</button>
        </div>
      ) : null}

      {entries.length ? (
        <EntryList
          entries={entries}
          articleUrl={cap.finalUrl ?? cap.url}
          onUpdateNote={async (id, doc) => {
            await api(`/api/notes/entries/${id}`, { method: 'PATCH', body: JSON.stringify({ doc }) });
            await reload();
          }}
          onDelete={async (id) => {
            await api(`/api/notes/entries/${id}`, { method: 'DELETE' });
            await reload();
          }}
        />
      ) : state.kind === 'ready' ? (
        <p className="panel-muted panel-hint">
          Select a passage on the page and right-click <b>Add to page notes</b>, or write your own note below.
        </p>
      ) : null}

      <div className="panel-compose">
        {composing ? (
          <NoteEditor
            key={articleUrl ?? ''}
            initial={draft}
            onChange={saveDraft}
            onCancel={() => {
              setComposing(false);
              void dropDraft();
            }}
            onSave={async (doc) => {
              try {
                await api('/api/notes/entries', {
                  method: 'POST',
                  body: JSON.stringify({ url: cap.url, doc }),
                });
              } catch (err) {
                if (err instanceof ApiError && err.status === NO_SETTINGS) void chrome.runtime.openOptionsPage();
                throw err;
              }
              await dropDraft();
              setComposing(false);
              await reload();
            }}
          />
        ) : (
          <button className="note-btn primary panel-add" onClick={() => setComposing(true)}>
            + Add note
          </button>
        )}
      </div>
    </div>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel-pad panel-empty">
      <h1 className="panel-title">{title}</h1>
      {children}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
