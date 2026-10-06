/**
 * ChainSight Investigation Dashboard Logic
 * Stage 8D / 8E Architecture with Live Blockscout & FastAPI Integration
 */

const API = 'https://chainsight-api-sz3r.onrender.com';
const BLOCKSCOUT = 'https://eth.blockscout.com/api/v2';

let state = {
  root: '',
  depth: 3,
  txs: [],
  nodes: [],
  alerts: [],
  risk: 0,
  mode: 'idle',
  source: '',
  caseId: null,
  evidence: [],
  selectedNode: null
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const short = x => x ? x.slice(0, 8) + '…' + x.slice(-6) : '—';
const eth = v => (Number(v || 0) / 1e18).toFixed(5);

// API Client with timeout
async function api(path, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      signal: controller.signal,
      ...opts
    });
    clearTimeout(timeoutId);
    let data = {};
    try { data = await r.json(); } catch {}
    if (!r.ok) throw new Error(data.detail || `API returned ${r.status}`);
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function showView(id, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = $(id);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (id === 'cases') loadCases();
}

function normalizeTx(t) {
  return {
    hash: t.hash || '',
    from: (t.from?.hash || t.from || '').toLowerCase(),
    to: (t.to?.hash || t.to || '').toLowerCase(),
    value: Number(t.value || 0),
    time: t.timestamp || t.time || '',
    block: Number(t.block_number || t.block || 0)
  };
}

function buildFromBackend(data) {
  state.root = (data.root || '').toLowerCase();
  state.depth = Number(data.depth || 1);
  state.txs = (data.transactions || []).map(normalizeTx);
  state.nodes = data.nodes || calculateNodes(state.txs, state.root);
  state.alerts = data.alerts || calculateAlerts(state.nodes);
  state.risk = Number(data.risk || 0);
  state.source = data.source || 'Ethereum / Blockscout API';
  state.mode = 'live';
  state.caseId = null;
  state.evidence = [];
  state.selectedNode = state.nodes.find(n => n.address === state.root) || state.nodes[0] || null;
  renderAll();
}

// Client-side fallback heuristics when cloud backend is cold or sleeping
function calculateNodes(txs, root) {
  const map = new Map();
  for (const t of txs) {
    for (const a of [t.from, t.to]) {
      if (a) {
        if (!map.has(a)) {
          map.set(a, { address: a, transactions: [], counterparties: 0, risk: 0, risk_factors: [] });
        }
        map.get(a).transactions.push(t);
      }
    }
  }

  for (const n of map.values()) {
    const peers = new Set(n.transactions.map(t => t.from === n.address ? t.to : t.from).filter(Boolean));
    n.counterparties = peers.size;
    const outgoing = n.transactions.filter(t => t.from === n.address).length;
    let score = 0;
    const factors = [];

    if (n.transactions.length >= 25) {
      score += 30;
      factors.push({ title: 'High transaction activity', detail: `${n.transactions.length} observed transactions.` });
    } else if (n.transactions.length >= 10) {
      score += 15;
      factors.push({ title: 'Moderate transaction frequency', detail: `${n.transactions.length} observed transactions.` });
    }

    if (peers.size >= 15) {
      score += 30;
      factors.push({ title: 'Broad counterparty expansion', detail: `${peers.size} unique counterparties.` });
    } else if (peers.size >= 5) {
      score += 15;
      factors.push({ title: 'Multi-counterparty interactions', detail: `${peers.size} unique counterparties.` });
    }

    if (outgoing >= 8) {
      score += 15;
      factors.push({ title: 'High outgoing transfer rate', detail: `${outgoing} outbound transactions.` });
    }

    n.risk = Math.min(score, 100);
    n.risk_factors = factors;
  }

  return [...map.values()];
}

function calculateAlerts(nodes) {
  const alerts = [];
  for (const n of nodes) {
    if (n.risk >= 30) {
      alerts.push({
        level: n.risk >= 70 ? 'CRITICAL' : n.risk >= 50 ? 'HIGH' : 'MEDIUM',
        title: n.risk >= 70 ? 'Critical transaction concentration' : 'Elevated counterparty activity',
        address: n.address,
        addr: n.address,
        reason: `${n.transactions.length} observed transactions across ${n.counterparties} counterparties.`,
        score: n.risk,
        factors: n.risk_factors || []
      });
    }
  }
  return alerts;
}

