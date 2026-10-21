// /.netlify/functions/agent-pics — the profile-pic roster (Dispatch 12). The
// logic and its tests are in tools-src/agent-pics/; docs/dispatch/12-profile-pic-tracker.md
// is the brief.
import { getStore } from '@netlify/blobs';
import { handlePics, AGENTS_STORE, FILES_STORE, type AgentBlobs } from '../../tools-src/agent-pics/api.ts';
import type { FileBlobs } from '../../tools-src/agent-pics/files.ts';

export default (req: Request) =>
  handlePics(req, {
    // Strong: the photo groups are written onto the CMS's record, so a write
    // must start from the record as it is, not a cached copy up to 60s old.
    store: getStore({ name: AGENTS_STORE, consistency: 'strong' }) as unknown as AgentBlobs,
    // Strong too: an upload asks which parts arrived, and must hear about the one it just sent.
    files: getStore({ name: FILES_STORE, consistency: 'strong' }) as unknown as FileBlobs,
    env: process.env,
    now: () => Date.now(),
  });
