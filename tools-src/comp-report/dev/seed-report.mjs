// DEV ONLY — seeds a comp report on the local dev server at a stage, for a walk or a screenshot (Dispatch 14).
//   node tools-src/comp-report/dev/seed-report.mjs <base> <stage> [side] [type] [email]
//   base:  http://localhost:5173 (the dev server)
//   stage: empty | home | sort | sorted | findings | send | sent
//   side:  buyer (default) | seller
//   type:  coop (default) | condo
//   email: kimani@casa-blanca.com (default, an admin) — use another for a plain agent
// Prints the report id on the last line. The fake model and geosearch must be up for Hubert and distance.
const [base = 'http://localhost:5173', stage = 'sort', side = 'buyer', type = 'coop', email = 'kimani@casa-blanca.com'] = process.argv.slice(2);
const token = 'dev.' + Buffer.from(email).toString('base64url');
const api = async (path, method = 'GET', body) => {
  const res = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} ${res.status} ${text}`);
  return JSON.parse(text);
};
const today = new Date().toISOString().slice(0, 10);
await api('/api/comp-report/me');
const { report } = await api('/api/comp-report/reports', 'POST', { title: '100 Barclay Street #17L', propertyType: type });
const id = report.id;
if (stage !== 'empty') {
  const s = await api('/api/comp-report/sample');
  const intake = { ...s.intake };
  // A co-op without a size: no per-SF figure anywhere.
  if (type === 'coop') delete intake.areaSqft;
  await api('/api/comp-report/workspace', 'PATCH', {
    reportId: id, sampleData: true, propertyType: type,
    brief: { ...s.brief, audience: { value: side, asOf: today }, clientName: { value: s.brief.clientName?.value ?? s.send.clientName?.value ?? 'Jordan and Sam', asOf: today } },
    target: s.target,
    state: { intake, dealTerms: s.dealTerms, reached: 'sort', hubertSeen: true },
  });
  if (stage !== 'home') {
    if (type === 'coop') {
      // The sample building is a condo; a co-op report counts like for like only. So a co-op walk
      // imports the same export as co-ops, with no sizes (most co-op listings have none).
      const { SAMPLE_EXPORT } = await import(new URL('../server/sample/barclay-17l-export.ts', import.meta.url).href);
      const csv = coopCsv(SAMPLE_EXPORT.csv);
      await api('/api/comp-report/imports', 'POST', { reportId: id, filename: 'streeteasy-comp-export-coop-walk.csv', asOf: SAMPLE_EXPORT.asOf, contentBase64: Buffer.from(csv).toString('base64') });
    } else {
      await api('/api/comp-report/imports', 'POST', { reportId: id, sample: true });
    }
    if (stage !== 'sort') await api('/api/comp-report/comps', 'POST', { reportId: id, sample: true });
    if (['findings', 'send', 'sent'].includes(stage)) {
      await api('/api/comp-report/workspace', 'PATCH', { reportId: id, call: { ...s.call, at: new Date().toISOString() }, state: { intake, dealTerms: s.dealTerms, reached: 'findings', hubertSeen: true } });
    }
    if (stage === 'send' || stage === 'sent') {
      const send = { ...s.send, ...(stage === 'sent' ? { sentAt: new Date().toISOString() } : {}) };
      await api('/api/comp-report/workspace', 'PATCH', { reportId: id, state: { intake, dealTerms: s.dealTerms, send, reached: 'send', hubertSeen: true } });
    }
  }
}
console.log(`${base}/tools/comp-report/?report=${id}`);
console.log(id);

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}
function coopCsv(csv) {
  const rows = parseCsv(csv);
  const h = rows[0];
  const at = (n) => h.indexOf(n);
  for (const r of rows.slice(1)) {
    r[at('Property Type')] = 'Co-op';
    r[at('Sqft')] = '';
    r[at('$/Sqft')] = '';
    if (at('Building Type') >= 0) r[at('Building Type')] = 'Co-op building';
  }
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(',')).join('\r\n') + '\r\n';
}