// Demo Dataset
function makeDemo() {
  const A = '0x1111111111111111111111111111111111111111';
  const B = '0x2222222222222222222222222222222222222222';
  const C = '0x3333333333333333333333333333333333333333';
  const D = '0x4444444444444444444444444444444444444444';
  const E = '0x5555555555555555555555555555555555555555';
  const F = '0x6666666666666666666666666666666666666666';
  const G = '0x7777777777777777777777777777777777777777';
  const H = '0x8888888888888888888888888888888888888888';

  const now = Date.now();
  const mk = (i, f, t, v, m) => ({
    hash: '0x' + String(i).padStart(64, '0'),
    from: f,
    to: t,
    value: v * 1e18,
    time: new Date(now - m * 60000).toISOString(),
    block: 21000000 + i
  });

  return {
    root: C,
    depth: 3,
    transactions: [
      mk(1, A, C, 4.5, 12),
      mk(2, G, C, 2.8, 10),
      mk(3, C, D, 1.9, 8),
      mk(4, C, E, 1.2, 7),
      mk(5, C, F, 0.9, 6),
      mk(6, D, B, 0.8, 5),
      mk(7, F, B, 0.6, 4),
      mk(8, B, H, 0.5, 3),
      mk(9, B, C, 0.45, 2),
      mk(10, E, C, 0.35, 1),
      mk(11, C, B, 0.2, 1)
    ]
  };
}

function loadDemo() {
  const d = makeDemo();
  state.root = d.root;
  state.depth = d.depth;
  state.txs = d.transactions.map(normalizeTx);
  state.nodes = calculateNodes(state.txs, state.root);
  state.alerts = calculateAlerts(state.nodes);
  state.risk = state.nodes.find(n => n.address === state.root)?.risk || 65;
  state.source = 'Interactive demonstration scenario';
  state.mode = 'demo';
  state.caseId = 'CS-DEMO-001';
  state.evidence = state.txs.map((t, idx) => ({
    evidence_id: `EV-${String(idx + 1).padStart(4, '0')}`,
    evidence_type: 'transaction',
    reference: t.hash,
    source: 'Synthetic Demo Ledger',
    retrieved_at: new Date().toISOString()
  }));
  state.selectedNode = state.nodes.find(n => n.address === state.root) || state.nodes[0];

  renderAll();
  const notice = $('dashTraceStatus');
  if (notice) {
    notice.style.display = 'block';
    notice.textContent = 'Loaded interactive demo investigation with multi-counterparty flows.';
    setTimeout(() => { notice.style.display = 'none'; }, 4000);
  }
}

// Live Investigation Trace
async function executeTrace(query, depth) {
  const q = (query || '').trim().toLowerCase();
  const d = Number(depth || 3);
  const statusEl = $('dashTraceStatus') || $('traceStatus');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = `Tracing ${short(q)} on Ethereum Mainnet…`;
  }

  try {
    if (!/^0x[a-f0-9]{40}$/i.test(q) && !/^0x[a-f0-9]{64}$/i.test(q)) {
      throw new Error('Please enter a valid 40-char Ethereum address or 64-char transaction hash.');
    }

    let traceResult = null;

    // 1. Try FastAPI backend
    try {
      if (/^0x[a-f0-9]{64}$/i.test(q)) {
        if (statusEl) statusEl.textContent = 'Looking up transaction via backend…';
        const tx = normalizeTx(await api('/api/v1/transaction/' + q, {}, 5000));
        traceResult = await api('/api/v1/trace/' + tx.from + '?depth=1', {}, 8000);
      } else {
        if (statusEl) statusEl.textContent = 'Querying Ethereum graph via backend risk engine…';
        traceResult = await api('/api/v1/trace/' + q + '?depth=' + d, {}, 8000);
      }
    } catch (backendErr) {
      console.warn('Backend unavailable, falling back to direct Blockscout API:', backendErr.message);
      if (statusEl) statusEl.textContent = 'Connecting directly to Blockscout Ethereum API…';

      // 2. Direct Blockscout API Fallback
      const targetAddr = /^0x[a-f0-9]{64}$/i.test(q) ? null : q;
      if (targetAddr) {
        const bsRes = await fetch(`${BLOCKSCOUT}/addresses/${targetAddr}/transactions`);
        if (!bsRes.ok) throw new Error(`Blockscout returned HTTP ${bsRes.status}`);
        const bsData = await bsRes.json();
        const rawTxs = bsData.items || [];
        const normalized = rawTxs.map(normalizeTx);
        const nodes = calculateNodes(normalized, targetAddr);
        const alerts = calculateAlerts(nodes);
        const rootNode = nodes.find(n => n.address === targetAddr);

        traceResult = {
          root: targetAddr,
          depth: d,
          transactions: normalized,
          nodes: nodes,
          alerts: alerts,
          risk: rootNode ? rootNode.risk : 25,
          source: 'Live Ethereum (Direct Blockscout API)'
        };
      } else {
        throw new Error('Transaction hash fallback requires full address lookup.');
      }
    }

    if (traceResult) {
      buildFromBackend(traceResult);
      if (statusEl) {
        statusEl.textContent = `Successfully traced ${state.txs.length} transactions across ${state.nodes.length} counterparties.`;
        setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
      }
    }
  } catch (err) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent = `Investigation notice: ${err.message}`;
    }
  }
}

