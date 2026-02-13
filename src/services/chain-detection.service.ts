import { ethers } from 'ethers';

export interface ChainSupportInfo {
  supportsEIP1559: boolean;
  chainId?: number;
  message?: string;
}

/**
 * Chain Detection Service
 * Detects if a chain supports EIP-1559 (Type 2) transactions
 */
export class ChainDetectionService {
  private cache: Map<string, ChainSupportInfo> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private cacheTimestamps: Map<string, number> = new Map();

  /**
   * Check if RPC URL supports EIP-1559 by checking latest block for baseFeePerGas
   */
  async detectChainSupport(rpcUrl: string): Promise<ChainSupportInfo> {
    // Check cache first
    const cached = this.getCached(rpcUrl);
    if (cached) {
      return cached;
    }

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Get latest block
      const block = await provider.getBlock('latest');
      
      if (!block) {
        throw new Error('Failed to fetch latest block');
      }

      // Check if baseFeePerGas exists (indicates EIP-1559 support)
      const supportsEIP1559 = block.baseFeePerGas !== null && block.baseFeePerGas !== undefined;
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      const result: ChainSupportInfo = {
        supportsEIP1559,
        chainId: Number(chainId),
      };

      // Cache the result
      this.setCached(rpcUrl, result);

      return result;
    } catch (error: any) {
      // If detection fails, assume legacy (safer fallback)
      console.warn(`Chain detection failed for ${rpcUrl}: ${error.message}. Assuming legacy chain.`);
      
      const result: ChainSupportInfo = {
        supportsEIP1559: false,
        message: `Chain detection failed: ${error.message}. Assuming legacy chain.`,
      };

      // Cache the failure result (shorter TTL)
      this.setCached(rpcUrl, result, 60000); // 1 minute for failures

      return result;
    }
  }

  /**
   * Validate transaction type against chain support
   * Returns a message if there's a mismatch (but doesn't throw)
   */
  async validateTransactionType(
    rpcUrl: string,
    transactionType: 0 | 1 | 2
  ): Promise<{ valid: boolean; message?: string; chainSupport: ChainSupportInfo }> {
    const chainSupport = await this.detectChainSupport(rpcUrl);

    // Type 0 and 1 are legacy - work on all chains
    if (transactionType === 0 || transactionType === 1) {
      if (chainSupport.supportsEIP1559) {
        return {
          valid: true,
          message: `Chain supports EIP-1559 (Type 2). Consider using Type 2 for better fee estimation.`,
          chainSupport,
        };
      }
      return {
        valid: true,
        chainSupport,
      };
    }

    // Type 2 (EIP-1559) - only works on chains that support it
    if (transactionType === 2) {
      if (!chainSupport.supportsEIP1559) {
        return {
          valid: false,
          message: `Chain does not support EIP-1559 (Type 2). This chain only supports Legacy transactions (Type 0/1). Please use transactionType: 0 or 1.`,
          chainSupport,
        };
      }
      return {
        valid: true,
        chainSupport,
      };
    }

    return {
      valid: true,
      chainSupport,
    };
  }

  /**
   * Get cached result
   */
  private getCached(rpcUrl: string): ChainSupportInfo | null {
    const cached = this.cache.get(rpcUrl);
    const timestamp = this.cacheTimestamps.get(rpcUrl);

    if (!cached || !timestamp) {
      return null;
    }

    // Check if cache is still valid
    const now = Date.now();
    if (now - timestamp > this.CACHE_TTL) {
      this.cache.delete(rpcUrl);
      this.cacheTimestamps.delete(rpcUrl);
      return null;
    }

    return cached;
  }

  /**
   * Cache result
   */
  private setCached(rpcUrl: string, result: ChainSupportInfo, ttl?: number): void {
    this.cache.set(rpcUrl, result);
    this.cacheTimestamps.set(rpcUrl, Date.now());
    
    // Override TTL if provided
    if (ttl) {
      setTimeout(() => {
        this.cache.delete(rpcUrl);
        this.cacheTimestamps.delete(rpcUrl);
      }, ttl);
    }
  }

  /**
   * Clear cache for a specific RPC URL
   */
  clearCache(rpcUrl?: string): void {
    if (rpcUrl) {
      this.cache.delete(rpcUrl);
      this.cacheTimestamps.delete(rpcUrl);
    } else {
      this.cache.clear();
      this.cacheTimestamps.clear();
    }
  }
}
