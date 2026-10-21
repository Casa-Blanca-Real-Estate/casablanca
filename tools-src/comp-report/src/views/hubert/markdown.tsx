// Hubert's text, with his markdown (Dispatch 15, NW-023). The parsing and
// its link rules are in markdown.ts. Hubert's replies only: the agent's own
// messages stay plain text. His progress notes get the inline part (HubertNote).
import { useMemo } from 'react';
import { renderInline, renderMarkdown } from './markdown.ts';

export function HubertText({ text }: { text: string }) {
  const nodes = useMemo(() => renderMarkdown(text), [text]);
  return <div className="hb-text hb-md">{nodes}</div>;
}

/** One of Hubert's progress notes: small and grey, with his inline markdown. */
export function HubertNote({ text }: { text: string }) {
  const nodes = useMemo(() => renderInline(text), [text]);
  return <p className="hb-progress">{nodes}</p>;
}
