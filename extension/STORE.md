# Chrome Web Store submission

Everything the developer dashboard asks for, ready to paste. Publish as **Unlisted**:
installable from its link, never shown in search or browsing.

## Package

```bash
npm run ext:zip
```

Produces `extension/release/`:

| File | Dashboard field |
|---|---|
| `news-notes-<version>.zip` | Package → Upload new package |
| `icon-128.png` | Store listing → Store icon |
| `promo-440x280.png` | Store listing → Small promo tile |

Screenshots (at least one, **1280×800** or 640×400 PNG/JPEG) have to come from the real
extension: open an article from the site with the side panel showing a highlight and a
note, then capture the window at 1280×800.

**Every update:** bump `version` in `extension/manifest.json` first. The store rejects a
package whose version it has already seen.

## Store listing

**Name:** News Notes

**Summary** (≤132 chars):
Highlight passages and write notes on articles you open from Daily Engineering News.

**Description:**

> News Notes is the companion to Daily Engineering News, a personal engineering-news
> reader. Open an article from the site and News Notes lets you keep what you learn from
> it.
>
> • Select a passage, right-click, and choose "Add to page notes" to save it as a highlight.
> • Click the toolbar icon to open the side panel: every highlight and note for the article
>   you are reading, and a clean writing surface for your own notes, with headings,
>   quotes, lists, links and code, plus markdown shortcuts.
> • Drafts are kept while you write, even if you close the panel.
> • Everything is stored on your own Daily Engineering News site, where /noteorg lists and
>   searches all of it.
>
> News Notes only works with a Daily Engineering News site you run, and needs that site's
> address and access token, entered on the options page.

**Category:** Productivity → Tools
**Language:** English

## Privacy practices tab

**Single purpose:**
Save highlights and personal notes about articles opened from the user's own Daily
Engineering News site, and store them on that site.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `sidePanel` | The notes for the current article are shown and written in Chrome's side panel, beside the article. |
| `contextMenus` | Adds "Add to page notes" to the right-click menu for selected text, which saves the selection as a highlight. |
| `webNavigation` | Detects that a tab was opened from the user's news site (`onCreatedNavigationTarget`), since the site's links carry no referrer. Notes are only offered on such tabs. |
| `tabs` | Reads the URL of the tab a link was opened from, and of the active tab, to tell whether it is an article from the user's site. |
| `storage` | Keeps the site address, access token, unsaved drafts and which open tabs came from the site, locally in the browser. |
| `scripting` | On "Add to page notes", reads the page's current text selection with its line breaks (the context-menu text flattens them). Runs only on that click, in that tab. |
| `activeTab` | Grants the `scripting` call above access to the tab the user right-clicked in, only at that moment, instead of standing access to every site. |
| Host permission (optional) | Requested at runtime for the one site the user enters on the options page (their own news site, or localhost while developing), to send highlights and notes to its API. |

**Remote code:** No, I am not using remote code. All JavaScript is bundled in the package.

**Data usage**: tick these, since highlights, notes and article addresses are sent to the
user's configured site:

- Website content (highlighted passages and notes)
- Web history (addresses of articles opened from the site)
- Authentication information (the site access token, stored locally and sent only to that site)

Then certify all three statements: not sold to third parties; not used or transferred
for purposes unrelated to the single purpose; not used to determine creditworthiness or
for lending.

**Privacy policy URL:** https://xnews.mohzameer.com/privacy

## Distribution

**Visibility:** Unlisted
**Regions:** All regions (it only works with your site anyway)

## After it is approved

1. Install it from the listing link.
2. Remove the unpacked copy in `chrome://extensions`. A store install has a different
   extension ID, so both would otherwise run and each would add its own menu item.
3. Re-enter the site address and token on the new copy's options page; settings belong to
   each copy separately.
