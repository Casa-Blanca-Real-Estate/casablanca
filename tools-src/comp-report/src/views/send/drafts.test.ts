// Send's state (Dispatch 18): a draft per length, the subject as its own field,
// a copy and Mark as sent, and the footer's words.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EmailLength } from '../../../workspace/email.ts';
import type { SendState } from '../../../workspace/state.ts';
import { fingerprint } from '../workspace/model.ts';
import { afterCopy, bodyPrint, draftsOf, footOf, sentState, setSubject, subjectOf, withDraft } from './drafts.ts';

const EMAILS: Record<EmailLength, { subject: string; text: string }> = {
  full: { subject: '100 Barclay Street #17L: what the comps say', text: 'Hi Jordan,\n\nThe full email.' },
  short: { subject: '100 Barclay Street #17L: what the comps say', text: 'Hi Jordan,\n\nThe short email.' },
  text: { subject: '100 Barclay Street #17L: what the comps say', text: 'Hi Jordan, the text.' },
};
const emailFor = (len: EmailLength) => EMAILS[len];
const AT = '2026-10-21T12:00:00Z';

test('editing the subject stores send.subject and makes no body draft', () => {
  const send: SendState = { format: 'full' };
  const next = setSubject(send, 'Your comps for 17L', '2026-10-21');
  assert.deepEqual(next.subject, { value: 'Your comps for 17L', asOf: '2026-10-21' });
  assert.equal(next.drafts, undefined);
  assert.equal(next.draft, undefined);
  assert.equal(subjectOf(next, draftsOf(next, emailFor), EMAILS.full.subject), 'Your comps for 17L');
  assert.equal(subjectOf(send, {}, EMAILS.full.subject), EMAILS.full.subject, 'unset: the template’s');
});

test('the draft’s fingerprint is the body alone: a new subject leaves a draft current', () => {
  const draft = { body: 'Edited.', basedOn: bodyPrint(EMAILS.full.text), at: AT };
  const send = setSubject({ drafts: { full: draft } }, 'Another subject', '2026-10-21');
  assert.equal(draftsOf(send, emailFor).full!.basedOn, bodyPrint(emailFor('full').text), 'still current');
  assert.equal(bodyPrint('x'), fingerprint('x'));
});

test('an old single draft still shows its subject, and lands at the length it was edited from', () => {
  const legacy = { subject: 'My old subject', body: 'Edited short.', basedOn: fingerprint(`${EMAILS.short.subject}\n${EMAILS.short.text}`), at: AT, parentId: null };
  const send: SendState = { format: 'full', draft: legacy };
  const drafts = draftsOf(send, emailFor);
  assert.equal(drafts.short?.body, 'Edited short.');
  assert.equal(drafts.short?.basedOn, bodyPrint(EMAILS.short.text), 'current again, under the new fingerprint');
  assert.equal(drafts.full, undefined);
  assert.equal(subjectOf(send, drafts, EMAILS.full.subject), 'My old subject');
  // One that matches no email any more goes where it was open, out of date.
  const lost = draftsOf({ length: 'full', draft: { ...legacy, basedOn: 'gone' } }, emailFor);
  assert.equal(lost.full?.basedOn, 'gone');
});

test('editing Full and then Short keeps both drafts', () => {
  let send: SendState = { format: 'full' };
  send = withDraft(send, draftsOf(send, emailFor), 'full', { body: 'Full, edited.', basedOn: bodyPrint(EMAILS.full.text), at: AT });
  send = { ...send, format: 'short', length: 'short' };
  send = withDraft(send, draftsOf(send, emailFor), 'short', { body: 'Short, edited.', basedOn: bodyPrint(EMAILS.short.text), at: AT });
  assert.equal(send.drafts?.full?.body, 'Full, edited.');
  assert.equal(send.drafts?.short?.body, 'Short, edited.');
  // Back to the template on Short drops Short's alone.
  send = withDraft(send, draftsOf(send, emailFor), 'short', undefined);
  assert.equal(send.drafts?.full?.body, 'Full, edited.');
  assert.equal(send.drafts?.short, undefined);
  // An old single draft folds in as the others are written.
  const legacy = { subject: 's', body: 'Old text edit.', basedOn: fingerprint(`${EMAILS.text.subject}\n${EMAILS.text.text}`), at: AT };
  const folded = withDraft({ draft: legacy }, draftsOf({ draft: legacy }, emailFor), 'full', { body: 'New full.', basedOn: 'b', at: AT });
  assert.equal(folded.draft, undefined);
  assert.equal(folded.drafts?.text?.body, 'Old text edit.');
  assert.equal(folded.drafts?.full?.body, 'New full.');
});

test('Mark as sent works with no copy, stores sentAt and logs nothing; it records the tab last copied', () => {
  // No copiedAt: a hand copy. sentState is pure, so no copy log entry can come of it.
  const sent = sentState({ format: 'designed' }, 'designed', AT);
  assert.equal(sent.sentAt, AT);
  assert.equal(sent.format, 'designed');
  assert.equal(sent.copiedAt, undefined, 'a hand copy sets no copiedAt');
  // Copied as Short, then looked at Designed: Done says Short.
  const copied = afterCopy({ format: 'short' }, 'short', AT);
  assert.equal(copied.copiedFormat, 'short');
  assert.equal(sentState({ ...copied, format: 'designed' }, 'designed', AT).format, 'short');
});

test('the footer: Copy leads until a copy, then Mark as sent; a read-only report says why it has none', () => {
  assert.deepEqual(footOf({ off: false }), { note: 'Copy it, send it, then mark it as sent.', markSent: true, primary: 'copy' });
  assert.deepEqual(footOf({ off: false, copiedAt: AT }), { note: 'Copied. Sent it? Mark it as sent.', markSent: true, primary: 'sent' });
  assert.deepEqual(footOf({ off: true, copiedAt: AT }), { note: 'This report is read-only, so it can’t be marked as sent.', markSent: false, primary: 'copy' });
  assert.equal(footOf({ off: false, copiedAt: AT, sentAt: AT, sentDay: 'Oct 21, 2026' }).note, 'Marked as sent Oct 21, 2026.');
});
