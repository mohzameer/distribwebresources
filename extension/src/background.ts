/// <reference types="chrome" />
import {
  ApiError,
  NO_SETTINGS,
  api,
  clearCapture,
  getCapture,
  getSettings,
  isWebUrl,
  lookup,
  sameDocument,
  setCapture,
  type PanelMessage,
} from './shared';

/**
 * The service worker: notices which tabs were opened from the news site, offers
 * "Add to page notes" on those tabs only, and saves the highlights.
 */

const MENU_ID = 'add-highlight';

async function setup(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Add to page notes',
    contexts: ['selection'],
    visible: false,
  });
  await refreshMenu();
}

chrome.runtime.onInstalled.addListener(() => void setup());
chrome.runtime.onStartup.addListener(() => void setup());

// ---------------------------------------------------------------- capture

/**
 * Links on the site open in a new tab with rel="noopener noreferrer", so there is no
 * referrer to read; webNavigation still reports which tab a new one was opened from.
 */
chrome.webNavigation.onCreatedNavigationTarget.addListener(async ({ sourceTabId, tabId, url }) => {
  const settings = await getSettings();
  if (!settings || !isWebUrl(url)) return;
  const site = new URL(settings.siteUrl).origin;

  let source: chrome.tabs.Tab;
  try {
    source = await chrome.tabs.get(sourceTabId);
  } catch {
    return;
  }
  if (!source.url || new URL(source.url).origin !== site) return;
  if (new URL(url).origin === site) return; // the site's own pages are not articles

  await setCapture(tabId, { url, committed: false });

  // Confirm it is an article the site knows (an item, or a page with notes already) and
  // pick up its title and source. Links to a feed's homepage on /sources are not.
  try {
    const found = await lookup(url, settings);
    const known = found.item ?? found.page;
    const current = await getCapture(tabId);
    if (!current) return;
    if (!known) await clearCapture(tabId);
    else
      await setCapture(tabId, {
        ...current,
        title: found.page?.title ?? found.item?.title,
        sourceName: found.page?.sourceName ?? found.item?.sourceName,
        topic: found.page?.topic ?? found.item?.topic,
      });
  } catch {
    // Site unreachable: keep the capture; the panel retries the lookup when opened.
  }
});

const USER_NAVIGATION = new Set(['link', 'typed', 'auto_bookmark', 'generated', 'keyword', 'form_submit']);

/**
 * The first commit after a capture (redirects included) is the article itself. After that,
 * navigating the tab somewhere else releases it; reloads and in-page changes do not.
 */
chrome.webNavigation.onCommitted.addListener(async (d) => {
  if (d.frameId !== 0) return;
  const cap = await getCapture(d.tabId);
  if (!cap) return;

  const redirect = d.transitionQualifiers.some((q) => q === 'server_redirect' || q === 'client_redirect');
  if (!cap.committed || redirect) {
    await setCapture(d.tabId, { ...cap, committed: true, finalUrl: d.url });
    return;
  }
  const leaving =
    !sameDocument(d.url, cap.finalUrl ?? cap.url) &&
    !sameDocument(d.url, cap.url) &&
    (USER_NAVIGATION.has(d.transitionType) || d.transitionQualifiers.includes('forward_back'));
  if (leaving) await clearCapture(d.tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => void clearCapture(tabId));

// ---------------------------------------------------------------- context menu

/** Menu visibility is global, so it tracks whichever tab is active in the focused window. */
async function refreshMenu(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const visible = !!(tab?.id !== undefined && (await getCapture(tab.id)));
  try {
    await chrome.contextMenus.update(MENU_ID, { visible });
  } catch {
    // Menu not created yet (worker woke before onInstalled finished).
  }
}

chrome.tabs.onActivated.addListener(() => void refreshMenu());
chrome.windows.onFocusChanged.addListener(() => void refreshMenu());
chrome.storage.session.onChanged.addListener(() => void refreshMenu());

async function flash(tabId: number, text: string, color: string): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => void chrome.action.setBadgeText({ tabId, text: '' }), 1800);
}

/** The page's own selection keeps line breaks that info.selectionText flattens. */
async function readSelection(tabId: number, frameId: number | undefined, fallback: string): Promise<string> {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId ?? 0] },
      func: () => window.getSelection()?.toString() ?? '',
    });
    const text = typeof res?.result === 'string' ? res.result.trim() : '';
    return text || fallback;
  } catch {
    return fallback;
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || tab?.id === undefined) return;
  const tabId = tab.id;
  const cap = await getCapture(tabId);
  if (!cap) return void flash(tabId, '!', '#b42318');

  const quote = await readSelection(tabId, info.frameId, info.selectionText ?? '');
  if (!quote) return;

  try {
    await api('/api/notes/highlights', {
      method: 'POST',
      body: JSON.stringify({ url: cap.url, quote }),
    });
    await flash(tabId, '✓', '#ff6719');
    const msg: PanelMessage = { type: 'entries-changed', url: cap.url };
    chrome.runtime.sendMessage(msg).catch(() => {}); // no panel open is fine
  } catch (err) {
    await flash(tabId, '!', '#b42318');
    if (err instanceof ApiError && err.status === NO_SETTINGS) void chrome.runtime.openOptionsPage();
  }
});
