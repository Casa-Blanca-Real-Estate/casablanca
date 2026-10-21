// The row's thumbnail: the listing's first photo when there is one (Dispatch 20's photos, linked, never
// hosted), else the hatched block. Decorative: the card, opened, has the photos with their alt text.
import { useState } from 'react';
import { photoImg } from './elements.ts';

export function RowThumb({ photo }: { photo: string | undefined }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (!photo || broken === photo) return <span className="so-thumb" aria-hidden="true" />;
  return <span className="so-thumb has" aria-hidden="true">{photoImg(photo, '', () => setBroken(photo))}</span>;
}
