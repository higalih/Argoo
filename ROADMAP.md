# Argoo Roadmap — DRAFT for Greg's review

> DRAFT prepared by Harbor, Fri 2026-10-30, while Greg is at the factory.
> Tonight: review, copy to the project root as `ROADMAP.md`, commit (private repo, never `.env`).
> Source of truth for the build. One file, no duplicates.

## Starting XI — LOCKED 29 Oct 2026

- **GK:** market_pulse — live, gated, devnet
- **Defence (4):** token_safety (build first — privileged) | x402 gate + server reliability | landing + waitlist + analytics + public metrics endpoint | MCP wrapper + docs + SDK/discovery
- **Midfield (4):** whale_pulse | cache + speed + CoinGecko reliability | distribution (X, Telegram, FB, reply-first) | Bahasa / human-readable verdicts
- **Strikers (2):** alpha_bundle (BUY/WAIT/AVOID + score + reasons) | portfolio case study + public track record — the Mansour striker, the vessel
- **Bench:** free-consult model, public paid-call feed (fuller version, later), mainnet, Telegram bot, Discord, other pillars

## Locked decisions

- **Complete squad first.** This XI is the first starting XI.
- **token_safety privileged over alpha_bundle.** Safety is built first; the bundle earns more later, once a public verdict track record exists.
- **Mainnet waits.** Mainnet sits behind its own separate decision while the squad completes on devnet. No real money without that decision.
- **Pre-season, then a new clock.** 26 Oct – 23 Nov 2026 is a pre-season test. The new season clock starts when the squad is complete: "When squad complete. Ready to play and compete."
- **No job verification now.** Build the vessel first, so recruiters, Sheikh Mansour, or backers landing on Argoo find something to believe in.
- **Quality bar.** Two features with no broken logic beat four features with slop.
- **Stack.** TypeScript/Node + vanilla frontend, served by the backend. No Next.js, no Go. Devnet by design until the mainnet decision.

## Phases (Greg's Kanban plan, tweaked per locked decisions)

### Phase 0 — Defence first (now)
- [ ] Build **token_safety** (privileged, first new tool) — see the token_safety spec draft
- [ ] Harden x402: rate limits + error-message polish (replay protection and signature checks are ALREADY built, Oct 19)
- [ ] Public metrics endpoint (`/api/stats` or `/metrics`: calls, unique payers, volume) — sits with the analytics position
- [ ] Landing updates (devnet status, curl examples)

Mainnet is NOT in Phase 0. It stays benched behind its own decision.

### Phase 1 — Agent native
- [ ] Publish MCP server (`@argoo/mcp-server` or similar) — PACKAGING of the existing argo-mcp (Inspector-passed Oct 20), not a rebuild
- [ ] Minimal SDK (thin wrapper: 402 → pay → retry)
- [ ] Discovery: OpenAPI + `.well-known/x402`
- [ ] Integrate section on the site (MCP install one-liner + SDK example)
- [ ] Agent test suite (Cursor / Claude Desktop can call it)

### Phase 2 — Product depth
- [ ] whale_pulse / smart-money tool
- [ ] alpha_bundle (verdict card: safety + whale + momentum + reasons — NOT just a safety verdict)
- [ ] Caching + multi-token support
- [ ] Marketplace / tool catalog page — BENCHED until a signal calls for it
- [ ] Agent chat surface — BENCHED until a signal calls for it

### Phase 3 — Flywheel (only after real volume)
- [ ] Usage-based rewards or simple points
- [ ] Optional $ARGOO token + fee discount / buyback (only if it makes sense)
- [ ] Public dashboard of live calls & revenue

### Nice-to-have / later
- Telegram bot mirror, more data sources, partner tools

## Kanban (Backlog / Doing / Done)

- **Doing:** token_safety spec → build
- **Backlog (in order):** x402 hardening → public metrics endpoint → MCP publish → SDK → discovery → Integrate section → agent test suite → whale_pulse → alpha_bundle → portfolio case study (draft starts with the live system; track-record section fills when alpha_bundle ships)
- **Done:** market_pulse (HTTP + MCP), x402 gate, landing + waitlist, argoo.xyz live, announcement Oct 26

## Cadence (solo, ~1.5h evenings)

1. One high-leverage item per session. No two fronts at once.
2. Every item ships with acceptance criteria + a test (402 → pay → 200 for gated tools).
3. Weekly review: "Did any agent actually pay this week?"
4. Distribution (midfield) and the Bahasa layer are habits tracked weekly, not phases.
5. Stop at 21:00 (max 21:30). The roadmap waits; sleep doesn't.
