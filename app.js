const API = 'https://chainsight-api-sz3r.onrender.com';
let state = { root: '', depth: 3, txs: [], nodes: new Map(), alerts: [], risk: 0, mode: 'demo', source: 'Synthetic demonstration case' };
const $ = id => document.getElementById(id);
function showView(id, btn) { document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); $(id).classList.add('active'); document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active') }
function short(x) { return x ? x.slice(0, 7) + '…' + x.slice(-5) : '—' }
function eth(v) { return (Number(v || 0) / 1e18).toFixed(5) }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])) }
async function api(path) { const r = await fetch(API + path); if (!r.ok) throw new Error('Blockchain API returned ' + r.status); return r.json() }
function normalizeTx(t) { return { hash: t.hash || '', from: (t.from?.hash || t.from || '').toLowerCase(), to: (t.to?.hash || t.to || '').toLowerCase(), value: Number(t.value || 0), time: t.timestamp || '', block: t.block_number || 0 } }
function makeDemo() { const A = '0x1111111111111111111111111111111111111111', B = '0x2222222222222222222222222222222222222222', C = '0x3333333333333333333333333333333333333333', D = '0x4444444444444444444444444444444444444444', E = '0x5555555555555555555555555555555555555555', F = '0x6666666666666666666666666666666666666666', G = '0x7777777777777777777777777777777777777777'; const now = Date.now(); const mk = (i, f, t, v, min) => ({ hash: '0x' + String(i).padStart(64, '0'), from: f, to: t, value: v * 1e18, time: new Date(now - min * 60000).toISOString(), block: 0 }); return { root: C, txs: [mk(1, A, C, 3.1, 8), mk(2, C, D, 1.4, 6), mk(3, C, E, .8, 5), mk(4, C, F, .7, 4), mk(5, D, G, .6, 3), mk(6, F, B, .5, 2), mk(7, B, C, .45, 1), mk(8, E, C, .35, 1), mk(9, A, B, 2.2, 12), mk(10, D, F, .3, 2), mk(11, F, G, .25, 1), mk(12, C, B, .2, 1)] } }
function scoreNode(addr, txs) { const a = txs.filter(t => t.from === addr || t.to === addr), outs = a.filter(t => t.from === addr); const peers = new Set(a.map(t => t.from === addr ? t.to : t.from).filter(Boolean)); let s = 0; if (a.length >= 5) s += 15; if (a.length >= 10) s += 15; if (peers.size >= 3) s += 15; if (peers.size >= 6) s += 15; if (outs.length >= 4) s += 10; const times = a.map(t => Date.parse(t.time)).filter(Boolean).sort((x, y) => x - y); let rapid = 0; for (let i = 1; i < times.length; i++)if (times[i] - times[i - 1] < 120000) rapid++; if (rapid >= 2) s += 15; return Math.min(100, s) }
function buildGraph(rootTxs, root) { state.nodes = new Map(); rootTxs.forEach(t => { if (t.from) state.nodes.set(t.from, { addr: t.from, txs: [], risk: 0 }); if (t.to) state.nodes.set(t.to, { addr: t.to, txs: [], risk: 0 }); if (t.from) state.nodes.get(t.from).txs.push(t); if (t.to) state.nodes.get(t.to).txs.push(t) }); state.nodes.forEach(n => n.risk = scoreNode(n.addr, rootTxs)); state.alerts = []; state.nodes.forEach(n => { if (n.risk >= 30) state.alerts.push({ level: n.risk >= 70 ? 'CRITICAL' : n.risk >= 50 ? 'HIGH' : 'MEDIUM', title: n.risk >= 70 ? 'Rapid multi-hop movement' : n.risk >= 50 ? 'Counterparty expansion' : 'Elevated transaction activity', addr: n.addr, reason: `${n.txs.length} observed transactions and ${new Set(n.txs.map(t => t.from === n.addr ? t.to : t.from)).size} counterparties.` }) }); state.risk = state.nodes.get(root)?.risk || scoreNode(root, rootTxs) }
function renderGraph() { const svg = $('svg'); svg.innerHTML = ''; const ns = 'http://www.w3.org/2000/svg'; const nodes = [...state.nodes.values()].slice(0, 18); if (!nodes.length) return; const root = state.root.toLowerCase(); const center = nodes.find(n => n.addr === root) || nodes[0]; const others = nodes.filter(n => n !== center); center.x = 380; center.y = 250; others.forEach((n, i) => { const a = i / Math.max(1, others.length) * Math.PI * 2; n.x = 380 + Math.cos(a) * 260; n.y = 250 + Math.sin(a) * 190 }); const marker = document.createElementNS(ns, 'marker'); marker.setAttribute('id', 'arrow'); marker.setAttribute('viewBox', '0 0 10 10'); marker.setAttribute('refX', '9'); marker.setAttribute('refY', '5'); marker.setAttribute('markerWidth', '5'); marker.setAttribute('markerHeight', '5'); marker.setAttribute('orient', 'auto'); const p = document.createElementNS(ns, 'path'); p.setAttribute('d', 'M0 0L10 5L0 10z'); p.setAttribute('fill', '#526b7d'); marker.appendChild(p); const defs = document.createElementNS(ns, 'defs'); defs.appendChild(marker); svg.appendChild(defs); const pos = new Map(nodes.map(n => [n.addr, n])); state.txs.slice(0, 50).forEach(t => { const a = pos.get(t.from), b = pos.get(t.to); if (!a || !b) return; const l = document.createElementNS(ns, 'line'); Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#385263', 'stroke-width': '1.5', 'marker-end': 'url(#arrow)' }).forEach(([k, v]) => l.setAttribute(k, v)); svg.appendChild(l) }); nodes.forEach(n => { const g = document.createElementNS(ns, 'g'); g.style.cursor = 'pointer'; const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', n.x); c.setAttribute('cy', n.y); c.setAttribute('r', n === center ? 27 : 21); c.setAttribute('fill', '#08131b'); c.setAttribute('stroke', n.risk >= 70 ? '#ff647c' : n.risk >= 30 ? '#ffbd59' : '#55d6be'); c.setAttribute('stroke-width', '3'); g.appendChild(c); const t = document.createElementNS(ns, 'text'); t.setAttribute('x', n.x); t.setAttribute('y', n.y + 4); t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'svgtext'); t.textContent = n === center ? 'ROOT' : String.fromCharCode(65 + nodes.indexOf(n)); g.appendChild(t); const l = document.createElementNS(ns, 'text'); l.setAttribute('x', n.x); l.setAttribute('y', n.y + 38); l.setAttribute('text-anchor', 'middle'); l.setAttribute('class', 'edgeLabel'); l.textContent = short(n.addr); g.appendChild(l); g.onclick = () => selectNode(n); svg.appendChild(g) }) }
function selectNode(n) { if (!n) return; const risk = n.risk; const level = risk >= 70 ? 'CRITICAL' : risk >= 50 ? 'HIGH' : risk >= 30 ? 'MEDIUM' : 'LOW'; $('walletBox').innerHTML = `<div class="riskTop"><div><div class="label">Wallet</div><div class="mono">${esc(n.addr)}</div></div><span class="pill ${level === 'HIGH' || level === 'CRITICAL' ? 'high' : level === 'MEDIUM' ? 'medium' : 'low'}">${level}</span></div><div class="value">${risk}<span class="hint">/100</span></div><div class="bar"><i style="width:${risk}%"></i></div><div class="kv"><div><b>${n.txs.length}</b><span>Observed txns</span></div><div><b>${new Set(n.txs.map(t => t.from === n.addr ? t.to : t.from)).size}</b><span>Counterparties</span></div><div><b>${(n.txs.filter(t => t.to === n.addr).reduce((s, t) => s + t.value, 0) / 1e18).toFixed(4)} ETH</b><span>Incoming</span></div><div><b>${(n.txs.filter(t => t.from === n.addr).reduce((s, t) => s + t.value, 0) / 1e18).toFixed(4)} ETH</b><span>Outgoing</span></div></div>` }
function renderTable() { const rows = state.txs.slice(0, 40); $('txTable').innerHTML = rows.map(t => { const r = scoreNode(t.from, state.txs); const level = r >= 70 ? 'HIGH' : r >= 30 ? 'MEDIUM' : 'LOW'; return `<tr><td>${esc(t.time || '—')}</td><td class="mono">${esc(short(t.hash))}</td><td class="mono">${esc(short(t.from))}</td><td class="mono">${esc(short(t.to))}</td><td>${eth(t.value)} ETH</td><td><span class="status ${level.toLowerCase()}">${level}</span></td></tr>` }).join('') || '<tr><td colspan="6">No transactions returned.</td></tr>' }
function renderStats() { $('statNodes').textContent = state.nodes.size; $('statTx').textContent = state.txs.length; $('statAlerts').textContent = state.alerts.length; $('statValue').textContent = (state.txs.reduce((s, t) => s + t.value, 0) / 1e18).toFixed(2) + ' ETH'; $('patternBox').innerHTML = `<div style="margin-bottom:8px"><span class="status ${state.mode === 'live' ? 'low' : 'medium'}">${state.mode === 'live' ? 'LIVE ETHEREUM' : 'DEMO CASE'}</span></div>` + (state.alerts.length ? state.alerts.slice(0, 5).map(a => `<div class="alert"><b>${a.level} · ${esc(a.title)}</b><span class="mono">${esc(short(a.addr))}</span> — ${esc(a.reason)}</div>`).join('') : 'No elevated patterns detected by the current heuristic engine.'); $('alertsList').innerHTML = state.alerts.length ? state.alerts.map(a => `<div class="alert"><b>${a.level} · ${esc(a.title)}</b><span class="mono">${esc(a.addr)}</span> — ${esc(a.reason)}</div>`).join('') : '<div class="hint">No elevated patterns detected.</div>'; const badge = $('liveBadge'); badge.textContent = state.mode === 'live' ? '● LIVE ETHEREUM · API CONNECTED' : '● DEMO CASE · LIVE API READY'; badge.style.color = state.mode === 'live' ? '#55d6be' : '#ffbd59'; const sub = $('dashSub'); if (sub) sub.textContent = state.mode === 'live' ? 'Live cryptocurrency transaction intelligence.' : 'Demonstration investigation loaded. Run a live trace for real Ethereum data.' }
function populateCase() { renderStats(); renderGraph(); renderTable(); selectNode(state.nodes.get(state.root) || [...state.nodes.values()][0]); $('investigationResult').style.display = 'block'; $('liveDepth').textContent = state.depth + ' hops'; $('liveNodes').textContent = state.nodes.size; $('liveAlerts').textContent = state.alerts.length; $('liveRisk').textContent = state.risk + '/100'; $('liveSummary').textContent = `${state.mode === 'live' ? 'Retrieved' : 'Loaded'} ${state.txs.length} transactions across ${state.nodes.size} observed addresses.`; $('reportSubject').textContent = state.root; $('reportRisk').textContent = state.risk + '/100'; $('reportTrace').textContent = `${state.depth} hops / ${state.nodes.size} nodes` }
function loadDemo() { const d = makeDemo(); state.mode = 'demo'; state.source = 'Synthetic demonstration case'; state.root = d.root; state.depth = 3; state.txs = d.txs; buildGraph(state.txs, state.root); populateCase(); showView('dashboard', document.querySelector('.nav button')) }
async function loadWallet(addr, depth) {
    state.root = addr.toLowerCase();

    const data = await api(`/api/v1/trace/${state.root}?depth=${depth}`);

    const raw =
        data.transactions ||
        data.items ||
        data.data ||
        data.trace?.transactions ||
        data.result?.transactions ||
        data.result ||
        [];

    const txs = (Array.isArray(raw) ? raw : []).map(normalizeTx);

    if (!txs.length) {
        throw new Error('Trace returned no transaction records');
    }

    state.mode = 'live';
    state.source = 'ChainSight FastAPI → public Ethereum data';
    state.depth = depth;

    state.txs = [
        ...new Map(
            txs.filter(t => t.hash).map(t => [t.hash, t])
        ).values()
    ];

    buildGraph(state.txs, state.root);
    populateCase();
}
async function loadTransaction(hash, depth) { const tx = normalizeTx(await api(`/transactions/${hash}`)); if (!tx.from) throw new Error('Transaction was not found or has no sender'); state.root = tx.from; let all = [tx]; const seeds = [tx.from, tx.to].filter(Boolean); for (const a of seeds.slice(0, 2)) { all.push(...await fetchAddress(a)) } const uniq = [...new Map(all.filter(t => t.hash).map(t => [t.hash, t])).values()]; state.mode = 'live'; state.source = 'Ethereum transaction / Blockscout API'; state.depth = Math.min(depth, 1); state.txs = uniq; buildGraph(uniq, state.root); populateCase() }
function addDemoButton() { const panel = document.querySelector('#dashboard .top'); if (panel && !document.getElementById('demoBtn')) { const b = document.createElement('button'); b.id = 'demoBtn'; b.className = 'btn'; b.textContent = 'Load Demo Case'; b.onclick = loadDemo; panel.appendChild(b) } const inv = document.querySelector('#investigate .controls'); if (inv && !document.getElementById('demoBtn2')) { const b = document.createElement('button'); b.id = 'demoBtn2'; b.className = 'btn'; b.textContent = 'Demo'; b.onclick = loadDemo; inv.appendChild(b) } }
async function runInvestigation() { const q = $('query').value.trim().toLowerCase(); const d = Number($('depth').value); const st = $('traceStatus'); st.style.display = 'block'; if (/^0x[a-f0-9]{64}$/.test(q)) { try { st.textContent = 'Looking up transaction hash…'; await loadTransaction(q, d); st.style.display = 'none'; showView('dashboard', document.querySelector('.nav button')); return } catch (e) { st.textContent = 'Transaction lookup failed: ' + e.message; return } } if (!/^0x[a-f0-9]{40}$/.test(q)) { st.textContent = 'Enter a valid Ethereum wallet address (0x + 40 hex) or transaction hash (0x + 64 hex).'; return } try { st.textContent = 'Querying Ethereum…'; await loadWallet(q, d); st.style.display = 'none'; showView('dashboard', document.querySelector('.nav button')) } catch (e) { st.textContent = 'Live lookup failed: ' + e.message + '. Try again or verify the address.' } }
function downloadReport() {
    const subject = esc(state.root || 'Unknown');
    const risk = esc(state.risk + '/100');
    const trace = esc(state.depth + ' hops / ' + state.nodes.size + ' nodes');
    const alerts = state.alerts.length
        ? state.alerts.map(a => `<tr>
<td>${esc(a.level)}</td>
<td>${esc(a.title)}</td>
<td class="mono">${esc(a.addr)}</td>
<td>${esc(a.reason)}</td>
</tr>`).join('')
        : '<tr><td colspan="4">No elevated risk indicators detected.</td></tr>';

    const evidence = state.txs.slice(0, 100).map(t => `
<tr>
<td>${esc(t.time || '—')}</td>
<td class="mono">${esc(t.hash)}</td>
<td class="mono">${esc(t.from)}</td>
<td class="mono">${esc(t.to)}</td>
<td>${eth(t.value)} ETH</td>
</tr>`).join('');

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>ChainSight Investigation Report</title>
<style>
body{
font-family:Arial,sans-serif;
max-width:1100px;
margin:40px auto;
padding:0 25px;
color:#17212b;
line-height:1.5
}
h1{margin-bottom:4px}
h2{
margin-top:30px;
border-bottom:2px solid #ddd;
padding-bottom:6px
}
.meta{
display:grid;
grid-template-columns:repeat(3,1fr);
gap:12px
}
.card{
border:1px solid #ddd;
border-radius:8px;
padding:15px
}
.label{
font-size:11px;
color:#667;
text-transform:uppercase
}
.value{
font-size:22px;
font-weight:bold;
margin-top:5px
}
table{
width:100%;
border-collapse:collapse;
font-size:11px
}
th,td{
border-bottom:1px solid #ddd;
padding:8px;
text-align:left
}
th{background:#f1f4f6}
.mono{
font-family:monospace;
word-break:break-all
}
.warning{
background:#fff4f4;
border-left:4px solid #e44;
padding:12px
}
@media print{
body{margin:15px}
button{display:none}
}
</style>
</head>
<body>

<h1>ChainSight Investigation Report</h1>
<p>Cryptocurrency Transaction Intelligence & Investigation Platform</p>

<div class="meta">

<div class="card">
<div class="label">Investigation Subject</div>
<div class="value mono">${subject}</div>
</div>

<div class="card">
<div class="label">Risk Score</div>
<div class="value">${risk}</div>
</div>

<div class="card">
<div class="label">Trace Scope</div>
<div class="value">${trace}</div>
</div>

<div class="card">
<div class="label">Wallets Observed</div>
<div class="value">${state.nodes.size}</div>
</div>

<div class="card">
<div class="label">Transactions</div>
<div class="value">${state.txs.length}</div>
</div>

<div class="card">
<div class="label">Value Observed</div>
<div class="value">${(state.txs.reduce((s, t) => s + t.value, 0) / 1e18).toFixed(5)} ETH</div>
</div>

</div>

<h2>Risk Indicators</h2>

<table>
<thead>
<tr>
<th>Level</th>
<th>Indicator</th>
<th>Wallet</th>
<th>Reason</th>
</tr>
</thead>
<tbody>
${alerts}
</tbody>
</table>

<h2>Transaction Evidence</h2>

<table>
<thead>
<tr>
<th>Timestamp</th>
<th>Transaction Hash</th>
<th>From</th>
<th>To</th>
<th>Amount</th>
</tr>
</thead>
<tbody>
${evidence}
</tbody>
</table>

<h2>Evidence Boundary</h2>

<div class="warning">
<strong>Important:</strong>
Blockchain records establish on-chain transaction facts.
The risk score is an investigative prioritization signal and
is not proof of criminal conduct.
A blockchain transaction does not inherently reveal a user's
IP address or real-world identity. Any identity or IP
correlation requires separate lawful and authorized
off-chain intelligence.
</div>

<h2>Data Provenance</h2>

<p>
<strong>Mode:</strong> ${esc(state.mode)}<br>
<strong>Source:</strong> ${esc(state.source)}<br>
<strong>Generated:</strong> ${new Date().toISOString()}
</p>

<p>
ChainSight — Crypto Intelligence & Investigation Platform
</p>

</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ChainSight-Investigation-Report.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
addDemoButton();
const API='https://chainsight-api-sz3r.onrender.com';
let state={root:'',depth:3,txs:[],nodes:[],alerts:[],risk:0,mode:'idle',source:'',caseId:null,evidence:[]};
const $=id=>document.getElementById(id); const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const short=x=>x?x.slice(0,7)+'…'+x.slice(-5):'—'; const eth=v=>(Number(v||0)/1e18).toFixed(5);
async function api(path,opts={}){const r=await fetch(API+path,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});let data={};try{data=await r.json()}catch{}if(!r.ok)throw new Error(data.detail||`API returned ${r.status}`);return data}
function showView(id,btn){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$(id).classList.add('active');document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');if(id==='cases')loadCases()}
function normalizeTx(t){return {hash:t.hash||'',from:(t.from?.hash||t.from||'').toLowerCase(),to:(t.to?.hash||t.to||'').toLowerCase(),value:Number(t.value||0),time:t.timestamp||t.time||'',block:Number(t.block_number||t.block||0)}}
function buildFromBackend(data){state.root=data.root.toLowerCase();state.depth=data.depth;state.txs=(data.transactions||[]).map(normalizeTx);state.nodes=data.nodes||[];state.alerts=data.alerts||[];state.risk=Number(data.risk||0);state.source=data.source||'Ethereum / Blockscout API';state.mode='live';state.caseId=null;state.evidence=[];renderAll()}
function makeDemo(){const A='0x1111111111111111111111111111111111111111',B='0x2222222222222222222222222222222222222222',C='0x3333333333333333333333333333333333333333',D='0x4444444444444444444444444444444444444444',E='0x5555555555555555555555555555555555555555',F='0x6666666666666666666666666666666666666666';const now=Date.now();const mk=(i,f,t,v,m)=>({hash:'0x'+String(i).padStart(64,'0'),from:f,to:t,value:v*1e18,time:new Date(now-m*60000).toISOString(),block:0});return {root:C,depth:3,transactions:[mk(1,A,C,3.1,8),mk(2,C,D,1.4,6),mk(3,C,E,.8,5),mk(4,C,F,.7,4),mk(5,D,B,.6,3),mk(6,F,B,.5,2),mk(7,B,C,.45,1),mk(8,E,C,.35,1),mk(9,C,B,.2,1)]}}
function demoNodes(txs,root){const map=new Map();for(const t of txs)for(const a of [t.from,t.to])if(a){if(!map.has(a))map.set(a,{address:a,transactions:[],risk:0,risk_factors:[]});map.get(a).transactions.push(t)}for(const n of map.values()){const peers=new Set(n.transactions.map(t=>t.from===n.address?t.to:t.from).filter(Boolean));n.counterparties=peers.size;n.risk=Math.min((n.transactions.length>=5?15:0)+(peers.size>=3?15:0)+(n.transactions.filter(t=>t.from===n.address).length>=4?10:0),100)}return [...map.values()]}
function loadDemo(){const d=makeDemo();state.root=d.root;state.depth=d.depth;state.txs=d.transactions.map(normalizeTx);state.nodes=demoNodes(state.txs,state.root);state.risk=state.nodes.find(n=>n.address===state.root)?.risk||0;state.alerts=state.nodes.filter(n=>n.risk>=30).map(n=>({level:n.risk>=50?'HIGH':'MEDIUM',title:'Elevated transaction activity',address:n.address,addr:n.address,reason:`${n.transactions.length} observed transactions and ${n.counterparties} counterparties.`,score:n.risk,factors:[]}));state.source='Synthetic demonstration case';state.mode='demo';state.caseId=null;state.evidence=[];renderAll();showView('dashboard',document.querySelector('.nav button'))}
async function runInvestigation(){const q=$('query').value.trim().toLowerCase(),depth=Number($('depth').value),st=$('traceStatus');st.style.display='block';try{if(/^0x[a-f0-9]{64}$/.test(q)){st.textContent='Looking up transaction…';const tx=normalizeTx(await api('/api/v1/transaction/'+q));const data=await api('/api/v1/trace/'+tx.from+'?depth=1');buildFromBackend(data)}else if(/^0x[a-f0-9]{40}$/.test(q)){st.textContent='Querying Ethereum and building trace…';buildFromBackend(await api('/api/v1/trace/'+q+'?depth='+depth))}else throw new Error('Enter a valid Ethereum wallet address or transaction hash.');st.style.display='none';showView('dashboard',document.querySelector('.nav button'))}catch(e){st.textContent='Live lookup failed: '+e.message}}
function renderAll(){renderStats();renderGraph();renderTable();renderAlerts();renderSelected();renderReport();$('investigationResult').style.display=state.txs.length?'block':'none';if($('liveDepth'))$('liveDepth').textContent=state.depth+' hops';if($('liveNodes'))$('liveNodes').textContent=state.nodes.length;if($('liveAlerts'))$('liveAlerts').textContent=state.alerts.length;if($('liveRisk'))$('liveRisk').textContent=state.risk+'/100';$('dashSub').textContent=state.mode==='live'?'Live Ethereum investigation · backend risk engine':'Synthetic demonstration case';$('liveBadge').textContent=state.mode==='live'?'● LIVE ETHEREUM · CASE READY':state.mode==='demo'?'● DEMO CASE':'● API READY';$('liveBadge').style.color=state.mode==='idle'?'#ffbd59':'#55d6be'}
function renderStats(){$('statNodes').textContent=state.nodes.length||'—';$('statTx').textContent=state.txs.length||'—';$('statAlerts').textContent=state.alerts.length||'—';$('statValue').textContent=state.txs.length?(state.txs.reduce((s,t)=>s+t.value,0)/1e18).toFixed(2)+' ETH':'—'}
function renderGraph(){const svg=$('svg');svg.innerHTML='';const ns='http://www.w3.org/2000/svg';const nodes=state.nodes.slice(0,18);if(!nodes.length)return;const center=nodes.find(n=>n.address===state.root)||nodes[0];center.x=380;center.y=250;nodes.filter(n=>n!==center).forEach((n,i)=>{const a=i/Math.max(1,nodes.length-1)*Math.PI*2;n.x=380+Math.cos(a)*260;n.y=250+Math.sin(a)*190});const pos=new Map(nodes.map(n=>[n.address,n]));state.txs.slice(0,80).forEach(tx=>{const a=pos.get(tx.from),b=pos.get(tx.to);if(!a||!b)return;const l=document.createElementNS(ns,'line');for(const [k,v] of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#385263','stroke-width':'1.5'}))l.setAttribute(k,v);svg.appendChild(l)});nodes.forEach((n,i)=>{const g=document.createElementNS(ns,'g');const c=document.createElementNS(ns,'circle');c.setAttribute('cx',n.x);c.setAttribute('cy',n.y);c.setAttribute('r',n===center?27:21);c.setAttribute('fill','#08131b');c.setAttribute('stroke',n.risk>=70?'#ff647c':n.risk>=30?'#ffbd59':'#55d6be');c.setAttribute('stroke-width','3');g.appendChild(c);const t=document.createElementNS(ns,'text');t.setAttribute('x',n.x);t.setAttribute('y',n.y+4);t.setAttribute('text-anchor','middle');t.setAttribute('class','svgtext');t.textContent=n===center?'ROOT':String.fromCharCode(65+i);g.appendChild(t);const l=document.createElementNS(ns,'text');l.setAttribute('x',n.x);l.setAttribute('y',n.y+38);l.setAttribute('text-anchor','middle');l.setAttribute('class','edgeLabel');l.textContent=short(n.address);g.appendChild(l);g.onclick=()=>selectNode(n);svg.appendChild(g)})}
function selectNode(n){if(!n)return;const risk=Number(n.risk||0),level=risk>=70?'CRITICAL':risk>=50?'HIGH':risk>=30?'MEDIUM':'LOW',txs=Array.isArray(n.transactions)?n.transactions:state.txs.filter(t=>t.from===n.address||t.to===n.address);$('walletBox').innerHTML=`<div class="riskTop"><div><div class="label">Wallet</div><div class="mono">${esc(n.address)}</div></div><span class="pill ${level==='LOW'?'low':level==='MEDIUM'?'medium':'high'}">${level}</span></div><div class="value">${risk}<span class="hint">/100</span></div><div class="bar"><i style="width:${risk}%"></i></div><div class="kv"><div><b>${txs.length}</b><span>Observed txns</span></div><div><b>${n.counterparties||0}</b><span>Counterparties</span></div></div>`}
function renderSelected(){selectNode(state.nodes.find(n=>n.address===state.root)||state.nodes[0])}
function renderTable(){$('txTable').innerHTML=state.txs.slice(0,60).map(t=>`<tr><td>${esc(t.time||'—')}</td><td class="mono">${esc(short(t.hash))}</td><td class="mono">${esc(short(t.from))}</td><td class="mono">${esc(short(t.to))}</td><td>${eth(t.value)} ETH</td><td><span class="status low">ON-CHAIN</span></td></tr>`).join('')||'<tr><td colspan="6">No transaction records.</td></tr>'}
function renderAlerts(){$('alertsList').innerHTML=state.alerts.length?state.alerts.map(a=>`<div class="alert"><b>${esc(a.level)} · ${esc(a.title)}</b><span class="mono">${esc(a.address||a.addr)}</span><div>${esc(a.reason)}</div></div>`).join(''):'<div class="empty">No elevated indicators.</div>';$('patternBox').innerHTML=state.alerts.slice(0,5).map(a=>`<div class="alert"><b>${esc(a.level)} · ${esc(a.title)}</b>${esc(a.reason)}</div>`).join('')||'No elevated patterns.'}
function renderReport(){$('reportSubject').textContent=state.root||'—';$('reportRisk').textContent=state.risk?state.risk+'/100':'—';$('reportTrace').textContent=state.txs.length?`${state.depth} hops / ${state.nodes.length} nodes`:'—';$('reportEvidence').textContent=state.evidence.length?state.evidence.length:`${state.txs.length} transaction records`;$('reportCase').textContent=state.caseId||'UNSAVED'}
async function saveCurrentCase(){if(!state.root||!state.txs.length)return;const s=$('saveStatus');s.textContent='Saving…';try{const data=await api('/api/v1/cases',{method:'POST',body:JSON.stringify({subject:state.root,depth:state.depth,risk:state.risk,status:'active',source:state.source,transactions:state.txs,alerts:state.alerts})});state.caseId=data.case_id;state.evidence=Array.from({length:data.transaction_count},(_,i)=>({evidence_id:`EV-${String(i+1).padStart(4,'0')}`}));renderReport();s.textContent=`Saved as ${data.case_id}`;loadCases()}catch(e){s.textContent='Save failed: '+e.message}}
async function loadCases(){const list=$('caseList');if(!list)return;list.innerHTML='<div class="empty">Loading…</div>';try{const data=await api('/api/v1/cases');if(!data.items.length){list.innerHTML='<div class="empty">No saved cases yet. Run an investigation and save it.</div>';return}list.innerHTML=data.items.map(c=>`<div class="case-row"><div><b>${esc(c.case_id)}</b><div class="small mono">${esc(short(c.subject))}</div></div><div><span class="status ${c.risk>=50?'high':c.risk>=30?'medium':'low'}">${c.risk}/100</span> <span class="small">${esc(c.status)}</span></div><div>${c.transaction_count} txns</div><div>${c.evidence_count} evidence</div><div><button class="btn" onclick="openCase('${esc(c.case_id)}')">Open</button></div></div>`).join('')}catch(e){list.innerHTML=`<div class="empty">${esc(e.message)}</div>`}}
async function openCase(id){try{const c=await api('/api/v1/cases/'+encodeURIComponent(id));state.caseId=c.case_id;state.root=c.subject;state.depth=c.depth;state.risk=c.risk;state.source=c.source;state.txs=(c.transactions||[]).map(normalizeTx);state.alerts=c.alerts||[];state.evidence=c.evidence||[];state.nodes=demoNodes(state.txs,state.root);state.mode='live';renderAll();$('caseDetail').innerHTML=`<div class="case-head"><div><h2>${esc(c.case_id)}</h2><div class="mono">${esc(c.subject)}</div></div><span class="status ${c.risk>=50?'high':c.risk>=30?'medium':'low'}">${c.risk}/100</span></div><div class="cards" style="margin-top:12px"><div class="card"><div class="label">Transactions</div><div class="value">${c.transaction_count}</div></div><div class="card"><div class="label">Alerts</div><div class="value">${c.alert_count}</div></div><div class="card"><div class="label">Evidence</div><div class="value">${c.evidence_count}</div></div><div class="card"><div class="label">Status</div><div class="value">${esc(c.status)}</div></div></div><h3>Evidence provenance</h3>${(c.evidence||[]).slice(0,100).map(e=>`<div class="notice"><b>${esc(e.evidence_id)}</b> · ${esc(e.evidence_type)}<div class="mono">${esc(e.reference)}</div><div class="provenance"><b>Source:</b> ${esc(e.source)} · <b>Retrieved:</b> ${esc(e.retrieved_at)}</div></div>`).join('')||'<div class="empty">No evidence.</div>'}`;$('caseModal').classList.add('open')}catch(e){alert(e.message)}}
function closeCase(){$('caseModal').classList.remove('open')}
function downloadReport(){const generated=new Date().toISOString(),rows=state.txs.slice(0,100).map((t,i)=>`<tr><td>${i+1}</td><td>${esc(t.time)}</td><td>${esc(t.hash)}</td><td>${esc(t.from)}</td><td>${esc(t.to)}</td><td>${eth(t.value)} ETH</td></tr>`).join('');const alerts=state.alerts.map(a=>`<li><b>${esc(a.level)} · ${esc(a.title)}</b> — ${esc(a.reason)}</li>`).join('');const html=`<!doctype html><html><head><meta charset="utf-8"><title>ChainSight ${esc(state.caseId||'Investigation')}</title><style>body{font:14px Arial;color:#17212b;max-width:1100px;margin:30px auto;line-height:1.5}table{width:100%;border-collapse:collapse}th,td{padding:7px;border:1px solid #ddd;text-align:left;font-size:11px}.box{padding:12px;border:1px solid #ddd;margin:10px 0}h1{margin-bottom:3px}.mono{font-family:monospace;word-break:break-all}</style></head><body><h1>ChainSight Investigation Report</h1><div class="box"><b>Case:</b> ${esc(state.caseId||'UNSAVED')}<br><b>Subject:</b> <span class="mono">${esc(state.root)}</span><br><b>Risk:</b> ${state.risk}/100<br><b>Trace:</b> ${state.depth} hops / ${state.nodes.length} nodes<br><b>Generated:</b> ${generated}<br><b>Source:</b> ${esc(state.source)}</div><h2>Risk indicators</h2><ul>${alerts||'<li>No elevated indicators.</li>'}</ul><h2>Transaction evidence</h2><table><thead><tr><th>#</th><th>Time</th><th>Hash</th><th>From</th><th>To</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table><h2>Evidence boundary</h2><p>On-chain records establish transaction facts. IP/identity correlation is not inferred from a transaction hash and requires separate lawful, authorized off-chain intelligence.</p></body></html>`;const blob=new Blob([html],{type:'text/html'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`chainsight-${state.caseId||'investigation'}.html`;a.click();URL.revokeObjectURL(a.href)}
renderAll();
