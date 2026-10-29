// Hubert's text, with his markdown (Dispatch 15, NW-023). The parsing and
// its link rules are in markdown.ts. Hubert's replies only: the agent's own
// messages stay plain text. His progress notes get the inline part (HubertNote).
import { useMemo } from 'react';
import { renderInline, renderMarkdown, withoutData } from './markdown.ts';

/** His reply, without any raw data (withoutData): what's left, or nothing when it was all data. */
export function HubertText({ text }: { text: string }) {
  const nodes = useMemo(() => renderMarkdown(withoutData(text).text), [text]);
  return nodes.length ? <div className="hb-text hb-md">{nodes}</div> : null;
}

/** One of Hubert's progress notes: small and grey, with his inline markdown. */
export function HubertNote({ text }: { text: string }) {
  const kept = useMemo(() => withoutData(text).text, [text]);
  const nodes = useMemo(() => renderInline(kept), [kept]);
  return kept ? <p className="hb-progress">{nodes}</p> : null;
}
