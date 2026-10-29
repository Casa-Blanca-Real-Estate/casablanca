// DEV/TEST ONLY — a scripted stand-in for Anthropic's streaming Messages API,
// so the assistant can be exercised with no key and no cost. The real SDK
// talks to it through baseURL. Used by the turn tests, and by hand:
//
//   node tools-src/comp-report/dev/fake-anthropic.ts 8791
//   CR_DEV_ANTHROPIC_BASE_URL=http://127.0.0.1:8791 npm run dev:comp-report
//
// With no script queued it answers from the conversation: a progress note and
// an echo of the agent's last message; a get_report call when the message
// asks which report this is, a get_numbers call when it mentions the numbers,
// and the tool's result once it comes back; and a refusal when the message
// starts with "refuse".
//
// On Send (2026-10-21): "change the next step to …" (or the headline, the
// subject, how I chose the comps, things to consider, signed) gets an
// edit_email call; a message asking for feedback gets a get_email call. A
// lines request (server/lines.ts) gets lines: a draft from the comps' own
// notes, with no figure of its own, or the agent's lines tidied — first
// letters capitalised, a full stop, "i" made "I".
//
// The trail (2026-10-28): "make 200 Chambers Street #10A 1st tier" (or 2nd,
// or out) gets an edit_comp call, "note on <comp>: …" sets its note, "<comp>
// floor is 12" corrects its floor; "search …" or "look up …" gets a
// web_search call. A message about "this one" or "this comp" (2026-10-29)
// gets a get_view call, and the reply names the comp on screen. "add <StreetEasy link>" gets an
// show_comp_link call (HB-8).
//
// A review request (Dispatch 25: one comp, structured output) gets Hubert's
// feedback on the agent's note or his take on the comp: see fakeCompReview.
//
// A writer request (CR-5: structured output, the report as JSON) gets a draft
// in the writer's shape, citing only the report's own figures — unless the
// agent's next step starts with "refuse" (a refusal) or "invent" (a draft
// with a number the report doesn't have, for QA to catch).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

type Block = Record<string, unknown>;

export interface Script {
  content: Block[];
  stopReason: string;
  model?: string;
  delayMs?: number;
  stopDetails?: Block;
}

export function sseEvents(script: Script): string[] {
  const model = script.model ?? 'claude-opus-5-5';
  const ev = (type: string, data: Block) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const out = [ev('message_start', {
    message: {
      id: 'msg_fake', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 },
    },
  })];
  script.content.forEach((block, index) => {
    if (block.type === 'thinking') {
      out.push(ev('content_block_start', { index, content_block: { type: 'thinking', thinking: '', signature: '' } }));
      if (block.thinking) out.push(ev('content_block_delta', { index, delta: { type: 'thinking_delta', thinking: block.thinking } }));
      out.push(ev('content_block_delta', { index, delta: { type: 'signature_delta', signature: block.signature } }));
    } else if (block.type === 'text') {
      out.push(ev('content_block_start', { index, content_block: { type: 'text', text: '' } }));
      for (const piece of String(block.text).match(/.{1,8}/gs) ?? []) {
        out.push(ev('content_block_delta', { index, delta: { type: 'text_delta', text: piece } }));
      }
    } else if (block.type === 'tool_use') {
      out.push(ev('content_block_start', { index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } }));
      out.push(ev('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input ?? {}) } }));
    }
    out.push(ev('content_block_stop', { index }));
  });
  out.push(ev('message_delta', {
    delta: { stop_reason: script.stopReason, stop_sequence: null, ...(script.stopDetails ? { stop_details: script.stopDetails } : {}) },
    usage: { output_tokens: 300 },
  }));
  out.push(ev('message_stop', {}));
  return out;
}

let toolCalls = 0;

