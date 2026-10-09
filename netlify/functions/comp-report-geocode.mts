// /api/comp-report/geocode — see tools-src/comp-report/server/api/geocode.ts.
import { handleGeocode } from '../../tools-src/comp-report/server/api/geocode.ts';
import { productionGeocodeDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleGeocode(req, productionGeocodeDeps(req));

export const config = { path: '/api/comp-report/geocode' };
