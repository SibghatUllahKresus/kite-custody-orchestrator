# KITE Custody Orchestrator

Client-facing API for the KITE custody solution. Handles organizations, wallets, users, and the full transaction flow (create, sign, broadcast). Calls **KITE Custody Vault** internally for wallet and signing operations.

**Standalone:** deploy on its own instance. Clients and the SDK use only this service.

## Prerequisites

- Node.js 18+
- PostgreSQL (organizations)

## Environment

Copy `.env.example` to `.env`:

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (e.g. `8000`) |
| `NODE_ENV` | `production` or `development` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Basic auth for Create Organization |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | PostgreSQL |
| `WALLET_SERVICE_URL` | Full URL of the KITE Custody Vault (no trailing slash) |
| `WALLET_SERVICE_API_KEY` | Must match Vault’s `ALLOWED_API_KEY` |
| `VAULT_REQUEST_TIMEOUT_MS` | Optional; default `30000`. Increase (e.g. `60000`) if wallet creation times out. |

## Build and run

```bash
npm install
npm run build
npm start
```

Development: `npm run dev`. Default port `3000`. Swagger: `http://localhost:3000/api-docs`.

## Deployment

- **Deploy the Vault first.** On startup the Orchestrator calls the Vault’s `/health` (5s timeout). If the Vault is unreachable, the Orchestrator exits instead of starting.
- Deploy this service on one instance. Set `WALLET_SERVICE_URL` to the deployed Vault URL.
- Clients receive this service’s URL and their organization API key (from Create Organization).

## Related

- **KITE Custody Vault** – internal custody backend; Orchestrator calls it.
- **KITE Custodial SDK** – clients use the SDK with this Orchestrator URL and API key.
