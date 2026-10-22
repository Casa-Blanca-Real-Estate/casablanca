// The home's photo header (New report 2, Edit details): the listing's photo
// with the address over it and the StreetEasy tag, in place of the old title
// row. While the page is read, the progress sits in the middle of it: a big
// spinner, the time so far, the thick bar and the part it's on.
import { cleanPhotoUrls } from '../../../engine/index.ts';
import type { LinkReadView } from '../../api.ts';
import { clock, KEEPS_GOING, ReadBar, SLOW_MS, stageAt, useElapsed } from '../workspace/ReadingNotice.tsx';
import { Info } from './Frame.tsx';
import '../../styles/reading.css';

/** The listing's first photo, kept as cleanPhotoUrls keeps them (StreetEasy's image hosts only). */
function photoOf(read: LinkReadView | null): string | null {
  const ex = read?.status === 'done' ? read.extract : null;
  if (!ex) return null;
  return cleanPhotoUrls([ex['heroImageUrl'], ...(Array.isArray(ex['photos']) ? ex['photos'] : [])])[0] ?? null;
}

export function HomeHero({ name, read, sourceTitle }: { name: string; read: LinkReadView; sourceTitle: string }) {
  const reading = read.status === 'queued' || read.status === 'running';
  const elapsed = useElapsed(reading ? [read] : []);
  const photo = photoOf(read);
  const slow = elapsed > SLOW_MS;
  return (
    <div
      className={`hh${photo ? ' photo' : ''}`}
      style={photo ? { backgroundImage: `url("${photo.replace(/"/g, '%22')}")` } : undefined}
      role={reading ? 'status' : undefined}
      aria-live={reading ? 'polite' : undefined}
    >
      <div className="hh-top">
        <h2 className="hh-name">{name}</h2>
        <span className="hh-source" title={sourceTitle}><span className="nr-dot" aria-hidden="true" />StreetEasy</span>
      </div>
      {reading && (
        <div className="hh-mid">
          <span className="hh-spin" aria-hidden="true" />
          <span className="hh-clock" aria-label={`Reading the home’s page, ${clock(elapsed)} so far`}>{clock(elapsed)}</span>
          <ReadBar elapsed={elapsed} />
          <div className="rd-foot">
            <span className="rd-stage">{stageAt(elapsed)}…</span>
            <span className="rd-hint">
              {slow ? 'Slower than usual' : 'Takes 1–2 min'}
              <Info
                label="About reading the home’s page"
                align="right"
                text={`A read stops at 3:00 if StreetEasy hasn’t answered, and says so: then try the link again, or type the details in. The details fill in by themselves when it’s read, with the listing’s photo here. ${KEEPS_GOING}`}
              />
            </span>
          </div>
        </div>
      )}
      {!reading && !photo && read.status === 'done' && <span className="hh-none">The page had no photo</span>}
    </div>
  );
}
