// Step 2, the export (§3 step 2): a StreetEasy comp export, read by the
// engine's parser here in the browser (so a file that won't read is caught
// before it's sent), then stored by the server, which reads it again. The
// parser's warnings show as it gives them.
import { useMemo, useRef, useState } from 'react';
import { parseExport, type CompOut, type ParseWarning } from '../../../engine/index.ts';
import { workspaceApi } from '../../api.ts';
import { isoDay } from '../../../workspace/format.ts';
import { DecisionTag, SampleTag, StubTag } from './bits.tsx';
import { CompFacts, compAddress, evidenceLabel, Flags, listingUrl } from './comps.tsx';
import { toBase64, type StepProps } from './model.ts';

const MAX_BYTES = 2 * 1024 * 1024;

const WARNING_LABEL: Partial<Record<ParseWarning['code'], string>> = {
  approx_area: 'Approximate sizes',
  closing_record: 'Public-record closings',
  missing_column: 'Missing columns',
  unknown_column: 'Columns the parser doesn’t know',
  unreadable_value: 'Values it couldn’t read',
  missing_address: 'Rows without an address',
  unrecognised_status: 'Statuses it doesn’t know',
  duplicate_property: 'The same property twice',
  zero_price: 'Zero prices',
};

function Warnings({ warnings }: { warnings: ParseWarning[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, ParseWarning[]>();
    for (const w of warnings) m.set(w.code, [...(m.get(w.code) ?? []), w]);
    return [...m.entries()];
  }, [warnings]);
  if (!warnings.length) return <p className="muted small">The parser had no warnings.</p>;
  return (
    <ul className="warnings">
      {groups.map(([code, list]) => (
        <li key={code}>
          <strong>{WARNING_LABEL[code as ParseWarning['code']] ?? code.replace(/_/g, ' ')}</strong> ({list.length})
          <ul>{list.map((w, i) => <li key={i} className="small">{w.row ? `Row ${w.row}: ` : ''}{w.message}</li>)}</ul>
        </li>
      ))}
    </ul>
  );
}

export function ExportStep({ ws }: StepProps) {
  const [pulled, setPulled] = useState(ws.today);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const outById = useMemo(() => new Map<string, CompOut>((ws.output?.comps ?? []).map((c) => [c.id, c])), [ws.output]);
  const sampleImports = new Set(ws.imports.filter((i) => i.sample).map((i) => i.id));

  async function upload(file: File) {
    setFileError(null);
    if (file.size > MAX_BYTES) {
      setFileError('That file is larger than a StreetEasy export should be (2 MB).');
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const parsed = parseExport(bytes, { as_of: pulled, filename: file.name });
      if (!parsed.comps.length) {
        setFileError('That export has no comps in it.');
        return;
      }
    } catch (e) {
      setFileError(`That file couldn’t be read as a StreetEasy export: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    await ws.run(`Adding ${file.name}…`, async () => {
      ws.applyServer(await workspaceApi.importFile(ws.reportId, { filename: file.name, contentBase64: toBase64(bytes), asOf: pulled }));
    });
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div className="export">
      {!ws.readOnly && (
        <div className="card upload">
          <div className="grid">
            <label className="field">
              <span className="field-label">StreetEasy export (CSV or XLSX)</span>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={Boolean(ws.busy)}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">Pulled on</span>
              <input type="date" value={pulled} max={ws.today} onChange={(e) => setPulled(e.target.value || ws.today)} />
              <span className="field-hint">The day you downloaded it: what the export says is true as of then (§12).</span>
            </label>
          </div>
          {fileError && <p className="notice error-notice" role="alert">{fileError}</p>}
        </div>
      )}

      <div className="label">Exports in this report</div>
      {ws.imports.length === 0 && <p className="muted">None yet. Add the export you pulled from StreetEasy.</p>}
      <ul className="list">
        {[...ws.imports].reverse().map((imp) => {
          const parsed = ws.parsed.find((p) => p.importId === imp.id);
          return (
            <li key={imp.id} className="entry-block">
              <div className="row wrap">
                <strong>{imp.filename ?? 'Untitled export'}</strong>
                <SampleTag show={imp.sample} />
                <span className="muted small">
                  pulled {isoDay(imp.asOf)} · {imp.compCount} comps · {imp.format.toUpperCase()} · added {new Date(imp.createdAt).toLocaleString()}
                  {' '}by {imp.createdBy} · parser {imp.parserVersion}
                </span>
              </div>
              {ws.unreadable[imp.id] && <p className="notice error-notice">This browser couldn’t read it: {ws.unreadable[imp.id]}</p>}
              {parsed && (
                <details>
                  <summary className="small">Parser warnings ({parsed.parsed.warnings.length})</summary>
                  <Warnings warnings={parsed.parsed.warnings} />
                </details>
              )}
            </li>
          );
        })}
      </ul>

      {ws.comps.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 20 }}>The comps ({ws.comps.length})</div>
          <p className="muted small">
            $/sq ft is the engine’s own, truncated as StreetEasy shows it; the export’s own figure is kept for the record and never used (§6.2).
            Where a property is in more than one export, the newest shows.
          </p>
          <div className="table-wrap">
            <table className="comps">
              <thead>
                <tr><th>Comp</th><th>Evidence status</th><th>What the export says</th><th>Listing</th></tr>
              </thead>
              <tbody>
                {ws.comps.map((c) => {
                  const url = listingUrl(c);
                  return (
                    <tr key={c.id}>
                      <td>
                        <strong>{compAddress(c)}</strong> <SampleTag show={sampleImports.has(c.importId)} />
                        {c.record.building_name && <div className="muted small">{c.record.building_name}</div>}
                      </td>
                      <td>{evidenceLabel(c)}</td>
                      <td>
                        <CompFacts c={c} out={outById.get(c.id)} />
                        <Flags c={c} out={outById.get(c.id)} />
                        {c.unsortable && <div className="muted small">{c.unsortable}</div>}
                      </td>
                      <td>{url ? <a href={url} target="_blank" rel="noreferrer noopener">StreetEasy ↗</a> : <span className="muted small">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="muted small">
        <StubTag>Waits on D-12</StubTag> Tagging each comp on arrival through Jev (§7). <DecisionTag id="D-12" />
      </p>
    </div>
  );
}
