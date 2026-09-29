// /.netlify/functions/feedback — the team Feedback button (assets/feedback.js).
// Posting is open; reading is for the dev notebook's developers only
// (GET /api/dev/notebook/feedback). See tools-src/feedback/feedback.ts.
import { getStore } from '@netlify/blobs';
import { FEEDBACK_STORE, handleFeedback, type FeedbackBlobs } from '../../tools-src/feedback/feedback.ts';

export default (req: Request) => handleFeedback(req, getStore(FEEDBACK_STORE) as unknown as FeedbackBlobs);
