import { ethers } from 'ethers';
import { ChainDetectionService, ChainSupportInfo } from './chain-detection.service';

export interface TransactionRequest {
  walletId: string;
  rpcUrl: string;
  to: string;
  value?: string;
  data?: string;
  tokenAddress?: string; // Optional: if provided, treat as ERC20 transfer
  transactionType?: 0 | 1 | 2;
  gasData?: {
    gasPrice?: string; // For Type 1
    maxFeePerGas?: string; // For Type 2
    maxPriorityFeePerGas?: string; // For Type 2
    gasLimit?: string;
  };
  nonce?: number;
}

export interface ERC20TransferRequest {
  walletId: string;
  rpcUrl: string;
  tokenAddress: string;
  to: string;
  amount: string;
  transactionType?: 0 | 1 | 2;
  gasData?: {
    gasPrice?: string; // For Type 1
    maxFeePerGas?: string; // For Type 2
    maxPriorityFeePerGas?: string; // For Type 2
    gasLimit?: string;
  };
  nonce?: number;
}

export interface GasEstimate {
  low: {
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasLimit: string;
  };
  average: {
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasLimit: string;
  };
  high: {
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasLimit: string;
  };
}

export class TransactionService {
  private chainDetection: ChainDetectionService;

  constructor() {
    this.chainDetection = new ChainDetectionService();
  }

  /**
   * Validate RPC URL format
   */
  private validateRpcUrl(rpcUrl: string): void {
    if (!rpcUrl || typeof rpcUrl !== 'string') {
      throw new Error('RPC URL is required and must be a string');
    }
    try {
      new URL(rpcUrl);
    } catch (error) {
      throw new Error(`Invalid RPC URL format: ${rpcUrl}`);
    }
  }

  /**
   * Validate Ethereum address
   */
  private validateAddress(address: string, fieldName: string = 'address'): void {
    if (!address || typeof address !== 'string') {
      throw new Error(`${fieldName} is required and must be a string`);
    }
    if (!ethers.isAddress(address)) {
      throw new Error(`Invalid ${fieldName}: ${address}`);
    }
  }

  /**
   * Validate transaction type and gas data compatibility
   * Only validates that incompatible fields aren't mixed (e.g., gasPrice with Type 2)
   * Does NOT require gas data - it will be auto-calculated if missing
   */
  private validateTransactionTypeAndGasData(
    transactionType: number,
    gasData?: { gasPrice?: string; maxFeePerGas?: string; maxPriorityFeePerGas?: string; gasLimit?: string }
  ): void {
    if (transactionType === 0 || transactionType === 1) {
      // Type 1 (Legacy) - must NOT have EIP-1559 fields if gasPrice is provided
      if (gasData?.gasPrice && (gasData?.maxFeePerGas || gasData?.maxPriorityFeePerGas)) {
        throw new Error(
          'Invalid gas data for Type 1 (Legacy) transaction. ' +
          'Type 1 transactions use "gasPrice" only. ' +
          'Either change transactionType to 2 (EIP-1559) or remove maxFeePerGas and maxPriorityFeePerGas from gasData.'
        );
      }
      // Note: gasPrice is optional - will be auto-calculated if not provided
    } else if (transactionType === 2) {
      // Type 2 (EIP-1559) - must NOT have gasPrice if EIP-1559 fields are provided
      if ((gasData?.maxFeePerGas || gasData?.maxPriorityFeePerGas) && gasData?.gasPrice) {
        throw new Error(
          'Invalid gas data for Type 2 (EIP-1559) transaction. ' +
          'Type 2 transactions use "maxFeePerGas" and "maxPriorityFeePerGas" only. ' +
          'gasPrice is not allowed for Type 2 transactions. Either change transactionType to 1 (Legacy) or remove gasPrice from gasData.'
        );
      }
      // Note: maxFeePerGas and maxPriorityFeePerGas are optional - will be auto-calculated if not provided
    } else {
      throw new Error('transactionType must be 0, 1 (Legacy), or 2 (EIP-1559)');
    }
  }