/** A writer draft (CR-5) from the report in the request, citing only what the report gives. */
export function fakeWriterDraft(body: Block): Script {
  const messages = (body.messages ?? []) as Array<{ role: string; content: Array<Block> }>;
  const text = messages[0]?.content.map((b) => String(b.text ?? '')).join('') ?? '';
  const report = JSON.parse(/<report>\n([\s\S]*)\n<\/report>/.exec(text)?.[1] ?? '{}') as {
    home?: { name?: string };
    headline_facts?: Array<{ id: string; value: string }>;
    comps?: Array<{ id: string; facts?: Record<string, string>; against_the_home?: string[]; agent_note?: string | null }>;
    agent_stated?: { how_the_comps_were_chosen?: string; next_step?: string };
    length?: string;
  };
  const fact = (id: string) => report.headline_facts?.find((f) => f.id === id)?.value;
  const home = report.home?.name ?? 'the home';
  const next = report.agent_stated?.next_step ?? '';
  if (/^\s*refuse\b/i.test(next)) {
    return { content: [], stopReason: 'refusal', stopDetails: { type: 'refusal', category: null, explanation: null }, delayMs: 5 };
  }
  const headlines = [
    fact('range.low') && fact('range.high')
      ? `The closest sales put ${home} at ${fact('range.low_per_sqft')} to ${fact('range.high_per_sqft')}, ${fact('range.low')} to ${fact('range.high')}.`
      : `The closest sales have a median of ${fact('sold.median_per_sqft') ?? 'a price per foot we can’t give yet'}.`,
    fact('anchor.per_sqft') ? `The closest comp sold at ${fact('anchor.per_sqft')}.` : `Here’s what the comps show for ${home}.`,
  ];
  if (/^\s*invent\b/i.test(next)) headlines[0] = `${home} is worth about $9.87M.`;
  const full = report.length === 'full';
  const draft = {
    headlines,
    chosen: full ? report.agent_stated?.how_the_comps_were_chosen ?? 'I kept to the comps closest to the home.' : '',
    comps: report.length === 'text' ? [] : (report.comps ?? []).map((c) => ({
      id: c.id,
      lines: [
        c.facts?.days_on_the_market ? `Took ${c.facts.days_on_the_market} days to get a deal.` : 'A close match.',
        ...(full && c.against_the_home?.[0] ? [`${c.against_the_home[0][0]!.toUpperCase()}${c.against_the_home[0].slice(1)}.`] : []),
      ],
    })),
    consider: [],
    next_step: next || 'Let me know when you’d like to talk it through.',
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(draft) }],
    stopReason: 'end_turn',
    delayMs: 5,
  };
}

/** Lines for Send (server/lines.ts): drafted from the comps' notes, or tidied. */
export function fakeLines(body: Block): Script {
  const messages = (body.messages ?? []) as Array<{ role: string; content: Array<Block> }>;
  const text = messages[0]?.content.map((b) => String(b.text ?? '')).join('') ?? '';
  const sentence = (s: string) => {
    const t = s.trim().replace(/\s+/g, ' ').replace(/\bi\b/g, 'I');
    return t ? `${t[0]!.toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}` : '';
  };
  let out = { chosen: '', consider: '', next_step: '' };
  const lines = /<lines>\n([\s\S]*)\n<\/lines>/.exec(text);
  if (lines) {
    const got = (JSON.parse(lines[1]!) as { lines: typeof out }).lines;
    out = { chosen: sentence(got.chosen), consider: got.consider.split('\n').map(sentence).filter(Boolean).join('\n'), next_step: sentence(got.next_step) };
  } else {
    const report = JSON.parse(/<report>\n([\s\S]*)\n<\/report>/.exec(text)?.[1] ?? '{}') as {
      comps?: Array<{ agent_note?: string | null; tier?: string }>;
      agent_stated?: { how_the_comps_were_chosen?: string; things_to_consider?: string; next_step?: string };
    };
    const notes = (report.comps ?? []).map((c) => c.agent_note?.replace(/\d[\d,.]*/g, '').trim()).filter((n): n is string => Boolean(n));
    out = {
      chosen: report.agent_stated?.how_the_comps_were_chosen ? '' : 'I kept to the sales I tiered 1st, the closest to the home, and used the rest as a check.',
      consider: report.agent_stated?.things_to_consider ? '' : notes.slice(0, 2).map(sentence).join('\n'),
      next_step: '',
    };
  }
  return { content: [{ type: 'text', text: JSON.stringify(out) }], stopReason: 'end_turn', delayMs: 5 };
}

/**
 * Hubert on one comp (server/comp-review.ts): feedback on the agent's note, or his take, from the comp
 * in the request, citing only its figures. A note starting "invent" gets a point with a figure the comp
 * doesn't have (for the grounding to drop); the comp's first flagged check makes it weak.
 */
