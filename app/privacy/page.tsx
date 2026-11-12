import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy — News Notes',
  description: 'What the News Notes Chrome extension stores, and where.',
};

/**
 * Privacy policy for the News Notes extension, linked from its Chrome Web Store listing.
 * Public (excluded from the cookie gate in middleware.ts) because the store's reviewers
 * and anyone installing it must be able to read it without signing in.
 *
 * Keep this in step with extension/src: if the extension starts sending anything new,
 * this page has to say so before the next store upload.
 */
export default function Privacy() {
  return (
    <main className="privacy">
      <div className="top">
        <h1>News Notes privacy</h1>
      </div>
      <p className="meta">Applies to the News Notes Chrome extension · Updated 12 November 2026</p>

      <p>
        News Notes lets you save highlights and write notes on articles you open from Daily
        Engineering News. It is a personal tool: everything it saves goes to the news site you
        point it at, and nowhere else.
      </p>

      <h2>What it handles</h2>
      <ul>
        <li>
          <b>Article addresses.</b> When you open a link from the news site, the extension notes
          that tab&rsquo;s URL so it can offer highlighting there. When the side panel is open, it
          also checks the active tab&rsquo;s URL against the site to see whether you already have
          notes for it.
        </li>
        <li>
          <b>Passages you highlight.</b> Only text you select and choose to save with
          &ldquo;Add to page notes&rdquo;.
        </li>
        <li>
          <b>Notes you write</b> in the side panel, and unsaved drafts of them.
        </li>
        <li>
          <b>Settings</b>: the site address and the access token you enter.
        </li>
      </ul>
      <p>
        It does not read pages in the background, record your browsing history, or collect
        anything about tabs you did not open from the site beyond the check above.
      </p>

      <h2>Where it goes</h2>
      <ul>
        <li>
          Highlights, notes and article addresses are sent only to the site you set in the
          extension&rsquo;s options (over HTTPS for a live site), and stored in that
          site&rsquo;s database.
        </li>
        <li>
          Settings, drafts and the list of tabs opened from the site stay in your browser
          (Chrome extension storage) and never leave it.
        </li>
        <li>
          Nothing is sent to the extension&rsquo;s developer or to any third party. There is no
          analytics, advertising or tracking, and the extension loads no remote code or fonts.
        </li>
        <li>No data is sold or shared, and none is used for anything except your notes.</li>
      </ul>

      <h2>Keeping and deleting</h2>
      <p>
        Notes stay until you delete them. Delete a single highlight or note, or everything for an
        article, from the side panel or from <code>/noteorg</code> on the site. Removing the
        extension deletes its settings and drafts from your browser.
      </p>
    </main>
  );
}
