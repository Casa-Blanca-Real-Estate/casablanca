// Two of the card's elements as plain functions (Dispatch 20), so a test can
// render them without JSX: a listing photo, linked with no referrer and loaded
// lazily, and a tag, always text (an agent's own tag is free text: React
// escapes it, and it's never set as markup).
import { createElement, type ReactElement, type SyntheticEvent } from 'react';

/** A listing photo: a plain <img>, no referrer sent to StreetEasy's host, loaded when it scrolls into view. */
export function photoImg(src: string, alt: string, onError?: (e: SyntheticEvent<HTMLImageElement>) => void): ReactElement {
  return createElement('img', { src, alt, referrerPolicy: 'no-referrer', loading: 'lazy', decoding: 'async', onError });
}

/** One tag on the card, as text. */
export function tagChip(tag: string): ReactElement {
  return createElement('span', { key: tag, className: 'so-tag' }, tag);
}
