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

function echo(body: Block): Script {
  if ((body.output_config as Block | undefined)?.format) return fakeWriterDraft(body);
  const messages = (body.messages ?? []) as Array<{ role: string; content: Array<Block> }>;
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const result = last?.content.find((b) => b.type === 'tool_result');
  if (result) {
    const asked = [...messages].reverse().find((m) => m.role === 'assistant')?.content.find((b) => b.id === result.tool_use_id);
    const name = String(asked?.name ?? 'get_report');
    const got = String(result.content);
    return {
      content: [{ type: 'text', text: `${name} returned ${got.length > 600 ? `${got.slice(0, 600)}…` : got} (fake Messages API).` }],
      stopReason: 'end_turn',
      delayMs: 15,
    };
  }
  const said = last?.content.filter((b) => b.type === 'text').map((b) => String(b.text)).join(' ') ?? '';
  if (/^\s*refuse\b/i.test(said)) {
    return { content: [], stopReason: 'refusal', stopDetails: { type: 'refusal', category: null, explanation: null }, delayMs: 15 };
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