function runInvestigationFromDash() {
  const q = $('dashQuery')?.value || '';
  const d = $('dashDepth')?.value || 3;
  if ($('query')) $('query').value = q;
  if ($('depth')) $('depth').value = d;
  executeTrace(q, d);
}

function runInvestigation() {
  const q = $('query')?.value || '';
  const d = $('depth')?.value || 3;
  if ($('dashQuery')) $('dashQuery').value = q;
  if ($('dashDepth')) $('dashDepth').value = d;
  executeTrace(q, d);
}

function setAndRunTrace(addr) {
  if ($('dashQuery')) $('dashQuery').value = addr;
  if ($('query')) $('query').value = addr;
  executeTrace(addr, 3);
}

// Rendering Logic
function renderAll() {
  renderStats();
  renderGraph();
  renderTable();
  renderAlerts();
  renderSelected();
  renderReport();

  if ($('investigationResult')) {
    $('investigationResult').style.display = state.txs.length ? 'block' : 'none';
  }
  if ($('liveDepth')) $('liveDepth').textContent = state.depth + ' hops';
  if ($('liveNodes')) $('liveNodes').textContent = state.nodes.length;
  if ($('liveAlerts')) $('liveAlerts').textContent = state.alerts.length;
  if ($('liveRisk')) $('liveRisk').textContent = state.risk + '/100';

  if ($('dashSub')) {
    $('dashSub').textContent = state.mode === 'live'
      ? `Live Ethereum investigation · Subject: ${short(state.root)} · Source: ${state.source}`
      : 'Interactive demonstration case · Synthetic transaction flow';
  }

  const badge = $('liveBadge');
  if (badge) {
    if (state.mode === 'live') {
      badge.textContent = '● LIVE ETHEREUM';
      badge.className = 'badge';
    } else if (state.mode === 'demo') {
      badge.textContent = '● DEMO CASE';
      badge.className = 'badge warn';
    } else {
      badge.textContent = '● READY';
      badge.className = 'badge';
    }
  }
}

function renderStats() {
  if ($('statNodes')) $('statNodes').textContent = state.nodes.length || '0';
  if ($('statTx')) $('statTx').textContent = state.txs.length || '0';
  if ($('statAlerts')) $('statAlerts').textContent = state.alerts.length || '0';
  if ($('statValue')) {
    const totalWei = state.txs.reduce((acc, t) => acc + (Number(t.value) || 0), 0);
    $('statValue').textContent = (totalWei / 1e18).toFixed(2) + ' ETH';
  }
}

