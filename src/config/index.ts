import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  port: z.string().default('3000'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
  /** Timeout in ms for each request to KITE Custody Vault (default 30s). Wallet creation may need longer; set VAULT_REQUEST_TIMEOUT_MS if needed. */
  vaultRequestTimeoutMs: z.coerce.number().min(5000).max(120000).default(30000),
  // PostgreSQL for organizations (no AWS credentials needed)
  postgres: z.object({
    host: z.string(),
    port: z.string(),
    database: z.string(),
    user: z.string(),
    password: z.string(),
  }),
  // KITE Custody Vault (for wallet operations and signing)
  walletService: z.object({
    url: z.string().url(),
    apiKey: z.string(), // API key for Orchestrator to authenticate with KITE Custody Vault
  }),
});

export const config = configSchema.parse({
  port: process.env.PORT || '3000',
  nodeEnv: process.env.NODE_ENV || 'development',
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  vaultRequestTimeoutMs: process.env.VAULT_REQUEST_TIMEOUT_MS,
  postgres: {
    host: process.env.POSTGRES_HOST || '',
    port: process.env.POSTGRES_PORT || '5432',
    database: process.env.POSTGRES_DB || 'postgres',
    user: process.env.POSTGRES_USER || '',
    password: process.env.POSTGRES_PASSWORD || '',
  },
  walletService: {
    url: process.env.WALLET_SERVICE_URL || 'http://localhost:3001',
    apiKey: process.env.WALLET_SERVICE_API_KEY || '',
  },
});

export type Config = typeof config;
