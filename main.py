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


# ============================================================
# CONFIGURATION
# ============================================================

BLOCKSCOUT = os.getenv(
    "BLOCKSCOUT_URL",
    "https://eth.blockscout.com/api/v2",
).rstrip("/")

ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
TX_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="ChainSight Intelligence API",
    version="0.2.0",
)

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


# ============================================================
# RESPONSE MODEL
# ============================================================

class TraceResponse(BaseModel):
    root: str
    depth: int
    nodes: list[dict[str, Any]]
    transactions: list[dict[str, Any]]
    alerts: list[dict[str, Any]]
    risk: int
    risk_factors: list[dict[str, Any]]
    source: str


# ============================================================
# TRANSACTION NORMALIZATION
# ============================================================

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


# ============================================================
# BLOCKSCOUT API
# ============================================================

async def blockscout(path: str) -> dict[str, Any]:

    url = f"{BLOCKSCOUT}/{path.lstrip('/')}"

    async with httpx.AsyncClient(
        timeout=20,
        headers={
            "User-Agent": "ChainSight/0.2"
        },
    ) as client:

        response = await client.get(url)

    if response.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail="Blockchain object not found",
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Blockchain provider returned "
                f"HTTP {response.status_code}"
            ),
        )

    return response.json()


# ============================================================
# ADDRESS TRANSACTIONS
# ============================================================

async def address_transactions(
    address: str,
) -> list[dict[str, Any]]:

    data = await blockscout(
        f"addresses/{address}/transactions"
    )

    return [
        normalize_tx(x)
        for x in data.get("items", [])
        if x.get("hash")
    ]


# ============================================================
# TIME ANALYSIS
# ============================================================

def _times(
    txs: list[dict[str, Any]],
) -> list[float]:

    values: list[float] = []

    for tx in txs:

        timestamp = tx.get("timestamp")

        if not timestamp:
            continue

        try:
            values.append(
                datetime.fromisoformat(
                    timestamp.replace("Z", "+00:00")
                ).timestamp()
            )

        except (TypeError, ValueError):
            continue

    return sorted(values)


# ============================================================
# EXPLAINABLE RISK ENGINE
# ============================================================

def risk_profile(
    address: str,
    txs: list[dict[str, Any]],
) -> tuple[int, list[dict[str, Any]]]:

    address = address.lower()

    related = [
        tx
        for tx in txs
        if tx["from"] == address
        or tx["to"] == address
    ]

    outgoing = [
        tx
        for tx in related
        if tx["from"] == address
    ]

    incoming = [
        tx
        for tx in related
        if tx["to"] == address
    ]

    counterparties = {
        (
            tx["to"]
            if tx["from"] == address
            else tx["from"]
        )
        for tx in related
    } - {""}

    factors: list[dict[str, Any]] = []

    def add_factor(
        code: str,
        title: str,
        points: int,
        detail: str,
    ):

        factors.append(
            {
                "code": code,
                "title": title,
                "points": points,
                "detail": detail,
            }
        )

    # --------------------------------------------------------
    # 1. Transaction activity
    # --------------------------------------------------------

    if len(related) >= 10:

        add_factor(
            "activity",
            "High transaction activity",
            30,
            f"{len(related)} related transactions observed.",
        )

    elif len(related) >= 5:

        add_factor(
            "activity",
            "Elevated transaction activity",
            15,
            f"{len(related)} related transactions observed.",
        )

    # --------------------------------------------------------
    # 2. Counterparty expansion
    # --------------------------------------------------------

    if len(counterparties) >= 6:

        add_factor(
            "counterparties",
            "Broad counterparty expansion",
            30,
            f"{len(counterparties)} unique counterparties observed.",
        )

    elif len(counterparties) >= 3:

        add_factor(
            "counterparties",
            "Counterparty expansion",
            15,
            f"{len(counterparties)} unique counterparties observed.",
        )

    # --------------------------------------------------------
    # 3. Outgoing activity
    # --------------------------------------------------------

    if len(outgoing) >= 4:

        add_factor(
            "outflow",
            "High outgoing activity",
            10,
            f"{len(outgoing)} outgoing transfers observed.",
        )

    # --------------------------------------------------------
    # 4. Transaction velocity
    # --------------------------------------------------------

    times = _times(related)

    rapid = sum(
        1
        for first, second in zip(
            times,
            times[1:],
        )
        if second - first < 120
    )

    if rapid >= 2:

        add_factor(
            "velocity",
            "Rapid transaction velocity",
            15,
            (
                f"{rapid} adjacent transaction "
                "intervals were under two minutes."
            ),
        )

    # --------------------------------------------------------
    # 5. Fan-out behaviour
    # --------------------------------------------------------

    if len(outgoing) >= 3 and len(counterparties) >= 3:

        add_factor(
            "fanout",
            "Fan-out behaviour",
            10,
            (
                f"Funds were sent across "
                f"{len(counterparties)} counterparties "
                f"with {len(outgoing)} outgoing transfers."
            ),
        )

    # --------------------------------------------------------
    # 6. Observed value
    # --------------------------------------------------------

    total_wei = sum(
        tx["value"]
        for tx in related
    )

    total_eth = total_wei / 1e18

    if total_eth >= 100:

        add_factor(
            "value",
            "High observed value",
            15,
            (
                f"Approximately {total_eth:.2f} ETH "
                "was observed across related records."
            ),
        )

    elif total_eth >= 10:

        add_factor(
            "value",
            "Material observed value",
            8,
            (
                f"Approximately {total_eth:.2f} ETH "
                "was observed across related records."
            ),
        )

    # --------------------------------------------------------
    # 7. Bidirectional flow
    # --------------------------------------------------------

    if (
        incoming
        and outgoing
        and len(incoming) >= 2
        and len(outgoing) >= 2
    ):

        add_factor(
            "flow",
            "Bidirectional flow",
            5,
            (
                f"Both inbound ({len(incoming)}) "
                f"and outbound ({len(outgoing)}) "
                "transfers were observed."
            ),
        )

    # --------------------------------------------------------
    # Final score
    # --------------------------------------------------------

    score = min(
        sum(
            factor["points"]
            for factor in factors
        ),
        100,
    )

    return score, factors