function renderGraph() {
  const svg = $('svg');
  if (!svg) return;
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';

  const nodes = state.nodes.slice(0, 20);
  if (!nodes.length) {
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', '380');
    text.setAttribute('y', '240');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#6d8494');
    text.textContent = 'Enter an address or click Demo to build the graph.';
    svg.appendChild(text);
    return;
  }

  const center = nodes.find(n => n.address === state.root) || nodes[0];
  center.x = 380;
  center.y = 240;

  const others = nodes.filter(n => n !== center);
  others.forEach((n, i) => {
    const angle = (i / Math.max(1, others.length)) * Math.PI * 2;
    const radiusX = 250;
    const radiusY = 170;
    n.x = 380 + Math.cos(angle) * radiusX;
    n.y = 240 + Math.sin(angle) * radiusY;
  });

  const posMap = new Map(nodes.map(n => [n.address, n]));

  // Draw Edges
  state.txs.slice(0, 100).forEach(tx => {
    const fromNode = posMap.get(tx.from);
    const toNode = posMap.get(tx.to);
    if (!fromNode || !toNode) return;

    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', fromNode.x);
    line.setAttribute('y1', fromNode.y);
    line.setAttribute('x2', toNode.x);
    line.setAttribute('y2', toNode.y);
    line.setAttribute('stroke', '#274457');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-opacity', '0.7');
    svg.appendChild(line);
  });

  // Draw Nodes
  nodes.forEach((n, i) => {
    const g = document.createElementNS(ns, 'g');
    g.style.cursor = 'pointer';

    const isSelected = state.selectedNode && state.selectedNode.address === n.address;
    const isRoot = n === center;

    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', n.x);
    circle.setAttribute('cy', n.y);
    circle.setAttribute('r', isRoot ? 28 : 20);
    circle.setAttribute('fill', isSelected ? '#122c3b' : '#08131b');
    circle.setAttribute('stroke', n.risk >= 70 ? '#ff647c' : n.risk >= 30 ? '#ffbd59' : '#55d6be');
    circle.setAttribute('stroke-width', isSelected ? '4' : '2.5');

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', n.x);
    label.setAttribute('y', n.y + 4);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'svgtext');
    label.textContent = isRoot ? 'ROOT' : String.fromCharCode(65 + (i % 26));

    const subLabel = document.createElementNS(ns, 'text');
    subLabel.setAttribute('x', n.x);
    subLabel.setAttribute('y', n.y + (isRoot ? 40 : 34));
    subLabel.setAttribute('text-anchor', 'middle');
    subLabel.setAttribute('class', 'edgeLabel');
    subLabel.textContent = short(n.address);

    g.appendChild(circle);
    g.appendChild(label);
    g.appendChild(subLabel);

    g.onclick = () => selectNode(n);
    svg.appendChild(g);
  });
}

function selectNode(n) {
  if (!n) return;
  state.selectedNode = n;
  const risk = Number(n.risk || 0);
  const lvl = risk >= 70 ? 'CRITICAL' : risk >= 50 ? 'HIGH' : risk >= 30 ? 'MEDIUM' : 'LOW';
  const relevantTxs = state.txs.filter(t => t.from === n.address || t.to === n.address);

  const box = $('walletBox');
  if (box) {
    box.innerHTML = `
      <div class="riskTop">
        <div>
          <div class="label">Wallet Address</div>
          <div class="mono" style="font-size:12px">${esc(n.address)}</div>
        </div>
        <span class="pill ${lvl.toLowerCase()}">${lvl}</span>
      </div>
      <div class="value" style="font-size:32px;margin:8px 0">${risk}<span class="hint" style="font-size:14px">/100</span></div>
      <div class="bar"><i style="width:${risk}%"></i></div>
      <div class="kv">
        <div><b>${relevantTxs.length}</b><span>Observed Txns</span></div>
        <div><b>${n.counterparties || 0}</b><span>Counterparties</span></div>
      </div>
    `;
  }

  const patternBox = $('patternBox');
  if (patternBox) {
    const factors = n.risk_factors || [];
    if (factors.length) {
      patternBox.innerHTML = factors.map(f => `
        <div class="alert" style="margin:4px 0">
          <b>${esc(f.title)}</b>
          <div>${esc(f.detail || '')}</div>
        </div>
      `).join('');
    } else {
      patternBox.innerHTML = '<div class="hint">No elevated risk factors identified for this wallet.</div>';
    }
  }

  renderGraph();
}

function renderSelected() {
  const target = state.selectedNode || state.nodes.find(n => n.address === state.root) || state.nodes[0];
  if (target) selectNode(target);
}

