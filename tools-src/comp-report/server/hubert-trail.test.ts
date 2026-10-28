// Hubert's trail (server/hubert-trail.ts): what each tool result shows in the chat.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trailOf } from './hubert-trail.ts';

const ok = (content: unknown) => ({ type: 'tool_result', tool_use_id: 't', content: JSON.stringify(content) });

test('an email edit: one entry per field, one for the body', () => {
  const { changes } = trailOf('edit_email', ok({ applied: [], edit: {
    changes: [{ field: 'next_step', text: 'Call me Friday.' }, { field: 'consider', text: '' }],
    bodyEdits: [{ find: 'old words', replace: 'new words' }, { find: 'a', replace: 'b' }], length: 'full',
  } }));
  assert.deepEqual(changes.map((c) => [c.kind, c.field, c.label, c.before, c.after]), [
    ['email', 'next_step', 'Next step', null, 'Call me Friday.'],
    ['email', 'consider', 'Things to consider', null, null],
    ['email', 'body', 'Body (2 passages)', 'old words', 'new words'],
  ]);
});

test('errors and read-only tools leave no trail; the web leaves only https sources', () => {
  assert.deepEqual(trailOf('edit_comp', { type: 'tool_result', is_error: true, content: 'No.' }), { changes: [], sources: [] });
  assert.deepEqual(trailOf('get_numbers', ok({ comps: [] })), { changes: [], sources: [] });
  const { sources } = trailOf('web_search', ok({ results: [{ title: 'A', url: 'https://a.example/' }, { title: 'B', url: 'javascript:alert(1)' }] }));
  assert.deepEqual(sources, [{ title: 'A', url: 'https://a.example/' }]);
});