def risk_for(
    address: str,
    txs: list[dict[str, Any]],
) -> int:

    score, _ = risk_profile(
        address,
        txs,
    )

    return score


# ============================================================
# GRAPH CONSTRUCTION
# ============================================================

def build_graph(
    txs: list[dict[str, Any]],
    root: str,
):

    related = defaultdict(list)

    for tx in txs:

        for address in (
            tx["from"],
            tx["to"],
        ):

            if address:
                related[address].append(tx)

    nodes = []
    alerts = []

    for address, items in related.items():

        counterparties = {
            (
                tx["to"]
                if tx["from"] == address
                else tx["from"]
            )
            for tx in items
        } - {""}

        risk, factors = risk_profile(
            address,
            txs,
        )

        nodes.append(
            {
                "address": address,
                "transactions": len(items),
                "counterparties": len(counterparties),
                "risk": risk,
                "risk_factors": factors,
            }
        )

        # ----------------------------------------------------
        # Generate explainable alerts
        # ----------------------------------------------------

        if risk >= 30:

            if risk >= 70:
                level = "CRITICAL"

            elif risk >= 50:
                level = "HIGH"

            else:
                level = "MEDIUM"

            lead_title = (
                factors[0]["title"]
                if factors
                else "Elevated activity"
            )

            reason = " ".join(
                factor["detail"]
                for factor in factors[:3]
            )

            alerts.append(
                {
                    "level": level,
                    "title": lead_title,
                    "address": address,
                    "reason": reason,
                    "score": risk,
                    "factors": factors,
                }
            )

    # Highest-risk alerts first

    alerts.sort(
        key=lambda x: x["score"],
        reverse=True,
    )

    return (
        nodes,
        alerts,
        risk_for(root, txs),
    )


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
async def health():

    return {
        "status": "ok",
        "service": "chainsight-api",
        "version": "0.2.0",
    }


# ============================================================
# TRANSACTION ENDPOINT
# ============================================================

@app.get(
    "/api/v1/transaction/{tx_hash}"
)
async def transaction(
    tx_hash: str,
):

    if not TX_RE.match(tx_hash):

        raise HTTPException(
            status_code=400,
            detail="Invalid Ethereum transaction hash",
        )

    data = await blockscout(
        f"transactions/{tx_hash}"
    )

    return normalize_tx(data)


# ============================================================
# WALLET TRACE ENDPOINT
# ============================================================

@app.get(
    "/api/v1/trace/{address}",
    response_model=TraceResponse,
)
async def trace(
    address: str,
    depth: int = Query(
        1,
        ge=1,
        le=3,
    ),
):

    if not ADDRESS_RE.match(address):

        raise HTTPException(
            status_code=400,
            detail="Invalid Ethereum wallet address",
        )

    root = address.lower()

    all_transactions: dict[
        str,
        dict[str, Any],
    ] = {}

    frontier = [root]

    seen = {root}

    # --------------------------------------------------------
    # Multi-hop tracing
    # --------------------------------------------------------

    for _ in range(depth):

        next_frontier = set()

        for addr in frontier:

            transactions = await address_transactions(
                addr
            )

            for tx in transactions:

                all_transactions[
                    tx["hash"]
                ] = tx

                for peer in (
                    tx["from"],
                    tx["to"],
                ):

                    if (
                        peer
                        and peer != root
                        and peer not in seen
                        and len(seen) < 150
                    ):

                        seen.add(peer)
                        next_frontier.add(peer)

        # Prevent excessive API expansion

        frontier = list(
            next_frontier
        )[:12]

        if not frontier:
            break

    transactions = list(
        all_transactions.values()
    )

    nodes, alerts, risk = build_graph(
        transactions,
        root,
    )

    _, root_factors = risk_profile(
        root,
        transactions,
    )

    return TraceResponse(
        root=root,
        depth=depth,
        nodes=nodes,
        transactions=transactions[:300],
        alerts=alerts,
        risk=risk,
        risk_factors=root_factors,
        source="Ethereum / Blockscout API",
    )
