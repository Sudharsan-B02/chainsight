# ChainSight — Crypto Intelligence & Investigation Platform

Live-upgrade package for the ChainSight hackathon prototype.

## What changed

- Live Ethereum wallet transaction retrieval via Blockscout API
- 1–3 hop wallet tracing
- Directed transaction spider map
- Explainable risk heuristics
- Live transaction evidence table
- Risk alerts
- Investigation report export

## Deployment

Upload `index.html`, `app.js`, and `README.md` to the root of the
`Sudharsan-B02/chainsight` repository and commit to `main`.

GitHub Pages can continue using `main` + `/ (root)`.

## Important limitations

The browser implementation retrieves public Ethereum on-chain data. The
risk score is an investigative prioritization signal, not proof of criminal
conduct.

A blockchain transaction does not inherently reveal a user's IP address.
Any IP/identity correlation requires separate lawful, authorized off-chain
intelligence.

The next production stage should add a FastAPI backend, persistent database,
authentication/rate limiting, provenance logging, and the GCN/GAT research
pipeline.
