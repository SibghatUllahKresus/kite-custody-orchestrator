# KITE Custody Orchestrator

Client-facing API for KITE custody services.

The Orchestrator handles:

- Organization + API key management
- API-key authenticated wallet/user APIs
- Transaction utilities (nonce, gas, tx creation)
- Signing delegation to KITE Custody Vault
- Transaction broadcasting to chain RPC

Clients and the SDK should call this service, not the Vault directly.

## Architecture

- Express API with Swagger docs at `/api-docs`
- PostgreSQL for organization records and API key lookup
- Vault client for wallet/user/sign operations
- Transaction service for native/ERC20 unsigned tx creation
- Broadcast service for signed tx submission

## Prerequisites

- Node.js 18+
- PostgreSQL
- KITE Custody Vault deployed and reachable

## Environment

Copy `.env.example` to `.env`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3000` | HTTP port |
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |
| `ADMIN_EMAIL` | Yes | - | Basic auth username for admin org endpoints |
| `ADMIN_PASSWORD` | Yes | - | Basic auth password (min 8 chars) |
| `VAULT_REQUEST_TIMEOUT_MS` | No | `30000` | Timeout for Vault requests, allowed `5000-120000` |
| `POSTGRES_HOST` | Yes | - | Postgres host |
| `POSTGRES_PORT` | No | `5432` | Postgres port |
| `POSTGRES_DB` | No | `postgres` | Postgres database |
| `POSTGRES_USER` | Yes | - | Postgres user |
| `POSTGRES_PASSWORD` | Yes | - | Postgres password |
| `WALLET_SERVICE_URL` | Yes | `http://localhost:3001` | Vault base URL |
| `WALLET_SERVICE_API_KEY` | Yes | - | Shared secret used when calling Vault |

## Auth model

- Admin endpoints use `Authorization: Basic ...` (`ADMIN_EMAIL` + `ADMIN_PASSWORD`)
- Client endpoints use `X-API-Key` (organization API key from `/api/organizations`)

## Endpoints

### Public

- `GET /health`
- `GET /api-docs`

### Admin (Basic auth)

- `POST /api/organizations` create organization and return API key
- `GET /api/organizations/:organizationId` get organization details

### Client (X-API-Key)

- Wallets:
`POST /api/wallets`
`GET /api/wallets`
`GET /api/wallets/:walletId`
`GET /api/wallets/users/:email/wallets`
- Users:
`GET /api/users`
`GET /api/users/:email`
- Transactions:
`POST /api/transactions/nonce`
`POST /api/transactions/gas-prices`
`POST /api/transactions/gas-price`
`POST /api/transactions/native`
`POST /api/transactions/erc20`
`POST /api/transactions/sign`
`POST /api/transactions/broadcast`

## Transaction flow

1. Client calls nonce/gas endpoints.
2. Client calls `/api/transactions/native` or `/api/transactions/erc20` to create unsigned raw tx.
3. Client calls `/api/transactions/sign`; Orchestrator forwards to Vault with organization context.
4. Client calls `/api/transactions/broadcast`; Orchestrator sends signed tx to the RPC node.

## Build and run

```bash
npm install
npm run build
npm start
```

Development mode:

```bash
npm run dev
```

Local docs:

- [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

## Startup behavior

- Orchestrator initializes PostgreSQL schema before listening.
- Orchestrator checks Vault `/health` during startup.
- Startup fails if Postgres or Vault is not reachable.

## Deployment notes

- Deploy Vault first.
- Keep Vault internal/private; only Orchestrator should reach it.
- Give clients only the Orchestrator URL + organization API key.

## Related services

- KITE Custody Vault (internal signer and shard storage service)
- KITE Custodial SDK (client library for this API)
