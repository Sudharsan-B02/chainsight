# ChainSight — Crypto Intelligence & Investigation Platform

ChainSight is a research/hackathon prototype for cryptocurrency transaction analysis and investigation.

## GitHub Pages

The repository is configured for GitHub Pages. Push to `main` and `.github/workflows/deploy.yml` deploys the site.

Expected URL: `https://sudharsan-b02.github.io/chainsight/`

## Features
- Investigation dashboard
- Interactive wallet spider map
- Wallet risk profiles
- Explainable suspicious-pattern alerts
- Investigation workflow
- Report export
- Methodology and evidence-boundary documentation

## Research basis
The prototype follows the graph/ML forensic direction of Pocher et al. (2023), "Detecting Anomalous Cryptocurrency Transactions: an AML/CFT Application of Machine Learning-based Forensics."

## Current limitation
The included blockchain records are synthetic demonstration data. The interface is designed for replacement with real blockchain API/RPC data.

A blockchain transaction does not inherently contain a user's IP address. Any IP/identity correlation must come from lawful, authorized off-chain intelligence and must retain provenance and confidence metadata.

## Production architecture
Blockchain API/RPC → FastAPI → PostgreSQL → graph/feature pipeline → risk engine/ML → ChainSight dashboard.
