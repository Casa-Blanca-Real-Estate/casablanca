// GET /api/comp-report/email-photo?k=<key> — one of the Designed email's photos,
// public by design (the client's mail loads it), served only for a key the copy
// issued. See tools-src/comp-report/server/email-photos.ts.
import { handleEmailPhoto } from '../../tools-src/comp-report/server/api/email-photos.ts';
import { productionEmailPhotoStore } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleEmailPhoto(req, { emailPhotos: productionEmailPhotoStore() });

export const config = { path: '/api/comp-report/email-photo' };
