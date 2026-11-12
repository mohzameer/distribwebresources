/// <reference types="chrome" />
import { api, getSettings, type Settings } from './shared';

const form = document.getElementById('form') as HTMLFormElement;
const siteInput = document.getElementById('siteUrl') as HTMLInputElement;
const tokenInput = document.getElementById('token') as HTMLInputElement;
const status = document.getElementById('status') as HTMLSpanElement;

function say(text: string, ok: boolean): void {
  status.textContent = text;
  status.className = ok ? 'ok' : 'bad';
}

function read(): Settings | null {
  try {
    const u = new URL(siteInput.value.trim());
    return { siteUrl: u.origin, token: tokenInput.value.trim() };
  } catch {
    say('That is not a valid URL.', false);
    return null;
  }
}

/** Host access is requested for just your site, and only when you save. */
async function grant(siteUrl: string): Promise<boolean> {
  const u = new URL(siteUrl);
  return chrome.permissions.request({ origins: [`${u.protocol}//${u.hostname}/*`] });
}

async function test(s: Settings): Promise<void> {
  say('Testing…', true);
  try {
    await api('/api/notes/ping', {}, s);
    say('Connected.', true);
  } catch (err) {
    say(err instanceof Error ? err.message : String(err), false);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const s = read();
  if (!s) return;
  if (!(await grant(s.siteUrl))) return say('Chrome did not grant access to that site.', false);
  await chrome.storage.local.set({ settings: s });
  siteInput.value = s.siteUrl;
  await test(s);
});

document.getElementById('test')!.addEventListener('click', async () => {
  const s = read();
  if (!s) return;
  if (!(await grant(s.siteUrl))) return say('Chrome did not grant access to that site.', false);
  await test(s);
});

void getSettings().then((s) => {
  siteInput.value = s?.siteUrl ?? 'https://xnews.mohzameer.com';
  tokenInput.value = s?.token ?? '';
});
