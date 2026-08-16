# Mailflow — Invoice Ninja invoice automation

A web app that turns sales records into **Invoice Ninja invoices**: import
records from a CSV file or pasted customer emails, match/create the Invoice
Ninja client for each record, review the generated invoices, then create,
mark-sent, and email them in batches.

## Flow

1. **Configure** — Invoice Ninja instance URL + API token on the Settings page
   (stored in a cookie; server env vars are the fallback).
2. **Source** — upload a CSV, or paste customer emails (names are derived from
   the email address: digits stripped, separators turned into spaces, first
   token title-cased). Each email record starts with one empty line item.
3. **Review** — edit customer info and line items inline (add/remove lines);
   every row is validated (name, email, line description, qty, unit price) and
   invalid rows block continuation.
4. **Clients** — existing Ninja clients are fetched and records are
   auto-matched by email, then name. Unmatched records can be created in Ninja
   in one click, matched manually, or skipped.
5. **Preview** — per-record invoice preview (template, number, due date, line
   items, totals) with toggles for create / mark sent / email.
6. **Execute** — invoices are created (batches of 5), marked sent, and emailed
   with a progress table; failed records can be retried individually.

## Run locally

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173 (Vite, proxies `/api` → `:3001`)
- API: http://localhost:3001 (serverless-style handlers via `tsx server/index.ts`)

## Verify

```bash
npm run typecheck   # tsc for frontend (src, shared) and API (api, shared)
npm run test        # vitest — CSV parsing, email parsing/name derivation, Ninja payload building
```

## Configure Invoice Ninja

The Settings page saves the instance URL and API token on this device:

- Hosted: `https://invoicing.co` · Demo: `https://demo.invoiceninja.com` · Self-hosted: your own domain.
- Create the token in Invoice Ninja at **Settings → Account Management →
  Integrations → API Tokens** (click an existing token to reveal it).
- The app appends `/api/v1` automatically and authenticates with the
  `X-API-TOKEN` header.
- Config is stored in a `mailflow_ninja` cookie (HttpOnly, 1 year,
  SameSite=Lax). The token is masked in every API response; leaving the token
  field blank keeps the current value.
- If no config is saved, server env vars are used as a fallback:
  `NINJA_API_URL`, `NINJA_API_TOKEN`.

## Deploy on Render

1. Push this repo to GitHub and create a **New Web Service** on Render pointing at it.
2. Render auto-detects `render.yaml` (Node runtime, `npm run build`, `npm start`).
3. Add env vars in the Render dashboard: `NINJA_API_URL` (`https://invoicing.co`) and `NINJA_API_TOKEN` (your token).
4. Open the app URL → **Settings** tab → enter the instance URL and token there if you prefer not to use env vars.

**Replacing an expired API key:** open the deployed app's **Settings** tab, paste the new key from Invoice Ninja (Settings → Account Management → Integrations → API Tokens), and click **Save settings**. The key is stored in a `mailflow_ninja` cookie (HttpOnly, 1 year) on your browser, so a new one replaces the old instantly — no redeploy, no env var change needed. Saved settings override the env vars.

## API endpoints

- `GET /api/ninja/status` — validates the token, returns the company name
- `GET /api/ninja/settings` / `POST /api/ninja/settings` — read / save config (masked)
- `GET /api/ninja/clients` — paginated clients with contact emails
- `POST /api/ninja/clients-create` — `{name, email}` → client + contact
- `POST /api/ninja/invoices-create` — `{items:[{id, clientId, payload}]}` (max 10) → per-item results
- `POST /api/ninja/invoices-actions` — `{action:'mark_sent'|'email', items}` → per-item results

Errors are returned as `{error, errorCode, retryable}` — network timeouts and
429s (rate limit) are retried automatically and flagged `retryable: true`.

## Structure

```
api/            serverless handlers (one file per endpoint)
  _lib/         Ninja config (cookie store), HTTP client + error mapping
  ninja/        settings, status, clients, clients-create, invoices-create, invoices-actions
shared/         types + pure logic (CSV, emails, payload builders, client matching)
server/         local dev server that mounts api/ handlers on :3001
src/            React frontend (Dashboard, Bulk import wizard, Templates, Settings)
tests/          vitest suite
```