  /**
   * Get missing gas data based on transaction type
   */
  private async fetchMissingGasData(
    transactionType: number,
    rpcUrl: string,
    gasData?: { gasPrice?: string; maxFeePerGas?: string; maxPriorityFeePerGas?: string; gasLimit?: string },
    transaction?: ethers.TransactionRequest,
    tokenAddress?: string // Optional: if provided, treat as ERC20
  ): Promise<{ gasPrice?: string; maxFeePerGas?: string; maxPriorityFeePerGas?: string; gasLimit?: string }> {
    // If tokenAddress is provided, create proper ERC20 transaction for gas estimation
    let txForGasEstimation = transaction;
    if (tokenAddress && transaction) {
      // For ERC20, we need to encode the transfer function call
      const iface = new ethers.Interface([
        'function transfer(address to, uint256 amount) returns (bool)',
      ]);
      // Use transaction.value as amount, or default to 0
      const amount = transaction.value || '0';
      const data = iface.encodeFunctionData('transfer', [transaction.to || ethers.ZeroAddress, amount]);
      
      txForGasEstimation = {
        ...transaction,
        to: tokenAddress, // ERC20 contract address
        value: '0', // ERC20 transfers have value 0
        data, // Encoded transfer function
      };
    }
    
    if (transactionType === 0 || transactionType === 1) {
      // Type 1 (Legacy)
      if (!gasData?.gasPrice) {
        const estimates = await this.getLegacyGasPrice(rpcUrl, txForGasEstimation, tokenAddress);
        return {
          gasPrice: estimates.average.gasPrice,
          gasLimit: estimates.average.gasLimit,
        };
      }
      // For ERC20 (tokenAddress present), validate provided gasLimit
      if (tokenAddress && gasData.gasLimit) {
        const providedGas = BigInt(gasData.gasLimit);
        if (providedGas < 50000n) {
          console.warn(`Provided gasLimit (${providedGas}) is too low for ERC20 transfer, will be re-estimated`);
          // Don't return gasLimit - force estimation in calling code
          return {
            gasPrice: gasData.gasPrice,
            // gasLimit omitted - will be estimated
          };
        }
      }
      
      return { gasPrice: gasData.gasPrice, gasLimit: gasData.gasLimit };
    } else {
      // Type 2 (EIP-1559)
      if (!gasData?.maxFeePerGas || !gasData?.maxPriorityFeePerGas) {
        const estimates = await this.getGasPrices(rpcUrl, txForGasEstimation);
        return {
          maxFeePerGas: estimates.average.maxFeePerGas,
          maxPriorityFeePerGas: estimates.average.maxPriorityFeePerGas,
          gasLimit: estimates.average.gasLimit,
        };
      }
      return {
        maxFeePerGas: gasData.maxFeePerGas,
        maxPriorityFeePerGas: gasData.maxPriorityFeePerGas,
        gasLimit: gasData.gasLimit,
      };
    }
  }

