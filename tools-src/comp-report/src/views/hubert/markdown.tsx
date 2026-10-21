// Hubert's text, with his markdown (Dispatch 15, NW-023). The parsing and
// its link rules are in markdown.ts. Hubert's replies only: the agent's own
// messages stay plain text.
import { useMemo } from 'react';
import { renderMarkdown } from './markdown.ts';

export function HubertText({ text }: { text: string }) {
  const nodes = useMemo(() => renderMarkdown(text), [text]);
  return <div className="hb-text hb-md">{nodes}</div>;
}