function renderTable() {
  const table = $('txTable');
  if (!table) return;

  if (!state.txs.length) {
    table.innerHTML = '<tr><td colspan="6" class="empty">No transaction records observed.</td></tr>';
    return;
  }

  table.innerHTML = state.txs.slice(0, 80).map(t => `
    <tr>
      <td>${esc(t.time || '—')}</td>
      <td class="mono" title="${esc(t.hash)}">${esc(short(t.hash))}</td>
      <td class="mono" title="${esc(t.from)}">${esc(short(t.from))}</td>
      <td class="mono" title="${esc(t.to)}">${esc(short(t.to))}</td>
      <td><b>${eth(t.value)} ETH</b></td>
      <td><span class="status low">VERIFIED</span></td>
    </tr>
  `).join('');
}

function renderAlerts() {
  const list = $('alertsList');
  if (list) {
    list.innerHTML = state.alerts.length
      ? state.alerts.map(a => `
        <div class="alert">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <b>${esc(a.level)} · ${esc(a.title)}</b>
            <span class="pill ${esc(String(a.level).toLowerCase())}">${a.score || 0}/100</span>
          </div>
          <div class="mono" style="margin:4px 0;color:var(--accent)">${esc(a.address || a.addr)}</div>
          <div>${esc(a.reason)}</div>
        </div>
      `).join('')
      : '<div class="empty">No elevated risk indicators detected.</div>';
  }
}

function renderReport() {
  if ($('reportSubject')) $('reportSubject').textContent = state.root || '—';
  if ($('reportRisk')) $('reportRisk').textContent = state.risk ? state.risk + '/100' : '—';
  if ($('reportTrace')) $('reportTrace').textContent = state.txs.length ? `${state.depth} hops / ${state.nodes.length} nodes` : '—';
  if ($('reportEvidence')) $('reportEvidence').textContent = state.evidence.length ? `${state.evidence.length} evidence items` : `${state.txs.length} transaction records`;
  if ($('reportCase')) $('reportCase').textContent = state.caseId || 'ACTIVE SESSION';
}

// Case Management
async function saveCurrentCase() {
  if (!state.root || !state.txs.length) return;
  const s = $('saveStatus');
  if (s) s.textContent = 'Saving case…';

  try {
    const payload = {
      subject: state.root,
      depth: state.depth,
      risk: state.risk,
      status: 'active',
      source: state.source,
      transactions: state.txs,
      alerts: state.alerts
    };

    const data = await api('/api/v1/cases', { method: 'POST', body: JSON.stringify(payload) }, 6000);
    state.caseId = data.case_id;
    if (s) s.textContent = `Saved as ${data.case_id}`;
    renderReport();
    loadCases();
  } catch (err) {
    if (s) s.textContent = 'Local save mode: ' + err.message;
  }
}

