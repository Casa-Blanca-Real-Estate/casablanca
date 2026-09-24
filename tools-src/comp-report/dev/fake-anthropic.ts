// DEV/TEST ONLY — a scripted stand-in for Anthropic's streaming Messages API,
// so the assistant can be exercised with no key and no cost. The real SDK
// talks to it through baseURL. Used by the turn tests, and by hand:
//
//   node tools-src/comp-report/dev/fake-anthropic.ts 8791
//   CR_DEV_ANTHROPIC_BASE_URL=http://127.0.0.1:8791 npm run dev:comp-report
//
// With no script queued it answers every request the same way: a progress
// note, then a reply echoing the agent's last message.
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

function echo(body: Block): Script {
  const messages = (body.messages ?? []) as Array<{ role: string; content: Array<Block> }>;
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const said = last?.content.filter((b) => b.type === 'text').map((b) => String(b.text)).join(' ') ?? '';
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
