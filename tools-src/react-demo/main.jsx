import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

/* ═══════════════════════════════════════════════════════════════════════════
   REACT COEXISTENCE SPIKE

   Not a product. It exists to answer one question — can a React tool live in
   this repo alongside the hand-written ones without disturbing them — by
   actually touching every seam that matters:

     1. shares the studio chrome (studio-header.js) and brand fonts
     2. reads the real agent library from /assets/agents/agents.json
     3. calls a real Netlify function (/.netlify/functions/img)
     4. drives a <canvas> and exports a PNG, the way every studio tool does
     5. deploys to /tools/react-demo/ next to /tools/story/, same origin,
        same everything

   The state here is deliberately the shape that gets painful in vanilla JS:
   a filtered list, a selection, a few knobs, and a canvas that must stay in
   sync with all of them. In tools/incontract-carousel/index.html that pattern
   costs 235 getElementById/querySelector calls and a hand-written syncForm().
   Here the canvas is a useEffect over the state it depends on, and there is no
   sync function at all — which is the entire argument for the build step.
   ═══════════════════════════════════════════════════════════════════════════ */

const W = 1080, H = 1080;

function useAgents() {
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/assets/agents/agents.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`agents.json → ${r.status}`)))
      .then(list => setAgents(list.map(a => ({
        name: a.name,
        file: a.file,
        src: '/assets/agents/' + a.file,
      }))))
      .catch(e => setError(String(e.message || e)));
  }, []);
  return { agents, error };
}

/* Load an image and keep the decoded element in state. */
function useImage(src) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    if (!src) { setImg(null); return; }
    let live = true;
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => { if (live) setImg(i); };
    i.onerror = () => { if (live) setImg(null); };
    i.src = src;
    return () => { live = false; };
  }, [src]);
  return img;
}