async function loadCases() {
  const list = $('caseList');
  if (!list) return;
  list.innerHTML = '<div class="empty">Loading case ledger…</div>';

  try {
    const data = await api('/api/v1/cases', {}, 6000);
    if (!data.items || !data.items.length) {
      list.innerHTML = '<div class="empty">No saved cases in persistent storage. Run an investigation and click "Save as Case".</div>';
      return;
    }

    list.innerHTML = data.items.map(c => `
      <div class="case-row">
        <div>
          <b>${esc(c.case_id)}</b>
          <div class="small mono">${esc(short(c.subject))}</div>
        </div>
        <div>
          <span class="status ${c.risk >= 50 ? 'high' : c.risk >= 30 ? 'medium' : 'low'}">${c.risk}/100</span>
          <span class="small" style="margin-left:6px">${esc(c.status)}</span>
        </div>
        <div>${c.transaction_count} txns</div>
        <div>${c.evidence_count} evidence</div>
        <div><button class="btn" onclick="openCase('${esc(c.case_id)}')">Open</button></div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="empty">Cases ledger offline: ${esc(err.message)}</div>`;
  }
}

async function openCase(id) {
  try {
    const c = await api('/api/v1/cases/' + encodeURIComponent(id), {}, 6000);
    state.caseId = c.case_id;
    state.root = c.subject;
    state.depth = c.depth;
    state.risk = c.risk;
    state.source = c.source;
    state.txs = (c.transactions || []).map(normalizeTx);
    state.alerts = c.alerts || [];
    state.evidence = c.evidence || [];
    state.nodes = calculateNodes(state.txs, state.root);
    state.mode = 'live';
    state.selectedNode = state.nodes.find(n => n.address === state.root) || state.nodes[0];
    renderAll();

    $('caseDetail').innerHTML = `
      <div class="case-head">
        <div>
          <h2>Case ${esc(c.case_id)}</h2>
          <div class="mono">${esc(c.subject)}</div>
        </div>
        <span class="status ${c.risk >= 50 ? 'high' : c.risk >= 30 ? 'medium' : 'low'}">${c.risk}/100 Risk</span>
      </div>
      <div class="cards" style="margin-top:14px">
        <div class="card"><div class="label">Transactions</div><div class="value">${c.transaction_count}</div></div>
        <div class="card"><div class="label">Alerts</div><div class="value">${c.alert_count}</div></div>
        <div class="card"><div class="label">Evidence</div><div class="value">${c.evidence_count}</div></div>
        <div class="card"><div class="label">Status</div><div class="value">${esc(c.status)}</div></div>
      </div>
      <h3 style="margin-top:16px">Evidence Provenance</h3>
      ${(c.evidence || []).slice(0, 50).map(e => `
        <div class="notice">
          <b>${esc(e.evidence_id)}</b> · ${esc(e.evidence_type)}
          <div class="mono">${esc(e.reference)}</div>
          <div class="provenance"><b>Source:</b> ${esc(e.source)} · <b>Retrieved:</b> ${esc(e.retrieved_at)}</div>
        </div>
      `).join('') || '<div class="empty">No evidence items attached.</div>'}
    `;
    $('caseModal').classList.add('open');
  } catch (err) {
    alert('Failed to open case: ' + err.message);
  }
}

function closeCase() {
  $('caseModal').classList.remove('open');
}

function downloadReport() {
  const generated = new Date().toISOString();
  const rows = state.txs.slice(0, 100).map((t, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(t.time)}</td>
      <td class="mono">${esc(t.hash)}</td>
      <td class="mono">${esc(t.from)}</td>
      <td class="mono">${esc(t.to)}</td>
      <td>${eth(t.value)} ETH</td>
    </tr>
  `).join('');

  const alerts = state.alerts.map(a => `
    <li><b>${esc(a.level)} · ${esc(a.title)}</b> — ${esc(a.reason)}</li>
  `).join('');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>ChainSight Dossier - ${esc(state.caseId || 'Investigation')}</title>
<style>
body{font:14px Arial,sans-serif;color:#17212b;max-width:1050px;margin:30px auto;line-height:1.6}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{padding:8px;border:1px solid #ddd;text-align:left;font-size:12px}
th{background:#f4f7f9}
.box{padding:16px;border:1px solid #ccd9e2;background:#f8fafc;border-radius:8px;margin:14px 0}
h1{margin-bottom:4px;color:#0b1923}
.mono{font-family:monospace;word-break:break-all}
</style>
</head>
<body>
<h1>ChainSight Forensic Investigation Report</h1>
<div class="box">
  <b>Case Reference:</b> ${esc(state.caseId || 'UNSAVED-SESSION')}<br>
  <b>Subject Target:</b> <span class="mono">${esc(state.root)}</span><br>
  <b>Risk Prioritization Score:</b> ${state.risk}/100<br>
  <b>Observed Counterparties:</b> ${state.nodes.length} nodes across ${state.depth} hops<br>
  <b>Report Generated:</b> ${generated}<br>
  <b>Data Source:</b> ${esc(state.source)}
</div>
<h2>Risk Factors & Heuristics</h2>
<ul>${alerts || '<li>No elevated indicators recorded.</li>'}</ul>
<h2>Observed Transaction Evidence Ledger</h2>
<table>
  <thead><tr><th>#</th><th>Timestamp</th><th>Transaction Hash</th><th>From</th><th>To</th><th>Value</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6">No transactions.</td></tr>'}</tbody>
</table>
<h2>Evidence Boundary Statement</h2>
<p>On-chain records establish cryptographic and blockchain transaction facts. Physical identity and IP correlation are not inferred from transaction hashes alone and require lawful off-chain intelligence.</p>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chainsight-${state.caseId || 'investigation'}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Bind Enter keys and auto-initialize
document.addEventListener('DOMContentLoaded', () => {
  $('dashQuery')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') runInvestigationFromDash();
  });
  $('query')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') runInvestigation();
  });

  // Automatically initialize with interactive demo so the dashboard is immediately active
  loadDemo();
});

// Run immediate initialization if script executes after DOM is ready
if (document.readyState !== 'loading') {
  loadDemo();
}
