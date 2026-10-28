// The row's thumbnail: the listing's first photo when there is one (Dispatch 20's photos, linked, never
// hosted), else the hatched block. Sort's rows, and the add-comps list's (className nr-thumb). Decorative: the card, opened, has the photos with their alt text.
import { useState } from 'react';
import { photoImg } from './elements.ts';

export function RowThumb({ photo, className = 'so-thumb' }: { photo: string | undefined; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (!photo || broken === photo) return <span className={className} aria-hidden="true" />;
  return <span className={`${className} has`} aria-hidden="true">{photoImg(photo, '', () => setBroken(photo))}</span>;
}