export function fakeCompReview(body: Block): Script {
  const messages = (body.messages ?? []) as Array<{ role: string; content: Array<Block> }>;
  const text = messages[0]?.content.map((b) => String(b.text ?? '')).join('') ?? '';
  const input = JSON.parse(/<comp_review>\n([\s\S]*)\n<\/comp_review>/.exec(text)?.[1] ?? '{}') as {
    comp?: { name?: string; status?: string; checks?: string[]; against_the_home?: string[] };
    agent?: { note?: string | null; tags?: string[] };
    agent_asks?: string;
  };
  const name = input.comp?.name ?? 'This comp';
  const check = input.comp?.checks?.[0];
  const weak = { weak: Boolean(check), weak_reason: check ?? '' };
  if (input.agent) {
    const note = input.agent.note ?? '';
    const out = {
      holds_up: [`You name what makes ${name} comparable.`],
      look_again: [
        input.comp?.against_the_home?.[0] ? `Weigh this too: it is ${input.comp.against_the_home[0]}.` : 'Say how it differs from the home.',
        ...(/^\s*invent\b/i.test(note) ? ['It sold for $9,876,543, well above the rest.'] : []),
      ],
      ...weak,
    };
    return { content: [{ type: 'text', text: JSON.stringify(out) }], stopReason: 'end_turn', delayMs: 5 };
  }
  if (/^\s*refuse\b/i.test(input.agent_asks ?? '')) {
    return { content: [], stopReason: 'refusal', stopDetails: { type: 'refusal', category: null, explanation: null }, delayMs: 5 };
  }
  const out = {
    reasoning: `${name} is ${input.comp?.status ?? 'a sale'} nearby.${input.comp?.against_the_home?.[0] ? ` It is ${input.comp.against_the_home[0]}.` : ''}${input.agent_asks ? ' You told me something the data doesn’t show, and I took it into account.' : ''} It sold for $9,876,543.`,
    tier: check ? 'secondary' : 'primary',
    tier_why: check ? 'A flagged comp is context at most.' : 'It matches the home on what moves price.',
    ...weak,
  };
  return { content: [{ type: 'text', text: JSON.stringify(out) }], stopReason: 'end_turn', delayMs: 5 };
}

/**
 * Hubert on the client's words (server/client-words.ts): feedback on the agent's overview or paragraph, or
 * his draft of a comp's paragraph, from the input, citing only its figures. A draft asked to change says so;
 * a draft always carries one sentence with a figure the input doesn't hold, for the grounding to drop.
 */
export function fakeClientWords(body: Block): Script {
  const messages = (body.messages ?? []) as Array<{ role: string; content: Array<Block> }>;
  const text = messages[0]?.content.map((b) => String(b.text ?? '')).join('') ?? '';
  const input = JSON.parse(/<client_words>\n([\s\S]*)\n<\/client_words>/.exec(text)?.[1] ?? '{}') as {
    comp?: { name?: string; status?: string; against_the_home?: string[]; agent_note?: string | null };
    agent_paragraph?: string;
    agent_overview?: { headline?: string };
    agent_asks?: string;
  };
  const props = (((body.output_config as Block | undefined)?.format as { schema?: { properties?: Block } } | undefined)?.schema?.properties) ?? {};
  if ('paragraph' in props) {
    const name = input.comp?.name ?? 'This home';
    const against = input.comp?.against_the_home?.[0];
    const note = input.comp?.agent_note?.replace(/\d[\d,.]*/g, '').trim();
    const paragraph = [
      `${name.split(' #')[0]} is a fair comparison for your home.`,
      against ? `It is ${against}.` : '',
      note ? `In my notes: ${note.replace(/[.]$/, '')}.` : '',
      input.agent_asks ? 'As you asked, I changed that.' : '',
      'It would sell for $9,876,543 today.',
    ].filter(Boolean).join(' ');
    return { content: [{ type: 'text', text: JSON.stringify({ paragraph }) }], stopReason: 'end_turn', delayMs: 5 };
  }
  const overview = Boolean(input.agent_overview);
  const out = {
    works: [overview ? 'Your headline says what the comps show in plain words.' : 'You compare it to the client’s home, not just describe it.'],
    unclear: [overview ? 'Say in one more word why you kept to those comps.' : 'Say what the difference means for the price.'],
    unsupported: input.comp?.against_the_home?.[0] ? [`The facts say it is ${input.comp.against_the_home[0]}: say so.`] : [],
    off_voice: ['Drop “stunning”: the house voice is plain.', 'It sold for $9,876,543, which is a figure you never gave.'],
  };
  return { content: [{ type: 'text', text: JSON.stringify(out) }], stopReason: 'end_turn', delayMs: 5 };
}

const FIELD_WORDS: Record<string, string> = {
  'next step': 'next_step', headline: 'headline', subject: 'subject', 'how i chose the comps': 'chosen',
  'things to consider': 'consider', signed: 'signed', 'sign-off': 'signed',
};

/**
 * What the fake says after a tool, in words, as Hubert would: never the tool's
 * raw output (Kimani, 2026-10-29: no JSON in the chat). Tests that need the
 * result itself read the request the fake was sent.
 */
