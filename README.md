# Taskmaster — label data, get judged by AI, get paid in SOL per label

HackTX 26 project. A first-pass model (**Gemini**, with structured JSON output) labels everything
it is confident about; only the hard items are served to humans,
who connect a Solana wallet and label them (text sentiment, pairwise LLM-response ratings, image
subjects). An agent monitors the work rather than grading it: behavioral fraud signals, hidden gold
items, peer consensus, a coherence check that only flags absurd answers, and a periodic bigger-model
audit. Approved labels pay **Solana testnet** SOL immediately, 70% to the wallet and 30% into a
per-worker on-chain escrow that vests or gets slashed. Every label, verdict, and payout is a row in
**Tiger Data** hypertables with continuous aggregates powering the live dashboard. Deployed with
Docker + Caddy on a **Vultr** VM.

## Stack

| Layer | Tech |
|---|---|
| App | Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui |
| Agent | Gemini API `generateContent`, server-side API key, structured JSON; `gemini-3.5-flash-lite` for routing + monitoring, `gemini-3.8-flash` for audits |
| Database | Tiger Cloud (TimescaleDB): `label_events` + `payouts` hypertables, `labels_1m` + `worker_1m` continuous aggregates |
| Chain | `@solana/kit` + `@solana-program/system` (server transfers), `@solana/kit-plugin-wallet` + `@solana/react` (wallet connect, Sign-In-With-Solana) |
| Realtime | Server-Sent Events (`/api/stream`) |
| Hosting | Docker (Next standalone) + Caddy auto-TLS on Vultr, `.tech` domain |

## Local development

```bash
pnpm install
cp .env.example .env.local        # fill in values (see below)
pnpm images                       # download CC photos for the image task set (one time)
pnpm db:migrate                   # creates tables, hypertables, continuous aggregates
pnpm db:seed                      # 50 text, 20 pairwise, 30 image tasks with gold labels
pnpm route                        # first-pass model labels everything; only low-confidence items go to humans
pnpm dev
```

Without a `DATABASE_URL` that has TimescaleDB, the migration falls back to plain tables and views so
local Postgres works. Without `GEMINI_API_KEY` routing, the monitor and audits run in mock mode (deterministic pseudo-confidence, always "ok").
Without `TREASURY_SECRET_KEY` payouts are recorded as `mock` transactions. The whole flow still runs.

### Environment

