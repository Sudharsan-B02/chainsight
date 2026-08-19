from __future__ import annotations

import json
import os
import re
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BLOCKSCOUT = os.getenv("BLOCKSCOUT_URL", "https://eth.blockscout.com/api/v2").rstrip("/")
DB_PATH = os.getenv("CHAINSIGHT_DB", str(Path(__file__).with_name("chainsight.db")))
ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
TX_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")

app = FastAPI(title="ChainSight Intelligence API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "https://sudharsan-b02.github.io,http://localhost:8000,http://localhost:5500").split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id TEXT UNIQUE NOT NULL,
                subject TEXT NOT NULL,
                depth INTEGER NOT NULL,
                risk_score INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'active',
                source TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
                tx_hash TEXT NOT NULL,
                from_address TEXT NOT NULL,
                to_address TEXT NOT NULL,
                value_wei TEXT NOT NULL,
                block_number INTEGER NOT NULL DEFAULT 0,
                timestamp TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT '',
                UNIQUE(case_id, tx_hash)
            );
            CREATE TABLE IF NOT EXISTS risk_indicators (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
                address TEXT NOT NULL,
                level TEXT NOT NULL,
                title TEXT NOT NULL,
                reason TEXT NOT NULL,
                score INTEGER NOT NULL DEFAULT 0,
                factors_json TEXT NOT NULL DEFAULT '[]'
            );
            CREATE TABLE IF NOT EXISTS evidence (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
                evidence_id TEXT NOT NULL,
                evidence_type TEXT NOT NULL,
                reference TEXT NOT NULL,
                source TEXT NOT NULL,
                retrieved_at TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                UNIQUE(case_id, evidence_id)
            );
            CREATE INDEX IF NOT EXISTS idx_cases_updated ON cases(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_tx_case ON transactions(case_id);
            CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence(case_id);
            """
        )


init_db()


class TraceResponse(BaseModel):
    root: str
    depth: int
    nodes: list[dict[str, Any]]
    transactions: list[dict[str, Any]]
    alerts: list[dict[str, Any]]
    risk: int
    risk_factors: list[dict[str, Any]]
    source: str


class CaseCreate(BaseModel):
    subject: str
    depth: int = Field(default=1, ge=1, le=3)
    risk: int = Field(default=0, ge=0, le=100)
    status: str = "active"
    source: str = "Ethereum / Blockscout"
    transactions: list[dict[str, Any]] = Field(default_factory=list)
    alerts: list[dict[str, Any]] = Field(default_factory=list)


class CaseStatusUpdate(BaseModel):
    status: str = Field(pattern="^(active|closed|archived)$")


def normalize_tx(t: dict[str, Any]) -> dict[str, Any]:
    def addr(v: Any) -> str:
        if isinstance(v, dict):
            return str(v.get("hash", "")).lower()
        return str(v or "").lower()

    return {
        "hash": t.get("hash", ""),
        "from": addr(t.get("from")),
        "to": addr(t.get("to")),
        "value": int(t.get("value") or 0),
        "timestamp": t.get("timestamp") or "",
        "block": t.get("block_number") or 0,
    }


async def blockscout(path: str) -> dict[str, Any]:
    url = f"{BLOCKSCOUT}/{path.lstrip('/')}"
    async with httpx.AsyncClient(timeout=20, headers={"User-Agent": "ChainSight/0.3"}) as client:
        response = await client.get(url)
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Blockchain object not found")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Blockchain provider returned HTTP {response.status_code}")
    return response.json()


async def address_transactions(address: str) -> list[dict[str, Any]]:
    data = await blockscout(f"addresses/{address}/transactions")
    return [normalize_tx(x) for x in data.get("items", []) if x.get("hash")]


def _times(txs: list[dict[str, Any]]) -> list[float]:
    values = []
    for tx in txs:
        timestamp = tx.get("timestamp")
        if not timestamp:
            continue
        try:
            values.append(datetime.fromisoformat(timestamp.replace("Z", "+00:00")).timestamp())
        except (TypeError, ValueError):
            pass
    return sorted(values)


def risk_profile(address: str, txs: list[dict[str, Any]]) -> tuple[int, list[dict[str, Any]]]:
    address = address.lower()
    related = [tx for tx in txs if tx["from"] == address or tx["to"] == address]
    outgoing = [tx for tx in related if tx["from"] == address]
    incoming = [tx for tx in related if tx["to"] == address]
    counterparties = {tx["to"] if tx["from"] == address else tx["from"] for tx in related} - {""}
    factors: list[dict[str, Any]] = []

    def add(code: str, title: str, points: int, detail: str) -> None:
        factors.append({"code": code, "title": title, "points": points, "detail": detail})

    if len(related) >= 10:
        add("activity", "High transaction activity", 30, f"{len(related)} related transactions observed.")
    elif len(related) >= 5:
        add("activity", "Elevated transaction activity", 15, f"{len(related)} related transactions observed.")
    if len(counterparties) >= 6:
        add("counterparties", "Broad counterparty expansion", 30, f"{len(counterparties)} unique counterparties observed.")
    elif len(counterparties) >= 3:
        add("counterparties", "Counterparty expansion", 15, f"{len(counterparties)} unique counterparties observed.")
    if len(outgoing) >= 4:
        add("outflow", "High outgoing activity", 10, f"{len(outgoing)} outgoing transfers observed.")
    times = _times(related)
    rapid = sum(1 for first, second in zip(times, times[1:]) if second - first < 120)
    if rapid >= 2:
        add("velocity", "Rapid transaction velocity", 15, f"{rapid} adjacent transaction intervals were under two minutes.")
    if len(outgoing) >= 3 and len(counterparties) >= 3:
        add("fanout", "Fan-out behaviour", 10, f"Funds were sent across {len(counterparties)} counterparties with {len(outgoing)} outgoing transfers.")
    total_eth = sum(tx["value"] for tx in related) / 1e18
    if total_eth >= 100:
        add("value", "High observed value", 15, f"Approximately {total_eth:.2f} ETH was observed across related records.")
    elif total_eth >= 10:
        add("value", "Material observed value", 8, f"Approximately {total_eth:.2f} ETH was observed across related records.")
    if incoming and outgoing and len(incoming) >= 2 and len(outgoing) >= 2:
        add("flow", "Bidirectional flow", 5, f"Both inbound ({len(incoming)}) and outbound ({len(outgoing)}) transfers were observed.")
    return min(sum(f["points"] for f in factors), 100), factors


def build_graph(txs: list[dict[str, Any]], root: str):
    related = defaultdict(list)
    for tx in txs:
        for address in (tx["from"], tx["to"]):
            if address:
                related[address].append(tx)
    nodes = []
    alerts = []
    for address, items in related.items():
        counterparties = {tx["to"] if tx["from"] == address else tx["from"] for tx in items} - {""}
        risk, factors = risk_profile(address, txs)
        nodes.append({"address": address, "transactions": len(items), "counterparties": len(counterparties), "risk": risk, "risk_factors": factors})
        if risk >= 30:
            level = "CRITICAL" if risk >= 70 else "HIGH" if risk >= 50 else "MEDIUM"
            alerts.append({"level": level, "title": factors[0]["title"] if factors else "Elevated activity", "address": address, "reason": " ".join(f["detail"] for f in factors[:3]), "score": risk, "factors": factors})
    alerts.sort(key=lambda x: x["score"], reverse=True)
    root_risk, root_factors = risk_profile(root, txs)
    return nodes, alerts, root_risk, root_factors


@app.get("/health")
async def health():
    return {"status": "ok", "service": "chainsight-api", "version": "0.3.0", "database": "sqlite"}


@app.get("/api/v1/transaction/{tx_hash}")
async def transaction(tx_hash: str):
    if not TX_RE.match(tx_hash):
        raise HTTPException(status_code=400, detail="Invalid Ethereum transaction hash")
    return normalize_tx(await blockscout(f"transactions/{tx_hash}"))


@app.get("/api/v1/trace/{address}", response_model=TraceResponse)
async def trace(address: str, depth: int = Query(1, ge=1, le=3)):
    if not ADDRESS_RE.match(address):
        raise HTTPException(status_code=400, detail="Invalid Ethereum wallet address")
    root = address.lower()
    all_transactions: dict[str, dict[str, Any]] = {}
    frontier = [root]
    seen = {root}
    for _ in range(depth):
        next_frontier = set()
        for addr in frontier:
            for tx in await address_transactions(addr):
                all_transactions[tx["hash"]] = tx
                for peer in (tx["from"], tx["to"]):
                    if peer and peer != root and peer not in seen and len(seen) < 150:
                        seen.add(peer)
                        next_frontier.add(peer)
        frontier = list(next_frontier)[:12]
        if not frontier:
            break
    transactions = list(all_transactions.values())
    nodes, alerts, risk, root_factors = build_graph(transactions, root)
    return TraceResponse(root=root, depth=depth, nodes=nodes, transactions=transactions[:300], alerts=alerts, risk=risk, risk_factors=root_factors, source="Ethereum / Blockscout API")


# --------------------------- Stage 8D: Cases ---------------------------

def case_summary(row: sqlite3.Row) -> dict[str, Any]:
    with db() as conn:
        tx_count = conn.execute("SELECT COUNT(*) FROM transactions WHERE case_id=?", (row["id"],)).fetchone()[0]
        evidence_count = conn.execute("SELECT COUNT(*) FROM evidence WHERE case_id=?", (row["id"],)).fetchone()[0]
        alert_count = conn.execute("SELECT COUNT(*) FROM risk_indicators WHERE case_id=?", (row["id"],)).fetchone()[0]
    return {
        "case_id": row["case_id"], "subject": row["subject"], "depth": row["depth"],
        "risk": row["risk_score"], "status": row["status"], "source": row["source"],
        "created_at": row["created_at"], "updated_at": row["updated_at"],
        "transaction_count": tx_count, "evidence_count": evidence_count, "alert_count": alert_count,
    }


def get_case_row(case_id: str) -> sqlite3.Row:
    with db() as conn:
        row = conn.execute("SELECT * FROM cases WHERE case_id=?", (case_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Case not found")
    return row


@app.post("/api/v1/cases")
async def create_case(payload: CaseCreate):
    subject = payload.subject.lower().strip()
    if not ADDRESS_RE.match(subject) and not TX_RE.match(subject):
        raise HTTPException(status_code=400, detail="Subject must be an Ethereum wallet address or transaction hash")
    created = now_iso()
    with db() as conn:
        next_num = conn.execute("SELECT COALESCE(MAX(id),0)+1 FROM cases").fetchone()[0]
        case_id = f"CS-{datetime.now(timezone.utc).year}-{next_num:04d}"
        cur = conn.execute("INSERT INTO cases(case_id,subject,depth,risk_score,status,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", (case_id, subject, payload.depth, payload.risk, payload.status, payload.source, created, created))
        db_id = cur.lastrowid
        for tx in payload.transactions[:300]:
            tx_hash = str(tx.get("hash", ""))
            if not tx_hash:
                continue
            conn.execute("INSERT OR IGNORE INTO transactions(case_id,tx_hash,from_address,to_address,value_wei,block_number,timestamp,source) VALUES(?,?,?,?,?,?,?,?)", (db_id, tx_hash, str(tx.get("from", "")).lower(), str(tx.get("to", "")).lower(), str(int(tx.get("value") or 0)), int(tx.get("block") or tx.get("block_number") or 0), str(tx.get("timestamp") or tx.get("time") or ""), payload.source))
        for alert in payload.alerts[:200]:
            conn.execute("INSERT INTO risk_indicators(case_id,address,level,title,reason,score,factors_json) VALUES(?,?,?,?,?,?,?)", (db_id, str(alert.get("address") or alert.get("addr") or "").lower(), str(alert.get("level", "MEDIUM")), str(alert.get("title", "Risk indicator")), str(alert.get("reason", "")), int(alert.get("score") or 0), json.dumps(alert.get("factors", []))))
        tx_rows = conn.execute("SELECT id,tx_hash FROM transactions WHERE case_id=? ORDER BY id", (db_id,)).fetchall()
        for idx, tx in enumerate(tx_rows, 1):
            evidence_id = f"EV-{idx:04d}"
            conn.execute("INSERT OR IGNORE INTO evidence(case_id,evidence_id,evidence_type,reference,source,retrieved_at,metadata_json) VALUES(?,?,?,?,?,?,?)", (db_id, evidence_id, "transaction", tx["tx_hash"], payload.source, created, json.dumps({"case_id": case_id})))
        row = conn.execute("SELECT * FROM cases WHERE id=?", (db_id,)).fetchone()
    return case_summary(row)


@app.get("/api/v1/cases")
async def list_cases(limit: int = Query(50, ge=1, le=100)):
    with db() as conn:
        rows = conn.execute("SELECT * FROM cases ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
    return {"items": [case_summary(row) for row in rows]}


@app.get("/api/v1/cases/{case_id}")
async def get_case(case_id: str):
    row = get_case_row(case_id)
    with db() as conn:
        txs = conn.execute("SELECT tx_hash AS hash,from_address AS 'from',to_address AS 'to',value_wei AS value,block_number AS block,timestamp,source FROM transactions WHERE case_id=? ORDER BY id", (row["id"],)).fetchall()
        alerts = conn.execute("SELECT address,level,title,reason,score,factors_json FROM risk_indicators WHERE case_id=? ORDER BY score DESC,id", (row["id"],)).fetchall()
        evidence = conn.execute("SELECT evidence_id,evidence_type,reference,source,retrieved_at,metadata_json FROM evidence WHERE case_id=? ORDER BY id", (row["id"],)).fetchall()
    return {
        **case_summary(row),
        "transactions": [{**dict(t), "value": int(t["value"]), "metadata": None} for t in txs],
        "alerts": [{**dict(a), "factors": json.loads(a["factors_json"] or "[]")} for a in alerts],
        "evidence": [{**dict(e), "metadata": json.loads(e["metadata_json"] or "{}"), "metadata_json": None} for e in evidence],
    }


@app.post("/api/v1/cases/{case_id}/status")
async def update_case_status(case_id: str, payload: CaseStatusUpdate):
    get_case_row(case_id)
    updated = now_iso()
    with db() as conn:
        conn.execute("UPDATE cases SET status=?,updated_at=? WHERE case_id=?", (payload.status, updated, case_id))
        row = conn.execute("SELECT * FROM cases WHERE case_id=?", (case_id,)).fetchone()
    return case_summary(row)


@app.delete("/api/v1/cases/{case_id}")
async def delete_case(case_id: str):
    get_case_row(case_id)
    with db() as conn:
        conn.execute("DELETE FROM cases WHERE case_id=?", (case_id,))
    return {"deleted": True, "case_id": case_id}
