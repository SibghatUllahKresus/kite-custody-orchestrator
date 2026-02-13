import { ethers } from 'ethers';

export interface BroadcastRequest {
  signedHex: string;
  rpcUrl: string;
}

export interface BroadcastResponse {
  transactionHash: string;
  blockNumber?: number;
  blockHash?: string;
  status?: number;
  gasUsed?: bigint;
}

/**
 * Service for broadcasting signed transactions to the blockchain
 */
export class BroadcastService {
  /**
   * Broadcast a signed transaction to the blockchain
   * @param request - Broadcast request with signed hex and RPC URL
   * @returns Transaction hash and receipt details
   */
  async broadcastTransaction(request: BroadcastRequest): Promise<BroadcastResponse> {
    const { signedHex, rpcUrl } = request;

    // Validate inputs
    if (!signedHex || typeof signedHex !== 'string') {
      throw new Error('signedHex is required and must be a string');
    }

    if (!rpcUrl || typeof rpcUrl !== 'string') {
      throw new Error('rpcUrl is required and must be a string');
    }

    // Validate RPC URL format
    try {
      new URL(rpcUrl);
    } catch (error) {
      throw new Error('Invalid RPC URL format');
    }

    // Validate signed transaction hex
    if (!signedHex.startsWith('0x')) {
      throw new Error('signedHex must start with 0x');
    }

    try {
      // Parse the signed transaction to validate it
      const tx = ethers.Transaction.from(signedHex);
      
      if (!tx.hash) {
        throw new Error('Invalid signed transaction: missing hash');
      }

      // Create provider
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      // Broadcast the transaction
      const broadcastResult = await provider.broadcastTransaction(signedHex);

      // Wait for transaction to be mined (optional - can be done async)
      let receipt: ethers.TransactionReceipt | null = null;
      try {
        receipt = await broadcastResult.wait();
      } catch (error) {
        // Transaction might be pending, that's okay
        console.warn('Transaction broadcast but not yet mined:', error);
      }

      return {
        transactionHash: broadcastResult.hash,
        blockNumber: receipt?.blockNumber ?? undefined,
        blockHash: receipt?.blockHash ?? undefined,
        status: receipt?.status ?? undefined,
        gasUsed: receipt?.gasUsed ?? undefined,
      };
    } catch (error: any) {
      // Extract detailed error information
      let errorMessage = error.message || 'Unknown error';
      let errorCode: string | undefined;
      let errorData: any = undefined;
      
      // Check for RPC error details
      if (error.code) {
        errorCode = error.code;
      }
      if (error.data) {
        errorData = error.data;
      }
      
      // Check for specific error patterns
      if (errorMessage.includes('invalid signature') || errorMessage.includes('signature')) {
        throw new Error(`Invalid transaction signature: ${errorMessage}`);
      }
      if (errorMessage.includes('nonce')) {
        throw new Error(`Transaction nonce error: ${errorMessage}`);
      }
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('balance')) {
        throw new Error(`Insufficient funds for transaction: ${errorMessage}`);
      }
      if (errorMessage.includes('out of gas') || errorMessage.includes('gas')) {
        throw new Error(`Gas error: ${errorMessage}. The transaction may have failed due to insufficient gas limit.`);
      }
      if (errorMessage.includes('revert') || errorMessage.includes('execution reverted')) {
        throw new Error(`Transaction reverted: ${errorMessage}`);
      }
      
      // Return detailed error with code and data if available
      const detailedError: any = new Error(`Failed to broadcast transaction: ${errorMessage}`);
      if (errorCode) {
        detailedError.code = errorCode;
      }
      if (errorData) {
        detailedError.data = errorData;
      }
      if (error.reason) {
        detailedError.reason = error.reason;
      }
      throw detailedError;
    }
  }

  /**
   * Get transaction receipt (for checking status after broadcast)
   */
  async getTransactionReceipt(rpcUrl: string, transactionHash: string): Promise<ethers.TransactionReceipt | null> {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    return await provider.getTransactionReceipt(transactionHash);
  }
}