| Var | Where to get it |
|---|---|
| `DATABASE_URL` | Tiger Cloud console → service → connection string ($1,000 MLH credits via mlh.link/tigerdata-quickstart) |
| `GEMINI_API_KEY` | Create an API key in [Google AI Studio](https://aistudio.google.com/app/apikey). Keep it on the server; never put it in client code or git. |
| `TREASURY_SECRET_KEY` | `pnpm keygen` prints an address + base58 secret. Fund it: `solana airdrop 1 <address> --url testnet` |
| `SESSION_SECRET` | any 32+ random characters |
| `ALLOW_INSECURE_LOGIN` | `1` only for local curl testing (skips wallet signature check). Keep `0` in production |

Smoke-test the judge once credentials are in: `pnpm gemini:smoke` (runs a text verdict and an image
verdict). If an image cannot be loaded or Gemini is unavailable, it stays with humans; hidden
reference checks still apply.

For a local encrypted key in `secrets/gemini.env`, run
`with-secrets secrets/gemini.env -- env JUDGE_MOCK=0 pnpm gemini:smoke` or replace the final command
with `pnpm dev`. The `secrets/` directory is ignored by git.

### Demo script

1. Open `/`, connect Phantom (set to Testnet), approve the sign-in signature.
2. `/label`: note the "Why you" line on each card (model confidence + rationale). Label 5–6 text
   items carefully. Watch the right panel: monitor note in ~300–900 ms, 70% paid with an Explorer
   link, 30% locked in your escrow account, then released after the hold.
3. Hammer the same button 5 times in under a second: `too_fast` + `straight_lining` flags, pay 0,
   trust dropping. Miss a hidden gold item: the vesting escrow is slashed back to the treasury
   on-chain. After 10 labels an audit row appears on the dashboard.
4. `/dashboard`: labels/min by type, SOL/min, approval rate, trust curves, fraud signal counts,
   leaderboard, live stream for all workers. All series come from Tiger Data continuous aggregates.
5. Reset between demos: `pnpm db:reset`.

## How verification works (humans are the source of truth)

The agent does not grade humans. It routes, monitors, and audits.

1. **Route, don't grade** (`pnpm route`, `scripts/route.ts`). The first-pass Gemini model
   labels every task with a calibrated confidence. Items at or above `ROUTE_CONFIDENCE_THRESHOLD`
   (0.85) are marked `auto` and never served. Everything else is marked `human`. Workers are paid
   for exactly the labels machines could not do, and the task card tells them why ("the model was
   only 61% sure: sarcasm").
2. **Monitor behavior, not answers** (`lib/judge/monitor.ts`, no LLM). Latency floors measured
   server-side (`too_fast`), repeated identical answers (`straight_lining`), hidden gold items
   (`gold_miss`, 1 in 5 tasks, invisible to the worker), and disagreement with a 2/3 majority of
   other workers on the same item (`consensus_disagree`).
3. **Check coherence, not correctness** (`lib/judge/index.ts` → `monitorLabel`). On every label the
   Gemini monitor answers one question: is this answer defensible under any reasonable reading of
   the guidelines? `ok` approves (including answers the model disagrees with on a close call),
   `questionable` approves with a small trust nudge, `absurd` at ≥0.8 confidence rejects
   (`incoherent`). It also writes one sentence of feedback to the worker.
4. **Audit later with a bigger model** (`lib/judge/audit.ts`). Every 10 labels per worker, Gemini
   Flash re-reads the last 20 items with guidelines, answers, references and model guesses, and
   returns a batch quality score plus patterns ("over-uses neutral"). Trust moves by at most ±12.
   `POST /api/audit` runs one on demand for the demo.

Pay decision: a label pays when it is approved and has no hard flag (`too_fast`, `straight_lining`,
`gold_miss`, `incoherent`). Trust is an EMA (0–100): multiplier 0.5× under 40, 1× to 80, 1.5×
above; under 25 payouts pause. A `gold_miss` also slashes the worker's vesting escrow (below).

## Payout split and on-chain escrow

Each approved payout is split (`INSTANT_PAY_PCT`, default 70/30):

- **Instant**: treasury → worker wallet, confirmed in seconds.
- **Escrow**: treasury → the worker's escrow account. That account is a plain System Program account
  whose address is derived with `createAddressWithSeed(treasury, sha256(wallet), SystemProgram)`.
  Only the treasury can move funds out, via `SystemProgram::TransferWithSeed`, so no custom program
  is needed. The treasury seeds the account's rent reserve once; worker funds sit on top of it.
- **Release**: after `ESCROW_HOLD_SECONDS` a sweeper (`sweepEscrow`) moves vested holds escrow → wallet.
- **Slash**: a missed hidden gold item flags all of a worker's vesting holds; the sweeper moves them
  escrow → treasury instead. A worker whose trust is under 25 at release time is slashed too.

Every leg is a real testnet transaction with an Explorer link, and the escrow account itself is
viewable on Explorer. First-time recipients get an automatic rent-exemption top-up from the treasury
so small payouts never fail on a fresh wallet. This is custodial escrow (the server holds the
treasury key); an Anchor program with a worker-side `claim` is the trustless roadmap item.

## Deploy to Vultr

```bash
# on a fresh Ubuntu 24.04 instance (1 vCPU / 2 GB is enough), as root
curl -fsSL https://raw.githubusercontent.com/PratLyZol/labelpay/main/deploy/vultr.sh -o vultr.sh
bash vultr.sh https://github.com/PratLyZol/labelpay.git            # first run writes .env and exits
nano /opt/labelpay/.env                                             # fill in secrets, set ALLOW_INSECURE_LOGIN=0
bash vultr.sh https://github.com/PratLyZol/labelpay.git            # builds, migrates, seeds, serves on HTTPS
```

No domain needed: the script defaults to `<public-ip>.sslip.io`, a free wildcard DNS name, and Caddy
issues a Let's Encrypt cert for it. If you claim the free `.tech` domain from the MLH prize page,
point its A record at the VM and pass it as the second argument instead.

## Continuous deployment

`.github/workflows/deploy.yml` runs on every push to `main`: it SSHes into the Vultr box, resets
`/opt/labelpay` to `origin/main` after typecheck, lint, and build pass, rebuilds the container, runs
the idempotent migration and a Gemini smoke test, starts routing in the app container, and checks
that `/api/stats` reports a live Gemini judge. The API key is passed from a GitHub Actions secret
at deployment time; it is not written to a plaintext server file. If you use a custom
domain, set the optional `VULTR_DOMAIN` GitHub secret to that hostname. One-time setup:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/labelpay_deploy -N "" -C labelpay-deploy
ssh-copy-id -i ~/.ssh/labelpay_deploy.pub root@<server-ip>
gh secret set VULTR_HOST --body <server-ip>
gh secret set VULTR_SSH_KEY < ~/.ssh/labelpay_deploy
# also set GEMINI_API_KEY as a GitHub Actions secret from your encrypted local copy
```

## Scripts

`pnpm dev` · `pnpm build` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm route` · `pnpm db:reset` · `pnpm images` ·
`pnpm keygen` · `pnpm gemini:smoke` · `pnpm typecheck` · `pnpm lint`
