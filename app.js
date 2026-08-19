const API='https://chainsight-api-sz3r.onrender.com';
let state={root:'',depth:3,txs:[],nodes:new Map(),alerts:[],risk:0,mode:'demo',source:'Synthetic demonstration case'};
const $=id=>document.getElementById(id);
function showView(id,btn){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$(id).classList.add('active');document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active')}
function short(x){return x?x.slice(0,7)+'…'+x.slice(-5):'—'}
function eth(v){return (Number(v||0)/1e18).toFixed(5)}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
async function api(path){const r=await fetch(API+path);if(!r.ok)throw new Error('Blockchain API returned '+r.status);return r.json()}
function normalizeTx(t){return {hash:t.hash||'',from:(t.from?.hash||t.from||'').toLowerCase(),to:(t.to?.hash||t.to||'').toLowerCase(),value:Number(t.value||0),time:t.timestamp||'',block:t.block_number||0}}
function makeDemo(){const A='0x1111111111111111111111111111111111111111',B='0x2222222222222222222222222222222222222222',C='0x3333333333333333333333333333333333333333',D='0x4444444444444444444444444444444444444444',E='0x5555555555555555555555555555555555555555',F='0x6666666666666666666666666666666666666666',G='0x7777777777777777777777777777777777777777';const now=Date.now();const mk=(i,f,t,v,min)=>({hash:'0x'+String(i).padStart(64,'0'),from:f,to:t,value:v*1e18,time:new Date(now-min*60000).toISOString(),block:0});return {root:C,txs:[mk(1,A,C,3.1,8),mk(2,C,D,1.4,6),mk(3,C,E,.8,5),mk(4,C,F,.7,4),mk(5,D,G,.6,3),mk(6,F,B,.5,2),mk(7,B,C,.45,1),mk(8,E,C,.35,1),mk(9,A,B,2.2,12),mk(10,D,F,.3,2),mk(11,F,G,.25,1),mk(12,C,B,.2,1)]}}
function scoreNode(addr,txs){const a=txs.filter(t=>t.from===addr||t.to===addr),outs=a.filter(t=>t.from===addr);const peers=new Set(a.map(t=>t.from===addr?t.to:t.from).filter(Boolean));let s=0;if(a.length>=5)s+=15;if(a.length>=10)s+=15;if(peers.size>=3)s+=15;if(peers.size>=6)s+=15;if(outs.length>=4)s+=10;const times=a.map(t=>Date.parse(t.time)).filter(Boolean).sort((x,y)=>x-y);let rapid=0;for(let i=1;i<times.length;i++)if(times[i]-times[i-1]<120000)rapid++;if(rapid>=2)s+=15;return Math.min(100,s)}
function buildGraph(rootTxs,root){state.nodes=new Map();rootTxs.forEach(t=>{if(t.from)state.nodes.set(t.from,{addr:t.from,txs:[],risk:0});if(t.to)state.nodes.set(t.to,{addr:t.to,txs:[],risk:0});if(t.from)state.nodes.get(t.from).txs.push(t);if(t.to)state.nodes.get(t.to).txs.push(t)});state.nodes.forEach(n=>n.risk=scoreNode(n.addr,rootTxs));state.alerts=[];state.nodes.forEach(n=>{if(n.risk>=30)state.alerts.push({level:n.risk>=70?'CRITICAL':n.risk>=50?'HIGH':'MEDIUM',title:n.risk>=70?'Rapid multi-hop movement':n.risk>=50?'Counterparty expansion':'Elevated transaction activity',addr:n.addr,reason:`${n.txs.length} observed transactions and ${new Set(n.txs.map(t=>t.from===n.addr?t.to:t.from)).size} counterparties.`})});state.risk=state.nodes.get(root)?.risk||scoreNode(root,rootTxs)}
function renderGraph(){const svg=$('svg');svg.innerHTML='';const ns='http://www.w3.org/2000/svg';const nodes=[...state.nodes.values()].slice(0,18);if(!nodes.length)return;const root=state.root.toLowerCase();const center=nodes.find(n=>n.addr===root)||nodes[0];const others=nodes.filter(n=>n!==center);center.x=380;center.y=250;others.forEach((n,i)=>{const a=i/Math.max(1,others.length)*Math.PI*2;n.x=380+Math.cos(a)*260;n.y=250+Math.sin(a)*190});const marker=document.createElementNS(ns,'marker');marker.setAttribute('id','arrow');marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','9');marker.setAttribute('refY','5');marker.setAttribute('markerWidth','5');marker.setAttribute('markerHeight','5');marker.setAttribute('orient','auto');const p=document.createElementNS(ns,'path');p.setAttribute('d','M0 0L10 5L0 10z');p.setAttribute('fill','#526b7d');marker.appendChild(p);const defs=document.createElementNS(ns,'defs');defs.appendChild(marker);svg.appendChild(defs);const pos=new Map(nodes.map(n=>[n.addr,n]));state.txs.slice(0,50).forEach(t=>{const a=pos.get(t.from),b=pos.get(t.to);if(!a||!b)return;const l=document.createElementNS(ns,'line');Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#385263','stroke-width':'1.5','marker-end':'url(#arrow)'}).forEach(([k,v])=>l.setAttribute(k,v));svg.appendChild(l)});nodes.forEach(n=>{const g=document.createElementNS(ns,'g');g.style.cursor='pointer';const c=document.createElementNS(ns,'circle');c.setAttribute('cx',n.x);c.setAttribute('cy',n.y);c.setAttribute('r',n===center?27:21);c.setAttribute('fill','#08131b');c.setAttribute('stroke',n.risk>=70?'#ff647c':n.risk>=30?'#ffbd59':'#55d6be');c.setAttribute('stroke-width','3');g.appendChild(c);const t=document.createElementNS(ns,'text');t.setAttribute('x',n.x);t.setAttribute('y',n.y+4);t.setAttribute('text-anchor','middle');t.setAttribute('class','svgtext');t.textContent=n===center?'ROOT':String.fromCharCode(65+nodes.indexOf(n));g.appendChild(t);const l=document.createElementNS(ns,'text');l.setAttribute('x',n.x);l.setAttribute('y',n.y+38);l.setAttribute('text-anchor','middle');l.setAttribute('class','edgeLabel');l.textContent=short(n.addr);g.appendChild(l);g.onclick=()=>selectNode(n);svg.appendChild(g)})}
function selectNode(n){if(!n)return;const risk=n.risk;const level=risk>=70?'CRITICAL':risk>=50?'HIGH':risk>=30?'MEDIUM':'LOW';$('walletBox').innerHTML=`<div class="riskTop"><div><div class="label">Wallet</div><div class="mono">${esc(n.addr)}</div></div><span class="pill ${level==='HIGH'||level==='CRITICAL'?'high':level==='MEDIUM'?'medium':'low'}">${level}</span></div><div class="value">${risk}<span class="hint">/100</span></div><div class="bar"><i style="width:${risk}%"></i></div><div class="kv"><div><b>${n.txs.length}</b><span>Observed txns</span></div><div><b>${new Set(n.txs.map(t=>t.from===n.addr?t.to:t.from)).size}</b><span>Counterparties</span></div><div><b>${(n.txs.filter(t=>t.to===n.addr).reduce((s,t)=>s+t.value,0)/1e18).toFixed(4)} ETH</b><span>Incoming</span></div><div><b>${(n.txs.filter(t=>t.from===n.addr).reduce((s,t)=>s+t.value,0)/1e18).toFixed(4)} ETH</b><span>Outgoing</span></div></div>`}
function renderTable(){const rows=state.txs.slice(0,40);$('txTable').innerHTML=rows.map(t=>{const r=scoreNode(t.from,state.txs);const level=r>=70?'HIGH':r>=30?'MEDIUM':'LOW';return `<tr><td>${esc(t.time||'—')}</td><td class="mono">${esc(short(t.hash))}</td><td class="mono">${esc(short(t.from))}</td><td class="mono">${esc(short(t.to))}</td><td>${eth(t.value)} ETH</td><td><span class="status ${level.toLowerCase()}">${level}</span></td></tr>`}).join('')||'<tr><td colspan="6">No transactions returned.</td></tr>'}
function renderStats(){ $('statNodes').textContent=state.nodes.size; $('statTx').textContent=state.txs.length; $('statAlerts').textContent=state.alerts.length; $('statValue').textContent=(state.txs.reduce((s,t)=>s+t.value,0)/1e18).toFixed(2)+' ETH'; $('patternBox').innerHTML=`<div style="margin-bottom:8px"><span class="status ${state.mode==='live'?'low':'medium'}">${state.mode==='live'?'LIVE ETHEREUM':'DEMO CASE'}</span></div>`+(state.alerts.length?state.alerts.slice(0,5).map(a=>`<div class="alert"><b>${a.level} · ${esc(a.title)}</b><span class="mono">${esc(short(a.addr))}</span> — ${esc(a.reason)}</div>`).join(''):'No elevated patterns detected by the current heuristic engine.');$('alertsList').innerHTML=state.alerts.length?state.alerts.map(a=>`<div class="alert"><b>${a.level} · ${esc(a.title)}</b><span class="mono">${esc(a.addr)}</span> — ${esc(a.reason)}</div>`).join(''):'<div class="hint">No elevated patterns detected.</div>';const badge=$('liveBadge');badge.textContent=state.mode==='live'?'● LIVE ETHEREUM · API CONNECTED':'● DEMO CASE · LIVE API READY';badge.style.color=state.mode==='live'?'#55d6be':'#ffbd59';const sub=$('dashSub');if(sub)sub.textContent=state.mode==='live'?'Live cryptocurrency transaction intelligence.':'Demonstration investigation loaded. Run a live trace for real Ethereum data.'}
function populateCase(){renderStats();renderGraph();renderTable();selectNode(state.nodes.get(state.root)||[...state.nodes.values()][0]);$('investigationResult').style.display='block';$('liveDepth').textContent=state.depth+' hops';$('liveNodes').textContent=state.nodes.size;$('liveAlerts').textContent=state.alerts.length;$('liveRisk').textContent=state.risk+'/100';$('liveSummary').textContent=`${state.mode==='live'?'Retrieved':'Loaded'} ${state.txs.length} transactions across ${state.nodes.size} observed addresses.`;$('reportSubject').textContent=state.root;$('reportRisk').textContent=state.risk+'/100';$('reportTrace').textContent=`${state.depth} hops / ${state.nodes.size} nodes`}
function loadDemo(){const d=makeDemo();state.mode='demo';state.source='Synthetic demonstration case';state.root=d.root;state.depth=3;state.txs=d.txs;buildGraph(state.txs,state.root);populateCase();showView('dashboard',document.querySelector('.nav button'))}
async function loadWallet(addr,depth){
    state.root=addr.toLowerCase();

    const data=await api(`/api/v1/trace/${state.root}?depth=${depth}`);

    const raw =
        data.transactions ||
        data.items ||
        data.data ||
        data.trace?.transactions ||
        data.result?.transactions ||
        data.result ||
        [];

    const txs=(Array.isArray(raw)?raw:[]).map(normalizeTx);

    if(!txs.length){
        throw new Error('Trace returned no transaction records');
    }

    state.mode='live';
    state.source='ChainSight FastAPI → public Ethereum data';
    state.depth=depth;

    state.txs=[
        ...new Map(
            txs.filter(t=>t.hash).map(t=>[t.hash,t])
        ).values()
    ];

    buildGraph(state.txs,state.root);
    populateCase();
}
async function loadTransaction(hash,depth){const tx=normalizeTx(await api(`/transactions/${hash}`));if(!tx.from)throw new Error('Transaction was not found or has no sender');state.root=tx.from;let all=[tx];const seeds=[tx.from,tx.to].filter(Boolean);for(const a of seeds.slice(0,2)){all.push(...await fetchAddress(a))}const uniq=[...new Map(all.filter(t=>t.hash).map(t=>[t.hash,t])).values()];state.mode='live';state.source='Ethereum transaction / Blockscout API';state.depth=Math.min(depth,1);state.txs=uniq;buildGraph(uniq,state.root);populateCase()}
function addDemoButton(){const panel=document.querySelector('#dashboard .top');if(panel&&!document.getElementById('demoBtn')){const b=document.createElement('button');b.id='demoBtn';b.className='btn';b.textContent='Load Demo Case';b.onclick=loadDemo;panel.appendChild(b)}const inv=document.querySelector('#investigate .controls');if(inv&&!document.getElementById('demoBtn2')){const b=document.createElement('button');b.id='demoBtn2';b.className='btn';b.textContent='Demo';b.onclick=loadDemo;inv.appendChild(b)}}
async function runInvestigation(){const q=$('query').value.trim().toLowerCase();const d=Number($('depth').value);const st=$('traceStatus');st.style.display='block';if(/^0x[a-f0-9]{64}$/.test(q)){try{st.textContent='Looking up transaction hash…';await loadTransaction(q,d);st.style.display='none';showView('dashboard',document.querySelector('.nav button'));return}catch(e){st.textContent='Transaction lookup failed: '+e.message;return}}if(!/^0x[a-f0-9]{40}$/.test(q)){st.textContent='Enter a valid Ethereum wallet address (0x + 40 hex) or transaction hash (0x + 64 hex).';return}try{st.textContent='Querying Ethereum…';await loadWallet(q,d);st.style.display='none';showView('dashboard',document.querySelector('.nav button'))}catch(e){st.textContent='Live lookup failed: '+e.message+'. Try again or verify the address.'}}
function downloadReport(){
const subject=esc(state.root||'Unknown');
const risk=Number(state.risk||0);
const trace=esc(`${state.depth} hops / ${state.nodes.size} nodes`);
const generated=new Date().toISOString();
const totalValue=(state.txs.reduce((s,t)=>s+t.value,0)/1e18).toFixed(5);
const riskLevel=risk>=70?'CRITICAL':risk>=50?'HIGH':risk>=30?'MEDIUM':'LOW';

const alerts=state.alerts.length
?state.alerts.map((a,i)=>`
<article class="alert ${String(a.level).toLowerCase()}">
<div class="alertHead">
<span class="badge">${esc(a.level)}</span>
<strong>${esc(a.title)}</strong>
<span class="alertNo">#${i+1}</span>
</div>
<div class="mono addr">${esc(a.addr)}</div>
<p>${esc(a.reason)}</p>
</article>`).join('')
:'<div class="empty">No elevated risk indicators detected by the current heuristic engine.</div>';

const evidence=state.txs.slice(0,100).map((t,i)=>{
const r=scoreNode(t.from,state.txs);
const level=r>=70?'HIGH':r>=30?'MEDIUM':'LOW';

return `
<tr>
<td>${i+1}</td>
<td>${esc(t.time||'—')}</td>
<td class="mono">${esc(short(t.hash))}</td>
<td class="mono">${esc(short(t.from))}</td>
<td class="mono">${esc(short(t.to))}</td>
<td>${eth(t.value)} ETH</td>
<td>
<span class="status ${level.toLowerCase()}">${level}</span>
</td>
</tr>`;
}).join('')||`
<tr>
<td colspan="7">No transaction records available.</td>
</tr>`;

const graph=$('svg')?.outerHTML||'';

const html=`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ChainSight Investigation Report</title>

<style>
:root{
--bg:#f5f7f9;
--ink:#17212b;
--muted:#63717d;
--line:#d9e0e5;
--panel:#fff;
--accent:#0f766e;
--danger:#c92d4b;
--warn:#a05a00
}

*{box-sizing:border-box}

body{
margin:0;
background:var(--bg);
color:var(--ink);
font:14px/1.55 Arial,sans-serif
}

.page{
max-width:1180px;
margin:0 auto;
padding:34px 28px 60px
}

.header{
background:#0b1d29;
color:#fff;
border-radius:16px;
padding:28px 30px;
margin-bottom:18px
}

.brand{
font-size:13px;
letter-spacing:1.6px;
text-transform:uppercase;
color:#66d7c1;
font-weight:700
}

.header h1{
margin:7px 0 4px;
font-size:30px
}

.header p{
margin:0;
color:#b8c6cf
}

.casebar{
margin-top:22px;
display:flex;
gap:20px;
flex-wrap:wrap
}

.casebar span{
color:#dce7ec
}

.grid{
display:grid;
grid-template-columns:repeat(4,1fr);
gap:12px;
margin:18px 0
}

.card{
background:var(--panel);
border:1px solid var(--line);
border-radius:12px;
padding:16px
}

.label{
font-size:10px;
letter-spacing:1.2px;
text-transform:uppercase;
color:var(--muted);
font-weight:700
}

.value{
font-size:22px;
font-weight:800;
margin-top:5px
}

.section{
margin-top:24px
}

.section h2{
font-size:19px;
margin:0 0 10px
}

.sectionIntro{
color:var(--muted);
margin:0 0 12px
}

.summary{
display:grid;
grid-template-columns:2fr 1fr;
gap:12px
}

.notice{
background:#fff8e8;
border:1px solid #f0d59b;
border-radius:10px;
padding:15px
}

.notice strong{
display:block;
margin-bottom:4px
}

.alert{
background:#fff;
border:1px solid var(--line);
border-left:5px solid var(--warn);
border-radius:10px;
padding:13px 15px;
margin:9px 0
}

.alert.critical,
.alert.high{
border-left-color:var(--danger)
}

.alert.medium{
border-left-color:#d08a1d
}

.alertHead{
display:flex;
align-items:center;
gap:8px
}

.badge,
.status{
display:inline-block;
border-radius:999px;
padding:3px 8px;
font-size:10px;
font-weight:800;
letter-spacing:.5px
}

.badge{
background:#f3e8ea;
color:#9d1835
}

.alertNo{
margin-left:auto;
color:#8997a1;
font-size:11px
}

.alert p{
margin:7px 0 0
}

.mono{
font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
word-break:break-all
}

.addr{
font-size:12px;
color:#475866;
margin-top:6px
}

.tableWrap{
overflow:auto;
background:#fff;
border:1px solid var(--line);
border-radius:12px
}

table{
width:100%;
border-collapse:collapse;
min-width:900px
}

th,
td{
padding:9px 10px;
border-bottom:1px solid var(--line);
text-align:left;
font-size:11px
}

th{
background:#eef2f5;
color:#44535e;
font-size:10px;
text-transform:uppercase;
letter-spacing:.7px
}

tr:last-child td{
border-bottom:0
}

.status.low{
background:#e3f6f1;
color:#087563
}

.status.medium{
background:#fff0d5;
color:#8b5300
}

.status.high,
.status.critical{
background:#ffe5eb;
color:#a31939
}

.graph{
background:#06131c;
border-radius:12px;
padding:12px;
overflow:auto
}

.graph svg{
display:block;
min-width:760px;
width:100%;
height:auto
}

.meta{
display:grid;
grid-template-columns:repeat(2,1fr);
gap:10px
}

.empty{
padding:18px;
background:#fff;
border:1px dashed var(--line);
border-radius:10px;
color:var(--muted)
}

footer{
margin-top:30px;
padding-top:15px;
border-top:1px solid var(--line);
font-size:11px;
color:var(--muted)
}

@media(max-width:760px){
.page{
padding:18px 12px
}

.grid{
grid-template-columns:repeat(2,1fr)
}

.summary,
.meta{
grid-template-columns:1fr
}

.header h1{
font-size:24px
}
}

@media print{
body{
background:#fff
}

.page{
max-width:none;
padding:0
}

.header{
break-inside:avoid
}

.graph{
break-inside:avoid
}
}
</style>
</head>

<body>

<main class="page">

<header class="header">

<div class="brand">
ChainSight · Crypto Intelligence & Investigation
</div>

<h1>Investigation Evidence Report</h1>

<p>
Live Ethereum transaction trace and explainable risk assessment.
</p>

<div class="casebar">

<span>
<b>Subject:</b>
<span class="mono">${subject}</span>
</span>

<span>
<b>Generated:</b>
${esc(generated)}
</span>

<span>
<b>Mode:</b>
${esc(state.mode)}
</span>

</div>

</header>

<section class="grid">

<div class="card">
<div class="label">Risk score</div>
<div class="value">${risk}/100</div>
</div>

<div class="card">
<div class="label">Risk level</div>
<div class="value">${esc(riskLevel)}</div>
</div>

<div class="card">
<div class="label">Trace scope</div>
<div class="value">${trace}</div>
</div>

<div class="card">
<div class="label">Value observed</div>
<div class="value">${esc(totalValue)} ETH</div>
</div>

<div class="card">
<div class="label">Transactions</div>
<div class="value">${state.txs.length}</div>
</div>

<div class="card">
<div class="label">Wallets observed</div>
<div class="value">${state.nodes.size}</div>
</div>

<div class="card">
<div class="label">Risk indicators</div>
<div class="value">${state.alerts.length}</div>
</div>

<div class="card">
<div class="label">Data source</div>
<div class="value" style="font-size:16px">
${esc(state.source)}
</div>
</div>

</section>

<section class="section">

<h2>Executive Summary</h2>

<div class="summary">

<div class="card">

<p style="margin:0">

The investigation traced
<b>${state.txs.length}</b>
transaction records across
<b>${state.nodes.size}</b>
observed addresses over
<b>${esc(state.depth)} hop(s)</b>.

The heuristic engine produced a root risk score of
<b>${risk}/100 (${esc(riskLevel)})</b>
and identified
<b>${state.alerts.length}</b>
risk indicators.

</p>

</div>

<div class="notice">

<strong>Interpretation</strong>

Risk indicators are prioritization signals derived from
transaction structure and activity. They are not proof
of criminal conduct.

</div>

</div>

</section>

<section class="section">

<h2>Transaction Spider Map</h2>

<p class="sectionIntro">
Directed graph captured from the current investigation state.
</p>

<div class="graph">
${graph}
</div>

</section>

<section class="section">

<h2>Risk Indicators</h2>

<p class="sectionIntro">
Explainable heuristics generated from the observed transaction set.
</p>

${alerts}

</section>

<section class="section">

<h2>Transaction Evidence</h2>

<p class="sectionIntro">
The first 100 normalized transaction records are included
for evidence review.
</p>

<div class="tableWrap">

<table>

<thead>

<tr>
<th>#</th>
<th>Timestamp</th>
<th>Transaction</th>
<th>From</th>
<th>To</th>
<th>Amount</th>
<th>Risk</th>
</tr>

</thead>

<tbody>
${evidence}
</tbody>

</table>

</div>

</section>

<section class="section">

<h2>Evidence Boundary & Methodology</h2>

<div class="notice">

<strong>Evidence boundary</strong>

On-chain records establish transaction facts.
A transaction hash or wallet address does not inherently
reveal a user's IP address or real-world identity.

Any identity or IP correlation requires separate lawful
and authorized off-chain intelligence.

<br><br>

<strong>Methodology</strong>

Risk scores are generated by ChainSight's explainable
heuristic engine using observed transaction count,
counterparty count, outgoing activity, and rapid
transaction timing.

The score supports analyst prioritization and does not
establish attribution.

</div>

</section>

<section class="section">

<h2>Data Provenance</h2>

<div class="meta">

<div class="card">
<div class="label">Source</div>
<div style="margin-top:6px">
${esc(state.source)}
</div>
</div>

<div class="card">
<div class="label">Generation time</div>
<div class="mono" style="margin-top:6px">
${esc(generated)}
</div>
</div>

<div class="card">
<div class="label">Trace depth</div>
<div style="margin-top:6px">
${esc(state.depth)} hops
</div>
</div>

<div class="card">
<div class="label">Records included</div>
<div style="margin-top:6px">
${state.txs.length} normalized transactions
</div>
</div>

</div>

</section>

<footer>

ChainSight Investigation Report ·
For authorized investigative and academic use.
Data shown reflects the state available when this report
was generated.

</footer>

</main>

</body>
</html>`;

const blob=new Blob([html],{type:'text/html'});
const url=URL.createObjectURL(blob);

const a=document.createElement('a');
a.href=url;
a.download='ChainSight-Investigation-Evidence-Report.html';

document.body.appendChild(a);
a.click();
a.remove();

setTimeout(()=>{
URL.revokeObjectURL(url);
},1000);
}
addDemoButton();
function updateReport8B(){
    if(!state || !state.txs || !state.txs.length) return;

    const report=document.getElementById('reportContent');
    if(!report) return;

    if(document.getElementById('report8b')){
        updateReport8BData();
        return;
    }

    report.insertAdjacentHTML('beforeend',`
        <div id="report8b">

            <h2 style="margin-top:18px">Investigation Metrics</h2>

            <div class="case">
                <div class="card">
                    <div class="label">Transactions observed</div>
                    <div id="reportTxCount" class="value">—</div>
                </div>

                <div class="card">
                    <div class="label">Wallets observed</div>
                    <div id="reportNodeCount" class="value">—</div>
                </div>

                <div class="card">
                    <div class="label">Risk indicators</div>
                    <div id="reportAlertCount" class="value red">—</div>
                </div>

                <div class="card">
                    <div class="label">Value observed</div>
                    <div id="reportValue" class="value">—</div>
                </div>
            </div>

            <h2>Risk Indicators</h2>
            <div id="reportAlerts"></div>

            <h2>Transaction Evidence</h2>
            <div class="tableWrap">
                <table>
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Transaction</th>
                            <th>From</th>
                            <th>To</th>
                            <th>Amount</th>
                            <th>Risk</th>
                        </tr>
                    </thead>
                    <tbody id="reportEvidence"></tbody>
                </table>
            </div>

            <h2>Investigation Provenance</h2>
            <div class="card">
                <div class="label">Source</div>
                <div id="reportSource" style="margin-top:6px">
                    —
                </div>
            </div>

        </div>
    `);

    updateReport8BData();
}


function updateReport8BData(){

    if(!state || !state.txs || !state.txs.length) return;

    const txCount=document.getElementById('reportTxCount');
    const nodeCount=document.getElementById('reportNodeCount');
    const alertCount=document.getElementById('reportAlertCount');
    const value=document.getElementById('reportValue');

    if(txCount) txCount.textContent=state.txs.length;
    if(nodeCount) nodeCount.textContent=state.nodes.size;
    if(alertCount) alertCount.textContent=state.alerts.length;

    if(value){
        value.textContent=
            (state.txs.reduce((s,t)=>s+t.value,0)/1e18)
            .toFixed(2)+' ETH';
    }

    const alerts=document.getElementById('reportAlerts');

    if(alerts){
        alerts.innerHTML=state.alerts.length
        ? state.alerts.map(a=>`
            <div class="alert">
                <b>${esc(a.level)} · ${esc(a.title)}</b>
                <span class="mono">${esc(a.addr)}</span>
                <br>
                ${esc(a.reason)}
            </div>
        `).join('')
        : '<div class="hint">No elevated risk indicators detected.</div>';
    }

    const evidence=document.getElementById('reportEvidence');

    if(evidence){
        evidence.innerHTML=state.txs.slice(0,100).map(t=>{

            const r=scoreNode(t.from,state.txs);
            const level=
                r>=70?'HIGH':
                r>=30?'MEDIUM':
                'LOW';

            return `
                <tr>
                    <td>${esc(t.time||'—')}</td>
                    <td class="mono">${esc(short(t.hash))}</td>
                    <td class="mono">${esc(short(t.from))}</td>
                    <td class="mono">${esc(short(t.to))}</td>
                    <td>${eth(t.value)} ETH</td>
                    <td>
                        <span class="status ${level.toLowerCase()}">
                            ${level}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    const source=document.getElementById('reportSource');

    if(source){
        source.textContent=
            state.source ||
            'Ethereum / Blockscout';
    }
}


setInterval(updateReport8B,1000);
