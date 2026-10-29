// DEV ONLY — the preinstalled Chromium for the walks, whichever build the cloud image carries
// (/opt/pw-browsers/chromium-<build>/chrome-linux*/chrome). Never 'playwright install'.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function chromePath(root = '/opt/pw-browsers') {
  const builds = existsSync(root) ? readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])) : [];
  for (const b of builds) {
    for (const sub of ['chrome-linux64', 'chrome-linux']) {
      const p = join(root, b, sub, 'chrome');
      if (existsSync(p)) return p;
    }
  }
  throw new Error(`No Chromium under ${root}`);
}
