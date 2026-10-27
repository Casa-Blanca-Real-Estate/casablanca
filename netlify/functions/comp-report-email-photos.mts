// POST /api/comp-report/email-photos — the Designed email's photos, copied into
// Casa's store at copy time. See tools-src/comp-report/server/api/email-photos.ts.
import { handleEmailPhotos } from '../../tools-src/comp-report/server/api/email-photos.ts';
import { productionEmailPhotoDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleEmailPhotos(req, productionEmailPhotoDeps(req));

export const config = { path: '/api/comp-report/email-photos' };