function afterTool(name: string, result: Block): string {
  if (result.is_error) return `That didn’t work: ${String(result.content)} (fake Messages API)`;
  let got: Record<string, unknown> = {};
  try {
    got = JSON.parse(String(result.content)) as Record<string, unknown>;
  } catch {
    /* plain text */
  }
  const fake = ' (fake Messages API)';
  if (name === 'edit_comp') return `Done: ${String(got.applied ?? 'the comp is changed')}.${fake}`;
  if (name === 'edit_email') return `Done: I changed the email.${fake}`;
  if (name === 'show_comp_link') return `Here it is on StreetEasy. Open the link and check it’s the right unit, that it sold (not just an asking price), and that it’s current; then add it from the card. It lands on Sort untiered.${fake}`;
  if (name === 'get_view') {
    const open = got.open_comp as { comp?: string; tier?: string } | null | undefined;
    return open?.comp
      ? `You're looking at ${open.comp}, ${String(open.tier ?? 'not sorted yet')}.${fake}`
      : `I can't tell which comp you mean: which one?${fake}`;
  }
  if (name === 'web_search' || name === 'read_page') {
    const first = (got.results as Array<{ title?: string; text?: string }> | undefined)?.[0];
    return first ? `From the web: ${first.text ?? first.title}. Check it on the listing before a client reads it.${fake}` : `The web had nothing on that.${fake}`;
  }
  if (name === 'get_numbers') {
    const comps = (got.comps as unknown[] | undefined)?.length ?? 0;
    return `I read the numbers: ${comps} comp${comps === 1 ? '' : 's'} in the report.${fake}`;
  }
  if (name === 'get_email') return got.on_send ? `I read the email: “${String(got.subject ?? '')}”.${fake}` : `The email isn’t there yet.${fake}`;
  return `I looked at the report: ${String(got.title ?? 'this one')}.${fake}`;
}

