from __future__ import annotations

import os
import re
from collections import defaultdict
from datetime import datetime
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BLOCKSCOUT = os.getenv("BLOCKSCOUT_URL", "https://eth.blockscout.com/api/v2").rstrip("/")
ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
TX_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")

app = FastAPI(title="ChainSight Intelligence API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS",
        "https://sudharsan-b02.github.io,http://localhost:8000",
    ).split(","),
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


class TraceResponse(BaseModel):
    root: str
    depth: int
    nodes: list[dict[str, Any]]
    transactions: list[dict[str, Any]]
    alerts: list[dict[str, Any]]
    risk: int
    source: str


def normalize_tx(t: dict[str, Any]) -> dict[str, Any]:
    def addr(v: Any) -> str:
        return (v.get("hash", "") if isinstance(v, dict) else (v or "")).lower()

    return {
        "hash": t.get("hash", ""),
        "from": addr(t.get("from")),
        "to": addr(t.get("to")),
        "value": int(t.get("value") or 0),
        "timestamp": t.get("timestamp") or "",
        "block": t.get("block_number") or 0,
    }


async def blockscout(path: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20, headers={"User-Agent": "ChainSight/0.1"}) as client:
        response = await client.get(f"{BLOCKSCOUT}/{path.lstrip('/')}")
    if response.status_code == 404:
        raise HTTPException(404, "Blockchain object not found")
    if response.status_code >= 400:
        raise HTTPException(502, f"Blockchain provider returned HTTP {response.status_code}")
    return response.json()


async def address_transactions(address: str) -> list[dict[str, Any]]:
    data = await blockscout(
        f"addresses/{address}/transactions?filter=validated&page_size=100"
    )
    return [normalize_tx(x) for x in data.get("items", []) if x.get("hash")]


def risk_for(address: str, txs: list[dict[str, Any]]) -> int:
    address = address.lower()
    related = [t for t in txs if t["from"] == address or t["to"] == address]
    outs = [t for t in related if t["from"] == address]
    peers = {
        (t["to"] if t["from"] == address else t["from"])
        for t in related
    } - {""}

    score = 0
    if len(related) >= 5:
        score += 15
    if len(related) >= 10:
        score += 15
    if len(peers) >= 3:
        score += 15
    if len(peers) >= 6:
        score += 15
    if len(outs) >= 4:
        score += 10

    times = []
    for t in related:
        if t.get("timestamp"):
            try:
                times.append(datetime.fromisoformat(
                    t["timestamp"].replace("Z", "+00:00")
                ).timestamp())
            except ValueError:
                pass
    times.sort()
    rapid = sum(1 for a, b in zip(times, times[1:]) if b - a < 120)
    if rapid >= 2:
        score += 15

    return min(score, 100)


def build_graph(txs: list[dict[str, Any]], root: str):
    related = defaultdict(list)
    for tx in txs:
        for addr in (tx["from"], tx["to"]):
            if addr:
                related[addr].append(tx)

    nodes = []
    alerts = []

    for address, items in related.items():
        peers = {
            tx["to"] if tx["from"] == address else tx["from"]
            for tx in items
        } - {""}
        risk = risk_for(address, txs)
        nodes.append({
            "address": address,
            "transactions": len(items),
            "counterparties": len(peers),
            "risk": risk,
        })

        if risk >= 30:
            level = "CRITICAL" if risk >= 70 else "HIGH" if risk >= 50 else "MEDIUM"
            title = (
                "Rapid multi-hop movement"
                if risk >= 70
                else "Counterparty expansion"
                if risk >= 50
                else "Elevated transaction activity"
            )
            alerts.append({
                "level": level,
                "title": title,
                "address": address,
                "reason": f"{len(items)} observed transactions and {len(peers)} counterparties.",
            })

    return nodes, alerts, risk_for(root, txs)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "chainsight-api"}


@app.get("/api/v1/transaction/{tx_hash}")
async def transaction(tx_hash: str):
    if not TX_RE.match(tx_hash):
        raise HTTPException(400, "Invalid Ethereum transaction hash")
    return normalize_tx(await blockscout(f"transactions/{tx_hash}"))


@app.get("/api/v1/trace/{address}", response_model=TraceResponse)
async def trace(address: str, depth: int = Query(1, ge=1, le=3)):
    if not ADDRESS_RE.match(address):
        raise HTTPException(400, "Invalid Ethereum wallet address")

    root = address.lower()
    all_txs = {}
    frontier = [root]
    seen = {root}

    for _ in range(depth):
        next_frontier = set()

        for addr in frontier:
            for tx in await address_transactions(addr):
                all_txs[tx["hash"]] = tx

                for peer in (tx["from"], tx["to"]):
                    if (
                        peer
                        and peer != root
                        and peer not in seen
                        and len(seen) < 30
                    ):
                        seen.add(peer)
                        next_frontier.add(peer)

        frontier = list(next_frontier)[:8]
        if not frontier:
            break

    transactions = list(all_txs.values())
    nodes, alerts, risk = build_graph(transactions, root)

    return TraceResponse(
        root=root,
        depth=depth,
        nodes=nodes,
        transactions=transactions[:300],
        alerts=alerts,
        risk=risk,
        source="Ethereum / Blockscout API",
    )