function App() {
  const { agents, error } = useAgents();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
  const [label, setLabel] = useState('JUST CLOSED');
  const [accent, setAccent] = useState('#aaa3cf');
  const [zoom, setZoom] = useState(1.2);
  const [fnStatus, setFnStatus] = useState('not called yet');

  const canvasRef = useRef(null);
  const headshot = useImage(picked?.src);
  const logo = useImage('/assets/cb-logo-white.png');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? agents.filter(a => a.name.toLowerCase().includes(q)) : agents;
    return list.slice(0, 60);
  }, [agents, query]);

  // The whole point: one effect, declaring exactly what the picture depends on.
  // No syncForm(), no manual invalidation, no way to forget to redraw.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const c = cv.getContext('2d');

    c.fillStyle = '#0f0f0f';
    c.fillRect(0, 0, W, H);

    if (headshot) {
      c.save();
      c.beginPath();
      c.arc(W / 2, 470, 300, 0, Math.PI * 2);
      c.clip();
      const s = Math.max(600 / headshot.naturalWidth, 600 / headshot.naturalHeight) * zoom;
      const dw = headshot.naturalWidth * s, dh = headshot.naturalHeight * s;
      c.drawImage(headshot, W / 2 - dw / 2, 470 - dh / 2 - (dh - 600) * 0.24, dw, dh);
      c.restore();
      c.strokeStyle = accent;
      c.lineWidth = 4;
      c.beginPath();
      c.arc(W / 2, 470, 316, 0, Math.PI * 2);
      c.stroke();
    } else {
      c.fillStyle = '#26232c';
      c.beginPath();
      c.arc(W / 2, 470, 300, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#4d4956';
      c.font = "800 30px 'ObjectSans', Arial, sans-serif";
      c.textAlign = 'center';
      c.fillText('PICK AN AGENT', W / 2, 480);
    }

    c.fillStyle = accent;
    c.fillRect(140, 838, W - 280, 3);

    c.fillStyle = '#f4f3f0';
    c.font = "800 74px 'ObjectSans', Arial, sans-serif";
    c.textAlign = 'center';
    c.fillText((label || '').toUpperCase(), W / 2, 940);

    if (picked) {
      c.fillStyle = '#c0c2b5';
      c.font = "400 27px 'ObjectSans', Arial, sans-serif";
      c.fillText(picked.name.toUpperCase(), W / 2, 990);
    }

    if (logo) {
      const lw = 250, lh = lw / (logo.naturalWidth / logo.naturalHeight);
      c.drawImage(logo, W / 2 - lw / 2, 120, lw, lh);
    }
  }, [headshot, logo, label, accent, zoom, picked]);

  // Seam 3: prove a React tool reaches the same backend the static tools use.
  async function pingFunction() {
    setFnStatus('calling…');
    try {
      const url = '/.netlify/functions/img?u=' +
        encodeURIComponent('https://via.placeholder.com/64.png');
      const r = await fetch(url, { method: 'GET' });
      setFnStatus(`/.netlify/functions/img → HTTP ${r.status} (${r.headers.get('content-type') || 'no content-type'})`);
    } catch (e) {
      setFnStatus('failed: ' + (e.message || e) + ' — expected off Netlify; functions only exist on the deploy.');
    }
  }

  function download() {
    const a = document.createElement('a');
    a.download = 'cb_react_spike.png';
    a.href = canvasRef.current.toDataURL('image/png');
    a.click();
  }

  return (
    <>
      <header>
        <img src="/assets/cb-logo-white.png" alt="Casa Blanca" />
        <span className="h-lbl">React Coexistence Spike</span>
      </header>

      <div className="wrap">
        <div className="panel">
          <p className="banner">
            This tool is React, compiled by Vite. Its neighbours under <code>/tools/</code> are
            still hand-written HTML and were not touched to make this work.
          </p>

          <div className="sec">
            <div className="sec-h">
              Agent library {agents.length ? <span className="ok">— {agents.length} loaded</span> : null}
            </div>
            {error && <p className="err">Couldn’t load agents.json: {error}</p>}
            <input
              type="text"
              placeholder="Search agents…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <div className="agents">
              {shown.map(a => (
                <button
                  key={a.file}
                  className={'agent' + (picked?.file === a.file ? ' on' : '')}
                  onClick={() => setPicked(a)}
                  title={a.name}
                >
                  <img src={a.src} alt="" loading="lazy" />
                  <span>{a.name}</span>
                </button>
              ))}
              {!agents.length && !error && <p className="hint">Loading…</p>}
            </div>
          </div>

          <div className="sec">
            <div className="sec-h">Card</div>
            <label>Headline</label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)} />

            <label style={{ marginTop: 13 }}>Accent</label>
            <div className="swatches">
              {['#aaa3cf', '#c0c2b5', '#b4452f', '#f4f3f0'].map(c => (
                <button
                  key={c}
                  className={'sw' + (accent === c ? ' on' : '')}
                  style={{ background: c }}
                  onClick={() => setAccent(c)}
                />
              ))}
            </div>

            <label style={{ marginTop: 13 }}>Headshot zoom — {zoom.toFixed(2)}×</label>
            <input
              type="range" min="1" max="1.8" step="0.01"
              value={zoom}
              onChange={e => setZoom(parseFloat(e.target.value))}
            />
          </div>

          <div className="sec">
            <div className="sec-h">Backend reachability</div>
            <button className="btn btn-s" onClick={pingFunction}>Call a Netlify function</button>
            <p className="hint">{fnStatus}</p>
          </div>
        </div>

        <div className="stage">
          <div className="frame">
            <canvas id="cv" ref={canvasRef} width={W} height={H} />
          </div>
          <button className="btn" onClick={download}>↓ Download PNG</button>
          <p className="stagehint">
            The canvas is a <code>useEffect</code> over the state it reads. There is no
            <code> syncForm()</code> in this file, and nothing to forget to call.
          </p>
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