function echo(body: Block): Script {
  const format = (body.output_config as Block | undefined)?.format as { schema?: { properties?: Block } } | undefined;
  if (format?.schema?.properties && 'weak' in format.schema.properties) return fakeCompReview(body);
  if (format?.schema?.properties && ('paragraph' in format.schema.properties || 'off_voice' in format.schema.properties)) return fakeClientWords(body);
  if (format?.schema?.properties && !('headlines' in format.schema.properties)) return fakeLines(body);
  if (format) return fakeWriterDraft(body);
  const messages = (body.messages ?? []) as Array<{ role: string; content: Array<Block> }>;
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const result = last?.content.find((b) => b.type === 'tool_result');
  if (result) {
    const asked = [...messages].reverse().find((m) => m.role === 'assistant')?.content.find((b) => b.id === result.tool_use_id);
    const name = String(asked?.name ?? 'get_report');
    return { content: [{ type: 'text', text: afterTool(name, result) }], stopReason: 'end_turn', delayMs: 15 };
  }
  const said = last?.content.filter((b) => b.type === 'text').map((b) => String(b.text)).join(' ') ?? '';
  if (/^\s*refuse\b/i.test(said)) {
    return { content: [], stopReason: 'refusal', stopDetails: { type: 'refusal', category: null, explanation: null }, delayMs: 15 };
  }
  const tool = (name: string, input: Block, note: string): Script => ({
    content: [
      { type: 'thinking', thinking: note, signature: 'fake-signature' },
      { type: 'tool_use', id: `toolu_fake_${++toolCalls}_${Date.now()}`, name, input },
    ],
    stopReason: 'tool_use',
    delayMs: 15,
  });
  const tier = /^\s*(?:make|put|tier) (.+?) (?:as )?(1st|2nd|first|second|out)(?: tier)?\.?$/i.exec(said);
  if (tier) {
    const t = /^(1st|first)$/i.test(tier[2]!) ? 'primary' : /^(2nd|second)$/i.test(tier[2]!) ? 'secondary' : 'excluded';
    return tool('edit_comp', { comp: tier[1]!.trim(), changes: { tier: t } }, 'Tiering the comp as the agent said (fake API).');
  }
  const note = /^\s*note on (.+?):\s*([\s\S]+)$/i.exec(said);
  if (note) return tool('edit_comp', { comp: note[1]!.trim(), changes: { note: note[2]!.trim() } }, 'Putting the agent’s note in (fake API).');
  const floor = /^\s*(.+?) (?:is on|floor is) (?:floor )?(\d+)\.?$/i.exec(said);
  if (floor) return tool('edit_comp', { comp: floor[1]!.trim(), changes: { floor: Number(floor[2]) } }, 'Correcting the floor (fake API).');
  const link = /^\s*add (https:\/\/(?:www\.)?streeteasy\.com\/\S+)/i.exec(said);
  if (link) return tool('show_comp_link', { url: link[1]! }, 'Showing the sale by its StreetEasy link, for the agent to check (fake API).');
  if (/\bthis (?:one|comp)\b/i.test(said)) return tool('get_view', {}, 'Checking which comp is on screen (fake API).');
  const search = /^\s*(?:search|look up)\b:?\s*([\s\S]+)$/i.exec(said);
  if (search) return tool('web_search', { query: search[1]!.trim() }, 'Searching the web (fake API).');
  const change = /^\s*change (?:the |my )?(next step|headline|subject|how i chose the comps|things to consider|signed|sign-off) to:?\s*([\s\S]+)$/i.exec(said);
  if (change) {
    return {
      content: [
        { type: 'thinking', thinking: 'Changing the email as asked (fake API).', signature: 'fake-signature' },
        { type: 'tool_use', id: `toolu_fake_${++toolCalls}_${Date.now()}`, name: 'edit_email', input: { changes: [{ field: FIELD_WORDS[change[1]!.toLowerCase()], text: change[2]!.trim() }], body_edits: [] } },
      ],
      stopReason: 'tool_use',
      delayMs: 15,
    };
  }
  if (/\bfeedback\b|\bthe email\b|\bmy lines\b/i.test(said)) {
    return {
      content: [
        { type: 'thinking', thinking: 'Reading the email (fake API).', signature: 'fake-signature' },
        { type: 'tool_use', id: `toolu_fake_${++toolCalls}_${Date.now()}`, name: 'get_email', input: {} },
      ],
      stopReason: 'tool_use',
      delayMs: 15,
    };
  }
  if (/\bnumbers\b/i.test(said)) {
    return {
      content: [
        { type: 'thinking', thinking: 'Getting the numbers (fake API).', signature: 'fake-signature' },
        { type: 'tool_use', id: `toolu_fake_${++toolCalls}_${Date.now()}`, name: 'get_numbers', input: {} },
      ],
      stopReason: 'tool_use',
      delayMs: 15,
    };
  }
  // Hubert's markdown (Dispatch 15): a reply with a heading, bold, a list, code and links, one of them refused.
  if (/\bmarkdown\b/i.test(said)) {
    return {
      content: [{
        type: 'text',
        text: '## Three to look at\nThe **closest match** is *200 Chambers*:\n- **200 Chambers #10A**: sold, full service\n- **5 Franklin #14A**: size is `approximate`\n'
          + '- [its listing](https://streeteasy.com/building/200-chambers-street) and https://streeteasy.com/sale/1\n\nNot a link: [click](javascript:alert(1)) or [this](https://streeteasy.com@evil.example/x).',
      }],
      stopReason: 'end_turn',
      delayMs: 15,
    };
  }
  if (/which report/i.test(said)) {
    return {
      content: [
        { type: 'thinking', thinking: 'Looking the report up (fake API).', signature: 'fake-signature' },
        { type: 'tool_use', id: `toolu_fake_${++toolCalls}_${Date.now()}`, name: 'get_report', input: {} },
      ],
      stopReason: 'tool_use',
      delayMs: 15,
    };
  }
  return {
    content: [
      { type: 'thinking', thinking: 'Reading the message (fake API).', signature: 'fake-signature' },
      { type: 'text', text: `You said: “${said}”. This reply comes from the local fake Messages API.` },
    ],
    stopReason: 'end_turn',
    delayMs: 15,
  };
}

export interface FakeAnthropic {
  url: string;
  server: Server;
  scripts: Script[];
  requests: Array<{ headers: Record<string, string | string[] | undefined>; body: Block }>;
  close(): Promise<void>;
}

export async function startFakeAnthropic(port = 0): Promise<FakeAnthropic> {
  const scripts: Script[] = [];
  const requests: FakeAnthropic['requests'] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const body = JSON.parse(raw || '{}') as Block;
      requests.push({ headers: req.headers, body });
      const script = scripts.shift() ?? echo(body);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'request-id': 'req_fake_1' });
      for (const chunk of sseEvents(script)) {
        if (res.destroyed) return;
        res.write(chunk);
        if (script.delayMs) await new Promise((r) => setTimeout(r, script.delayMs));
      }
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, server, scripts, requests, close: () => new Promise((r) => server.close(() => r())) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fake = await startFakeAnthropic(Number(process.argv[2] ?? 8791));
  console.log(`fake Anthropic Messages API on ${fake.url}`);
}