  /**
   * Get chain ID from RPC endpoint
   */
  private async getChainIdFromRpc(rpcUrl: string): Promise<number> {
    this.validateRpcUrl(rpcUrl);
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const network = await provider.getNetwork();
      return Number(network.chainId);
    } catch (error: any) {
      throw new Error(`Failed to connect to RPC endpoint: ${error.message}`);
    }
  }

  /**
   * Get latest nonce for a wallet address
   */
  async getNonce(walletAddress: string, rpcUrl: string): Promise<number> {
    this.validateAddress(walletAddress, 'wallet address');
    this.validateRpcUrl(rpcUrl);
    
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const nonce = await provider.getTransactionCount(walletAddress, 'pending');
      return nonce;
    } catch (error: any) {
      throw new Error(`Failed to get nonce: ${error.message}`);
    }
  }

  /**
   * Estimate gas for a transaction
   */
  async estimateGas(
    transaction: ethers.TransactionRequest,
    rpcUrl: string
  ): Promise<bigint> {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // For gas estimation, try without 'from' first if it's zero address
      // Some RPCs can estimate without 'from', and zero address causes errors
      let txForEstimation: ethers.TransactionRequest = { ...transaction };
      
      // Only include 'from' if it's a valid non-zero address
      if (transaction.from && transaction.from !== ethers.ZeroAddress) {
        txForEstimation.from = transaction.from;
      }
      // Otherwise, omit 'from' - many RPCs can estimate without it
      
      const estimated = await provider.estimateGas(txForEstimation);
      
      // Add 30% buffer for safety (especially important for ERC20 transfers)
      return (estimated * 130n) / 100n;
    } catch (error: any) {
      // If estimation fails, provide better defaults based on transaction type
      if (transaction.data && transaction.data !== '0x' && transaction.data.length > 2) {
        // ERC20 or contract interaction - use higher default
        throw new Error(`Gas estimation failed for contract interaction: ${error.message}. Please provide gasLimit manually.`);
      }
      // Simple transfer - use standard 21000
      throw new Error(`Gas estimation failed: ${error.message}`);
    }
  }

  /**
   * Get 3-tier gas estimates (low, average, high) for Type 2 (EIP-1559)
   * Also includes gasPrice for reference (though Type 2 doesn't use it)
   * Automatically detects chain support and uses appropriate method
   */
  async getGasPrices(rpcUrl: string, transaction?: ethers.TransactionRequest | any, transactionType?: 0 | 1 | 2, tokenAddress?: string): Promise<GasEstimate & { chainSupport?: ChainSupportInfo; message?: string }> {
    this.validateRpcUrl(rpcUrl);
    
    // Extract tokenAddress from transaction object if present (for ERC20 detection)
    const txTokenAddress = tokenAddress || (transaction as any)?.tokenAddress;
    
    // Prepare transaction for gas estimation
    // If tokenAddress is present, create ERC20 transfer transaction
    let txForGasEstimation: ethers.TransactionRequest | undefined = transaction as ethers.TransactionRequest;
    if (txTokenAddress && transaction) {
      // ERC20 transfer - encode transfer function
      const iface = new ethers.Interface([
        'function transfer(address to, uint256 amount) returns (bool)',
      ]);
      // Use transaction.value or transaction.amount as the transfer amount
      const amount = (transaction as any).value || (transaction as any).amount || '0';
      const toAddress = (transaction as any).to || ethers.ZeroAddress;
      const data = iface.encodeFunctionData('transfer', [toAddress, amount]);
      
      // Get chainId from transaction or detect it
      const chainId = (transaction as any).chainId || (transaction as any).type !== undefined ? undefined : undefined;
      
      txForGasEstimation = {
        type: transactionType || (transaction as any).type || 2,
        chainId: chainId || (transaction as any).chainId,
        to: txTokenAddress, // ERC20 contract address
        value: '0', // ERC20 transfers have value 0
        data, // Encoded transfer function
        // Only include 'from' if it's a valid non-zero address
        ...((transaction as any).from && (transaction as any).from !== ethers.ZeroAddress 
          ? { from: (transaction as any).from } 
          : {}),
      };
    }
    
    // Parallelize chain detection and validation if transactionType provided
    const [chainSupport, validation] = await Promise.all([
      this.chainDetection.detectChainSupport(rpcUrl),
      transactionType !== undefined 
        ? this.chainDetection.validateTransactionType(rpcUrl, transactionType)
        : Promise.resolve({ valid: true, chainSupport: { supportsEIP1559: false }, message: undefined }),
    ]);
    
    // If transactionType is provided, validate it
    let message: string | undefined;
    if (transactionType !== undefined && (!validation.valid || validation.message)) {
      message = validation.message;
    }
    
    // If chain doesn't support EIP-1559, use legacy method
    if (!chainSupport.supportsEIP1559) {
        const legacyEstimate = await this.getLegacyGasPrice(rpcUrl, txForGasEstimation, txTokenAddress);
        return {
          ...legacyEstimate,
          chainSupport,
          message: message || 'Chain does not support EIP-1559. Using legacy gas pricing.',
        };
    }
    
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const feeData = await provider.getFeeData();

      if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
        // Fallback to legacy if EIP-1559 data not available
        const legacyEstimate = await this.getLegacyGasPrice(rpcUrl, txForGasEstimation, txTokenAddress);
        return {
          ...legacyEstimate,
          chainSupport,
          message: message || 'EIP-1559 fee data not available. Using legacy gas pricing.',
        };
      }

      // Calculate base fee
      const baseFee = feeData.maxFeePerGas - feeData.maxPriorityFeePerGas;
      
      // Calculate low, average, high estimates
      const lowPriorityFee = feeData.maxPriorityFeePerGas / 2n;
      const avgPriorityFee = feeData.maxPriorityFeePerGas;
      const highPriorityFee = feeData.maxPriorityFeePerGas * 2n;

      const lowMaxFee = baseFee + lowPriorityFee;
      const avgMaxFee = baseFee + avgPriorityFee;
      const highMaxFee = baseFee + highPriorityFee;

      // Estimate gas limit if transaction provided
      // For ERC20 (tokenAddress present), apply 50% buffer; for native, 30% buffer
      let gasLimit = '21000'; // Default for simple transfers
      if (txForGasEstimation) {
        try {
          // Estimate with 30% buffer first
          const estimated = await this.estimateGas(txForGasEstimation, rpcUrl);
          
          // If tokenAddress is present, apply additional 20% buffer (50% total for ERC20)
          if (txTokenAddress) {
            const withERC20Buffer = (estimated * 120n) / 100n;
            const minGasForERC20 = 50000n;
            gasLimit = (withERC20Buffer < minGasForERC20 ? minGasForERC20 : withERC20Buffer).toString();
            console.log(`[Gas Prices API] ERC20 detected - Base: ${estimated.toString()}, With 50% buffer: ${gasLimit}`);
          } else {
          gasLimit = estimated.toString();
          }
        } catch (error: any) {
          // For ERC20 transfers, use safe default if estimation fails
          if (txTokenAddress) {
            // ERC20 transfer default: 65,000 gas (safe default for most ERC20 transfers)
            // Apply 50% buffer = 97,500
            const erc20Default = 97500n;
            gasLimit = erc20Default.toString();
            console.warn(`[Gas Prices API] ERC20 gas estimation failed, using safe default: ${gasLimit}`);
          } else if (txForGasEstimation.data && txForGasEstimation.data !== '0x' && txForGasEstimation.data.length > 2) {
            // Other contract interactions - throw error
            throw new Error(`Gas estimation required for contract interaction: ${error.message}`);
          }
          // For simple native transfers, use default 21000
        }
      }

      return {
        low: {
          maxFeePerGas: lowMaxFee.toString(),
          maxPriorityFeePerGas: lowPriorityFee.toString(),
          gasLimit,
        },
        average: {
          maxFeePerGas: avgMaxFee.toString(),
          maxPriorityFeePerGas: avgPriorityFee.toString(),
          gasLimit,
        },
        high: {
          maxFeePerGas: highMaxFee.toString(),
          maxPriorityFeePerGas: highPriorityFee.toString(),
          gasLimit,
        },
        chainSupport,
        ...(message && { message }),
      };
    } catch (error: any) {
      // Fallback to legacy on error
      try {
        const legacyEstimate = await this.getLegacyGasPrice(rpcUrl, transaction, txTokenAddress);
        return {
          ...legacyEstimate,
          chainSupport,
          message: message || `Failed to get EIP-1559 gas prices: ${error.message}. Using legacy gas pricing.`,
        };
      } catch (legacyError: any) {
        throw new Error(`Failed to get gas prices: ${error.message}. Legacy fallback also failed: ${legacyError.message}`);
      }
    }
  }

  /**
   * Get 3-tier gas estimates (low, average, high) for Type 1 (Legacy)
   * Automatically detects chain support
   */
  async getLegacyGasPrice(rpcUrl: string, transaction?: ethers.TransactionRequest | any, tokenAddress?: string): Promise<GasEstimate & { chainSupport?: ChainSupportInfo; message?: string }> {
    this.validateRpcUrl(rpcUrl);
    
    // Extract tokenAddress from transaction object if present
    const txTokenAddress = tokenAddress || (transaction as any)?.tokenAddress;
    
    // Prepare transaction for gas estimation
    let txForGasEstimation: ethers.TransactionRequest | undefined = transaction as ethers.TransactionRequest;
    if (txTokenAddress && transaction) {
      // ERC20 transfer - encode transfer function
      const iface = new ethers.Interface([
        'function transfer(address to, uint256 amount) returns (bool)',
      ]);
      const amount = (transaction as any).value || (transaction as any).amount || '0';
      const toAddress = (transaction as any).to || ethers.ZeroAddress;
      const data = iface.encodeFunctionData('transfer', [toAddress, amount]);
      
      txForGasEstimation = {
        type: (transaction as any).type || 1,
        chainId: (transaction as any).chainId,
        to: txTokenAddress, // ERC20 contract address
        value: '0', // ERC20 transfers have value 0
        data, // Encoded transfer function
        // Only include 'from' if it's a valid non-zero address
        ...((transaction as any).from && (transaction as any).from !== ethers.ZeroAddress 
          ? { from: (transaction as any).from } 
          : {}),
      };
    }
    
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const feeData = await provider.getFeeData();

      if (!feeData.gasPrice) {
        throw new Error('Gas price not available for this RPC endpoint');
      }

      // Calculate low, average, high estimates
      const lowGasPrice = feeData.gasPrice * 9n / 10n; // 90% of current
      const avgGasPrice = feeData.gasPrice;
      const highGasPrice = feeData.gasPrice * 11n / 10n; // 110% of current

      // Parallelize gas estimation and chain detection
      const [gasEstimateResult, chainSupport] = await Promise.all([
        txForGasEstimation 
          ? (async () => {
        try {
                const estimated = await this.estimateGas(txForGasEstimation!, rpcUrl);
                // If tokenAddress is present, apply additional 20% buffer (50% total for ERC20)
                if (txTokenAddress) {
                  const withERC20Buffer = (estimated * 120n) / 100n;
                  const minGasForERC20 = 50000n;
                  return (withERC20Buffer < minGasForERC20 ? minGasForERC20 : withERC20Buffer).toString();
                }
                return estimated.toString();
              } catch (error: any) {
                // For ERC20 transfers, use safe default if estimation fails
                if (txTokenAddress) {
                  const erc20Default = 97500n; // 65,000 * 1.5 (50% buffer)
                  console.warn(`[Legacy Gas API] ERC20 gas estimation failed, using safe default: ${erc20Default}`);
                  return erc20Default.toString();
                }
                // For native transfers, use default
                return '21000';
              }
            })()
          : Promise.resolve('21000'),
        this.chainDetection.detectChainSupport(rpcUrl),
      ]);
      
      // Estimate gas limit if transaction provided (with 30% buffer for native, 50% for ERC20)
      const gasLimit = gasEstimateResult;

      return {
        low: {
          gasPrice: lowGasPrice.toString(),
          gasLimit,
        },
        average: {
          gasPrice: avgGasPrice.toString(),
          gasLimit,
        },
        high: {
          gasPrice: highGasPrice.toString(),
          gasLimit,
        },
        chainSupport,
        ...(chainSupport.supportsEIP1559 && {
          message: 'Chain supports EIP-1559 (Type 2). Consider using Type 2 for better fee estimation.',
        }),
      };
    } catch (error: any) {
      throw new Error(`Failed to get legacy gas price: ${error.message}`);
    }
  }

  /**
   * Create a transaction for native token transfer
   */
  async createNativeTransfer(
    request: TransactionRequest,
    walletAddress: string
  ): Promise<{
    transaction: ethers.TransactionRequest;
    unsignedRaw: string;
    chainId: number;
    rpcUrl: string;
    transactionType: number;
    gasLimit: string;
    nonce: number;
    chainWarning?: string;
  }> {
    // Validate inputs
    this.validateAddress(request.to, 'recipient address');
    this.validateRpcUrl(request.rpcUrl);
    
    if (!request.walletId || typeof request.walletId !== 'string') {
      throw new Error('walletId is required and must be a string');
    }

    const chainId = await this.getChainIdFromRpc(request.rpcUrl);
    
    // Auto-detect chain support to determine default transaction type
    const chainSupport = await this.chainDetection.detectChainSupport(request.rpcUrl);
    
    // If transactionType not provided, auto-detect: use Type 2 if chain supports EIP-1559, otherwise Type 1
    let transactionType = request.transactionType;
    if (transactionType === undefined || transactionType === null) {
      transactionType = chainSupport.supportsEIP1559 ? 2 : 1;
      console.log(`[Auto-detect] Transaction type not provided, using Type ${transactionType} (chain ${chainSupport.supportsEIP1559 ? 'supports' : 'does not support'} EIP-1559)`);
    }

    // Detect chain support and validate transaction type
    const chainValidation = await this.chainDetection.validateTransactionType(
      request.rpcUrl,
      transactionType as 0 | 1 | 2
    );

    // If transaction type doesn't match chain support, include warning in response
    let chainWarning: string | undefined;
    if (!chainValidation.valid) {
      chainWarning = chainValidation.message;
    } else if (chainValidation.message) {
      chainWarning = chainValidation.message; // Info message (e.g., using legacy on EIP-1559 chain)
    }

    // Validate transaction type and gas data (only check for incompatible fields, not missing fields)
    this.validateTransactionTypeAndGasData(transactionType, request.gasData);

    // Fetch missing gas data if not provided
    // Detect if tokenAddress is present (optional field) to determine ERC20 vs native
    const finalGasData = await this.fetchMissingGasData(
      transactionType,
      request.rpcUrl,
      request.gasData,
      {
        type: transactionType,
        chainId,
        to: request.to,
        value: request.value || '0',
        data: request.data || '0x',
      },
      request.tokenAddress // Pass tokenAddress if present
    );

    // Parallelize gas limit estimation and nonce fetch
    // For ERC20 (tokenAddress present), ALWAYS estimate gas (ignore provided gasLimit)
    // For native transfers, validate provided gasLimit or estimate
    const [gasLimit, nonce] = await Promise.all([
      (async () => {
        // If tokenAddress is present, try to estimate ERC20 gas
        if (request.tokenAddress) {
          // Check if gasLimit is provided and seems reasonable
          if (finalGasData.gasLimit) {
            const providedGas = BigInt(finalGasData.gasLimit);
            if (providedGas >= 50000n) {
              console.log(`[ERC20 Gas] Using provided gasLimit: ${providedGas.toString()}`);
              return providedGas;
            }
          }
          
          // Try to estimate ERC20 transfer gas
          try {
            const iface = new ethers.Interface([
              'function transfer(address to, uint256 amount) returns (bool)',
            ]);
            const data = iface.encodeFunctionData('transfer', [request.to, request.value || '0']);
            const tempTx: ethers.TransactionRequest = {
              type: transactionType,
              chainId,
              to: request.tokenAddress, // ERC20 contract address
              value: '0', // ERC20 transfers have value 0
              data,
              from: walletAddress, // Include from address for better estimation
            };
            // Estimate with 30% buffer first
            const estimated = await this.estimateGas(tempTx, request.rpcUrl);
            console.log(`[ERC20 Gas] Base estimation: ${estimated.toString()}`);
            
            // Apply additional 20% on top = 50% total buffer for ERC20 (very conservative)
            const withBuffer = (estimated * 120n) / 100n;
            console.log(`[ERC20 Gas] With 50% total buffer: ${withBuffer.toString()}`);
            
            // Validate minimum gas for ERC20 (should be at least 50000)
            const minGasForERC20 = 50000n;
            if (withBuffer < minGasForERC20) {
              console.warn(`[ERC20 Gas] Estimated gas (${withBuffer}) is below minimum for ERC20 (${minGasForERC20}), using minimum`);
              return minGasForERC20;
            }
            
            console.log(`[ERC20 Gas] Final gas limit: ${withBuffer.toString()}`);
            return withBuffer;
          } catch (error: any) {
            // Gas estimation failed - use safe high default for ERC20
            const safeDefaultERC20 = 150000n;
            console.warn(`[ERC20 Gas] Gas estimation failed (${error.message}), using safe default: ${safeDefaultERC20.toString()}`);
            console.warn(`[ERC20 Gas] Transaction will proceed with offline signing. User can adjust gasLimit if needed.`);
            return safeDefaultERC20;
          }
        }
        
        // Native transfer - validate provided gasLimit or estimate
        if (finalGasData.gasLimit) {
          const providedGas = BigInt(finalGasData.gasLimit);
          // Validate it's reasonable for native transfer (should be around 21000)
          if (providedGas < 20000n || providedGas > 100000n) {
            console.warn(`Provided gasLimit (${providedGas}) seems incorrect for native transfer, estimating instead`);
            // Fall through to estimation
          } else {
            return providedGas;
          }
        }
        
        // Estimate for native transfer (30% buffer applied in estimateGas)
        try {
          const tempTx: ethers.TransactionRequest = {
            type: transactionType,
            chainId,
            to: request.to,
            value: request.value || '0',
            data: request.data || '0x',
            from: walletAddress, // Include from address for better estimation
          };
          return await this.estimateGas(tempTx, request.rpcUrl);
        } catch (error: any) {
          // Gas estimation failed for native transfer - use safe default
          const safeDefaultNative = 30000n; // Higher than standard 21000 for safety
          console.warn(`[Native Gas] Gas estimation failed (${error.message}), using safe default: ${safeDefaultNative.toString()}`);
          console.warn(`[Native Gas] Transaction will proceed with offline signing. User can adjust gasLimit if needed.`);
          return safeDefaultNative;
        }
      })(),
      request.nonce !== undefined
        ? Promise.resolve(request.nonce)
        : this.getNonce(walletAddress, request.rpcUrl),
    ]);

    // Build transaction
    let transaction: ethers.TransactionRequest;
    if (transactionType === 0 || transactionType === 1) {
      transaction = {
        type: transactionType,
        chainId,
        to: request.to,
        value: request.value || '0',
        gasPrice: finalGasData.gasPrice!,
        gasLimit: gasLimit.toString(),
        nonce,
      };
    } else {
      transaction = {
        type: 2,
        chainId,
        to: request.to,
        value: request.value || '0',
        maxFeePerGas: finalGasData.maxFeePerGas!,
        maxPriorityFeePerGas: finalGasData.maxPriorityFeePerGas!,
        gasLimit: gasLimit.toString(),
        nonce,
      };
    }

    // Serialize to unsigned raw transaction
    const txLike: any = {
      type: transaction.type,
      chainId: transaction.chainId,
      to: typeof transaction.to === 'string' ? transaction.to : transaction.to?.toString(),
      value: transaction.value,
      gasLimit: transaction.gasLimit,
      nonce: transaction.nonce,
      data: transaction.data || '0x',
    };
    
    if (transaction.gasPrice) {
      txLike.gasPrice = transaction.gasPrice;
    }
    if (transaction.maxFeePerGas) {
      txLike.maxFeePerGas = transaction.maxFeePerGas;
    }
    if (transaction.maxPriorityFeePerGas) {
      txLike.maxPriorityFeePerGas = transaction.maxPriorityFeePerGas;
    }
    
    const tx = ethers.Transaction.from(txLike);
    const unsignedRaw = tx.unsignedSerialized;

    return {
      transaction,
      unsignedRaw,
      chainId,
      rpcUrl: request.rpcUrl,
      transactionType,
      gasLimit: gasLimit.toString(),
      nonce,
      chainWarning, // Include chain validation warning if any
    };
  }

  /**
   * Create a transaction for ERC20 token transfer
   */
  async createERC20Transfer(
    request: ERC20TransferRequest,
    walletAddress: string
  ): Promise<{
    transaction: ethers.TransactionRequest;
    unsignedRaw: string;
    chainId: number;
    rpcUrl: string;
    tokenAddress: string;
    transactionType: number;
    gasLimit: string;
    nonce: number;
    chainWarning?: string;
  }> {
    // Validate inputs
    this.validateAddress(request.to, 'recipient address');
    this.validateAddress(request.tokenAddress, 'token address');
    this.validateRpcUrl(request.rpcUrl);
    
    if (!request.walletId || typeof request.walletId !== 'string') {
      throw new Error('walletId is required and must be a string');
    }

    if (!request.amount || typeof request.amount !== 'string') {
      throw new Error('amount is required and must be a string');
    }

    const chainId = await this.getChainIdFromRpc(request.rpcUrl);
    
    // Auto-detect chain support to determine default transaction type
    const chainSupport = await this.chainDetection.detectChainSupport(request.rpcUrl);
    
    // If transactionType not provided, auto-detect: use Type 2 if chain supports EIP-1559, otherwise Type 1
    let transactionType = request.transactionType;
    if (transactionType === undefined || transactionType === null) {
      transactionType = chainSupport.supportsEIP1559 ? 2 : 1;
      console.log(`[Auto-detect] Transaction type not provided, using Type ${transactionType} (chain ${chainSupport.supportsEIP1559 ? 'supports' : 'does not support'} EIP-1559)`);
    }

    // Detect chain support and validate transaction type
    const chainValidation = await this.chainDetection.validateTransactionType(
      request.rpcUrl,
      transactionType as 0 | 1 | 2
    );

    // If transaction type doesn't match chain support, include warning in response
    let chainWarning: string | undefined;
    if (!chainValidation.valid) {
      chainWarning = chainValidation.message;
    } else if (chainValidation.message) {
      chainWarning = chainValidation.message;
    }

    // Validate transaction type and gas data (only check for incompatible fields, not missing fields)
    this.validateTransactionTypeAndGasData(transactionType, request.gasData);

    // Encode ERC20 transfer
    const iface = new ethers.Interface([
      'function transfer(address to, uint256 amount) returns (bool)',
    ]);
    const data = iface.encodeFunctionData('transfer', [request.to, request.amount]);

    // Fetch missing gas data if not provided
    const tempTxForGas: ethers.TransactionRequest = {
      type: transactionType,
      chainId,
      to: request.tokenAddress,
      value: '0',
      data,
    };
    const finalGasData = await this.fetchMissingGasData(
      transactionType,
      request.rpcUrl,
      request.gasData,
      tempTxForGas,
      request.tokenAddress // Pass tokenAddress (already in ERC20 request)
    );

    // Parallelize gas limit estimation and nonce fetch
    // For ERC20 transfers, try to estimate gas, but use safe default if estimation fails
    const [gasLimit, nonce] = await Promise.all([
      (async () => {
        // If gasLimit is provided and seems reasonable for ERC20, use it
        if (request.gasData?.gasLimit) {
          const providedGas = BigInt(request.gasData.gasLimit);
          if (providedGas >= 50000n) {
            console.log(`[ERC20 Gas] Using provided gasLimit: ${providedGas.toString()}`);
            return providedGas;
          }
        }
        
        // Try to estimate gas, but handle failures gracefully
        try {
          const tempTxWithFrom: ethers.TransactionRequest = {
            ...tempTxForGas,
            from: walletAddress, // Include from address for better estimation
          };
          // Estimate with 30% buffer first
          const estimated = await this.estimateGas(tempTxWithFrom, request.rpcUrl);
          console.log(`[ERC20 Gas] Base estimation: ${estimated.toString()}`);
          
          // Apply additional 20% on top = 50% total buffer for ERC20 (very conservative)
          const withBuffer = (estimated * 120n) / 100n;
          console.log(`[ERC20 Gas] With 50% total buffer: ${withBuffer.toString()}`);
          
          // Validate minimum gas for ERC20 (should be at least 50000)
          const minGasForERC20 = 50000n;
          if (withBuffer < minGasForERC20) {
            console.warn(`[ERC20 Gas] Estimated gas (${withBuffer}) is below minimum for ERC20 (${minGasForERC20}), using minimum`);
            return minGasForERC20;
          }
          
          console.log(`[ERC20 Gas] Final gas limit: ${withBuffer.toString()}`);
          return withBuffer;
        } catch (error: any) {
          // Gas estimation failed - use safe high default for ERC20
          // 150,000 is a safe high value that covers most ERC20 transfers
          const safeDefaultERC20 = 150000n;
          console.warn(`[ERC20 Gas] Gas estimation failed (${error.message}), using safe default: ${safeDefaultERC20.toString()}`);
          console.warn(`[ERC20 Gas] Transaction will proceed with offline signing. User can adjust gasLimit if needed.`);
          return safeDefaultERC20;
        }
      })(),
      request.nonce !== undefined
        ? Promise.resolve(request.nonce)
        : this.getNonce(walletAddress, request.rpcUrl),
    ]);

    // Build transaction
    let transaction: ethers.TransactionRequest;
    if (transactionType === 0 || transactionType === 1) {
      transaction = {
        type: transactionType,
        chainId,
        to: request.tokenAddress,
        value: '0',
        data,
        gasPrice: finalGasData.gasPrice!,
        gasLimit: gasLimit.toString(),
        nonce,
      };
    } else {
      transaction = {
        type: 2,
        chainId,
        to: request.tokenAddress,
        value: '0',
        data,
        maxFeePerGas: finalGasData.maxFeePerGas!,
        maxPriorityFeePerGas: finalGasData.maxPriorityFeePerGas!,
        gasLimit: gasLimit.toString(),
        nonce,
      };
    }

    // Serialize to unsigned raw transaction
    const txLike: any = {
      type: transaction.type,
      chainId: transaction.chainId,
      to: typeof transaction.to === 'string' ? transaction.to : transaction.to?.toString(),
      value: transaction.value,
      gasLimit: transaction.gasLimit,
      nonce: transaction.nonce,
      data: transaction.data || '0x',
    };
    
    if (transaction.gasPrice) {
      txLike.gasPrice = transaction.gasPrice;
    }
    if (transaction.maxFeePerGas) {
      txLike.maxFeePerGas = transaction.maxFeePerGas;
    }
    if (transaction.maxPriorityFeePerGas) {
      txLike.maxPriorityFeePerGas = transaction.maxPriorityFeePerGas;
    }
    
    const tx = ethers.Transaction.from(txLike);
    const unsignedRaw = tx.unsignedSerialized;

    return {
      transaction,
      unsignedRaw,
      chainId,
      rpcUrl: request.rpcUrl,
      tokenAddress: request.tokenAddress,
      transactionType,
      gasLimit: gasLimit.toString(),
      nonce,
      chainWarning, // Include chain validation warning if any
    };
  }
}
