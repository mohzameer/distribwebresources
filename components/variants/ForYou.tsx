import { OpenLink } from '../ItemActions';
import { RotatingRecs } from '../RotatingRecs';
import { SourceLink } from '../SourceLink';
import type { ItemView } from '../ItemRow';

/** An item plus the one-line reason it is on the page. */
export type RecView = {
  item: ItemView;
  why: string;
  /**
   * Which kind of claim the chip is making, so the page can colour them apart. The two
   * that matter are `news` and `explore`: those rows are NOT there on merit, and a reader
   * deciding whether to click deserves to know that before they do.
   */
  whyKind: 'affinity' | 'similar' | 'editorial' | 'news' | 'explore';
};

export type ForYouData = {
  lead: RecView | null;
  picks: RecView[];
  /** Spare picks shipped with the page so a row can be rotated without a round trip. */
  bench: RecView[];
  because: { seedTitle: string; seedUrl: string; seedSaved: boolean; items: RecView[] }[];
  leavingSoon: { item: ItemView; daysLeft: number }[];
  /** When the reserved seats next change hands, so the page can say so. */
  rotation: { hours: number; nextLabel: string; news: number; explore: number };
  profile: {
    terms: string[];
    seedCount: number;
    savedCount: number;
    readCount: number;
    confidence: number;
    target: number;
  };
};

function Why({ rec }: { rec: RecView }) {
  return <span className={`why why-${rec.whyKind}`}>{rec.why}</span>;
}

function Byline({ item }: { item: ItemView }) {
  return (
    <p className="byline">
      By <SourceLink item={item} className="src" /> <span className="when">&middot; {item.ageLabel}</span>
      {item.hnUrl ? (
        <>
          {' '}
          <a className="hn" href={item.hnUrl} target="_blank" rel="noopener noreferrer">
            HN{item.hnPoints ? ` ${item.hnPoints}` : ''}
          </a>
        </>
      ) : null}
    </p>
  );
}

/**
 * The profile strip: the engine's entire state, in public.
 *
 * A recommender that cannot be questioned is indistinguishable from a random one, and on
 * a site with this little feedback the honest message is usually "not much yet" -- so the
 * strip says how many articles it learned from and how far it is actually moving today's
 * ranking, rather than implying a confidence it does not have.
 */
function ProfileStrip({ profile }: { profile: ForYouData['profile'] }) {
  if (profile.seedCount === 0) {
    return (
      <div className="profile-strip empty">
        <span className="ps-label">No profile yet</span>
        <p className="ps-note">
          Open or save a few articles and this page starts to shape itself around them. Until then it is
          ranked editorially, exactly like the front page.
        </p>
      </div>
    );
  }

  const percent = Math.round(profile.confidence * 100);
  return (
    <div className="profile-strip">
      <span className="ps-label">Your profile</span>
      <ul className="ps-terms">
        {profile.terms.map((term) => (
          <li key={term}>{term}</li>
        ))}
      </ul>
      <span className="ps-strength">
        {profile.savedCount} saved &middot; {profile.readCount} read &middot; {percent}% weight
        {percent < 100 ? ` (${profile.target - profile.seedCount} more to full)` : ''}
      </span>
    </div>
  );
}

/**
 * The recommended front page: one lead pick, a ranked column of the rest, then
 * nearest-neighbour blocks for the articles you kept, then what is about to be deleted.
 *
 * Deliberately NOT lane-shaped. The front page already organizes by topic; this one
 * organizes by reason, which is the only thing a recommender has to offer that an
 * editorial ranking does not.
 */
export function ForYou({ data }: { data: ForYouData }) {
  const { lead, picks, bench, because, leavingSoon, profile, rotation } = data;

  return (
    <>
      <ProfileStrip profile={profile} />

      <RotatingRecs lead={lead} picks={picks} bench={bench} />

      {because.map((block) => (
        <section className="band" key={block.seedUrl}>
          <div className="band-head">
            <h2>Because you {block.seedSaved ? 'saved' : 'read'}</h2>
            <span className="count">
              <a className="seed-link" href={block.seedUrl} target="_blank" rel="noopener noreferrer">
                {block.seedTitle}
              </a>
            </span>
          </div>
          <div className="neighbours">
            {block.items.map((rec) => (
              <article className={`story${rec.item.read ? ' read' : ''}`} key={rec.item.id}>
                <h3>
                  <OpenLink id={rec.item.id} url={rec.item.url} read={rec.item.read}>
                    {rec.item.title}
                  </OpenLink>
                </h3>
                <Byline item={rec.item} />
                <Why rec={rec} />
              </article>
            ))}
          </div>
        </section>
      ))}

      {leavingSoon.length > 0 ? (
        <section className="band">
          <div className="band-head">
            <h2>Leaving soon</h2>
            <span className="count">Strong, unread, and inside the last days of the 30-day window</span>
          </div>
          <div className="neighbours">
            {leavingSoon.map(({ item, daysLeft }) => (
              <article className={`story${item.read ? ' read' : ''}`} key={item.id}>
                <h3>
                  <OpenLink id={item.id} url={item.url} read={item.read}>
                    {item.title}
                  </OpenLink>
                </h3>
                <Byline item={item} />
                <span className="why why-editorial">
                  {daysLeft <= 0 ? 'Deleted at the next run' : `Deleted in ${daysLeft}d`}
                </span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <p className="note">
        Ranked by TF-IDF cosine similarity to the {profile.seedCount || 'zero'} article
        {profile.seedCount === 1 ? '' : 's'} you have saved or opened, blended with the editorial score
        and spread out with maximal marginal relevance so one story cannot appear five times. No model and
        no third-party API &mdash; the arithmetic runs during this page&rsquo;s render.
      </p>
      <p className="note">
        {rotation.news} of those slots are held for the aggregators &mdash; Hacker News, Lobsters and
        Slashdot take turns, because consumer-tech news scores too low to ever win a slot on merit
        &mdash; and {rotation.explore} go to subjects the profile has no vocabulary for, where the
        percentage is the share of the article&rsquo;s wording it has never seen before. Both sets
        change every {rotation.hours} hours, next at {rotation.nextLabel}. They exist so the page can
        still show you something it has no reason to believe you want: a recommender trained only on
        what it chose to show you has no way out of its own habits.
      </p>
    </>
  );
}
