// Identity's error returns, as the sign-in page reads them. The hashes are the
// shapes GoTrue sends (api/external.go redirectErrors, api/errors.go).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CANCELLED_NOTICE, FAILED_NOTICE, INVITE_ONLY_NOTICE, NOT_AUTHORISED_NOTICE, signInErrorNotice,
} from './sign-in-errors.ts';

test('our sign-up gate refusing an account reads as not authorised', () => {
  assert.equal(signInErrorNotice('#error=server_error&error_description=Failed+to+handle+signup+webhook'), NOT_AUTHORISED_NOTICE);
  assert.equal(signInErrorNotice('#error=server_error&error_description=Failed%20to%20handle%20signup%20webhook'), NOT_AUTHORISED_NOTICE);
});

test('invite-only registration, and a cancel at Google, each get their own wording', () => {
  assert.equal(signInErrorNotice('#error=access_denied&error_description=Signups+not+allowed+for+this+instance'), INVITE_ONLY_NOTICE);
  assert.equal(signInErrorNotice('#error=access_denied'), CANCELLED_NOTICE);
});

test('anything else gets fixed wording, never the text from the URL', () => {
  const notice = signInErrorNotice('#error=server_error&error_description=Call+555-0100+to+unlock+your+account');
  assert.equal(notice, FAILED_NOTICE);
  assert.ok(!notice.includes('555'));
});

test('tokens and the dashboard\'s tab hashes are not errors', () => {
  for (const hash of ['', '#', '#access_token=abc&token_type=bearer', '#invite_token=x', '#reports', '#errors']) {
    assert.equal(signInErrorNotice(hash), null, hash);
  }
});
