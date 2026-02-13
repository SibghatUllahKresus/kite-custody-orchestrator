import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { ethers } from 'ethers';

export interface SignTransactionRequest {
  walletId: string;
  organizationId?: string;
  unsignedRaw: string;
  transaction?: ethers.TransactionRequest; // Optional for validation
}

export interface SignTransactionResponse {
  success: boolean;
  status: number;
  data?: {
    signedHex: string;
    transactionHash: string;
    signature: {
      r: string;
      s: string;
      v: number;
    };
  };
  error?: string;
}

/** Default timeout for startup health check (fail fast if Vault is down). */
const VAULT_STARTUP_CHECK_TIMEOUT_MS = 5000;

/**
 * Call before starting the Orchestrator. Ensures KITE Custody Vault is up; if not, throws immediately
 * (no long wait). Use a short timeout so deploy fails fast when Vault is down.
 */
export async function checkVaultConnectivity(timeoutMs: number = VAULT_STARTUP_CHECK_TIMEOUT_MS): Promise<void> {
  if (!config.walletService) {
    throw new Error(
      'KITE Custody Vault not configured. Set WALLET_SERVICE_URL and WALLET_SERVICE_API_KEY in environment variables.'
    );
  }
  const { url, apiKey } = config.walletService;
  try {
    const response = await axios.get(`${url.replace(/\/$/, '')}/health`, {
      timeout: timeoutMs,
      headers: { 'X-API-Key': apiKey },
      validateStatus: () => true,
    });
    if (response.status !== 200) {
      throw new Error(`Vault returned status ${response.status}`);
    }
  } catch (err: any) {
    const message = err.code === 'ECONNABORTED'
      ? `KITE Custody Vault did not respond within ${timeoutMs}ms (is it running at ${url}?)`
      : err.response
        ? `KITE Custody Vault returned ${err.response.status}`
        : `KITE Custody Vault unreachable: ${err.message || 'network error'}`;
    throw new Error(message);
  }
}

/**
 * Client for calling KITE Custody Vault.
 * Used by KITE Custody Orchestrator to sign transactions and manage wallets.
 */
export class WalletServiceClient {
  private client: AxiosInstance;

  constructor() {
    if (!config.walletService) {
      throw new Error(
        'KITE Custody Vault not configured. Set WALLET_SERVICE_URL and WALLET_SERVICE_API_KEY in environment variables.'
      );
    }

    const timeoutMs = config.vaultRequestTimeoutMs ?? 10000;
    this.client = axios.create({
      baseURL: config.walletService.url,
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.walletService.apiKey, // This is the WALLET_SERVICE_API_KEY, NOT organization API key
      },
    });
  }

  /**
   * Sign a transaction using KITE Custody Vault
   * @param request - Transaction signing request
   * @returns Signed transaction details
   */
  async signTransaction(request: SignTransactionRequest): Promise<SignTransactionResponse> {
    try {
      const headers: any = {};
      if (request.organizationId) {
        headers['X-Organization-Id'] = request.organizationId;
      }
      
      // Include organizationId in body for KITE Custody Vault
      const body: any = {
        walletId: request.walletId,
        unsignedRaw: request.unsignedRaw,
        transaction: request.transaction,
      };
      if (request.organizationId) {
        body.organizationId = request.organizationId;
      }
      
      const response = await this.client.post<SignTransactionResponse>('/api/sign', body, {
        headers,
      });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        return {
          success: false,
          status: error.response.status,
          error: error.response.data?.error || error.message,
        };
      }
      throw new Error(`Failed to call KITE Custody Vault: ${error.message}`);
    }
  }

  /**
   * Create a wallet for a user (Vault does mnemonic, KMS, DynamoDB, S3, PostgreSQL – use longer timeout).
   */
  async createWallet(organizationId: string, userEmail: string): Promise<any> {
    const baseTimeout = config.vaultRequestTimeoutMs ?? 30000;
    const createWalletTimeout = Math.max(baseTimeout, 60000); // at least 60s for wallet creation
    try {
      const response = await this.client.post('/api/wallets', {
        userEmail,
        organizationId, // Also send in body for KITE Custody Vault
      }, {
        headers: {
          'X-Organization-Id': organizationId,
        },
        timeout: createWalletTimeout,
      });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(error.response.data?.error || error.message);
      }
      throw new Error(`Failed to create wallet: ${error.message}`);
    }
  }

  /**
   * Get wallet details
   */
  async getWallet(walletId: string, organizationId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await this.client.get(`/api/wallets/${walletId}`, {
        headers: {
          'X-Organization-Id': organizationId,
        },
        params: {
          organizationId,
        },
      });
      return { success: true, data: response.data };
    } catch (error: any) {
      if (error.response) {
        return {
          success: false,
          error: error.response.data?.error || error.message,
        };
      }
      return {
        success: false,
        error: `Failed to get wallet: ${error.message}`,
      };
    }
  }

  /**
   * List all wallets for an organization
   */
  async listWallets(organizationId: string): Promise<any> {
    try {
      const response = await this.client.get('/api/wallets', {
        headers: {
          'X-Organization-Id': organizationId,
        },
      });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(error.response.data?.error || error.message);
      }
      throw new Error(`Failed to list wallets: ${error.message}`);
    }
  }

  /**
   * Get wallets for a specific user
   */
  async getWalletsByUser(email: string, organizationId: string): Promise<any> {
    try {
      const response = await this.client.get(`/api/wallets/users/${encodeURIComponent(email)}/wallets`, {
        headers: {
          'X-Organization-Id': organizationId,
        },
      });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(error.response.data?.error || error.message);
      }
      throw new Error(`Failed to get user wallets: ${error.message}`);
    }
  }

  /**
   * List all users in an organization
   */
  async listUsers(organizationId: string): Promise<any> {
    try {
      const response = await this.client.get('/api/users', {
        headers: {
          'X-Organization-Id': organizationId,
        },
      });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(error.response.data?.error || error.message);
      }
      throw new Error(`Failed to list users: ${error.message}`);
    }
  }

  /**
   * Get user details
   */
  async getUser(email: string, organizationId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await this.client.post(`/api/users/${email}`, {
        organizationId,
      }, {
        headers: {
          'X-Organization-Id': organizationId,
        },
      });
      return { success: true, data: response.data };
    } catch (error: any) {
      if (error.response) {
        return {
          success: false,
          error: error.response.data?.error || error.message,
        };
      }
      return {
        success: false,
        error: `Failed to get user: ${error.message}`,
      };
    }
  }

  /**
   * Check if KITE Custody Vault is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}
