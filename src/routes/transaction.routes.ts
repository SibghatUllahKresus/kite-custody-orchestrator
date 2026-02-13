import { Router, Response } from 'express';
import { TransactionService, TransactionRequest, ERC20TransferRequest } from '../services/transaction.service';
import { apiKeyAuth, AuthRequest } from '../middleware/auth.middleware';
import { WalletServiceClient } from '../services/signing-client.service';
import { BroadcastService } from '../services/broadcast.service';
import { toHttpError } from '../utils/errorHandler';

const router = Router();
const transactionService = new TransactionService();
const broadcastService = new BroadcastService();
let walletServiceClient: WalletServiceClient | null = null;

// Initialize KITE Custody Vault client if configured
try {
  walletServiceClient = new WalletServiceClient();
} catch (error) {
  console.warn('KITE Custody Vault not configured. Signing endpoints will not be available.');
}

/**
 * @swagger
 * /api/transactions/nonce:
 *   post:
 *     summary: Get latest nonce for a wallet
 *     description: Returns the current nonce for a wallet address on the specified chain
 *     tags: [Transactions]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - walletId
 *               - rpcUrl
 *             properties:
 *               walletId:
 *                 type: string
 *                 description: "Wallet ID"
 *               rpcUrl:
 *                 type: string
 *                 example: "https://eth.llamarpc.com"
 *                 description: "RPC endpoint URL"
 *     responses:
 *       200:
 *         description: Nonce retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 walletId:
 *                   type: string
 *                 walletAddress:
 *                   type: string
 *                 nonce:
 *                   type: number
 *                 rpcUrl:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Wallet not found
 */
router.post('/nonce', apiKeyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { walletId, rpcUrl } = req.body;
    const organizationId = req.organizationId!;

    if (!walletId || !rpcUrl) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'walletId and rpcUrl are required',
      });
      return;
    }

    // Get wallet from KITE Custody Vault
    if (!walletServiceClient) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'KITE Custody Vault not configured',
      });
      return;
    }

    const walletResult = await walletServiceClient.getWallet(walletId, organizationId);
    if (!walletResult.success || !walletResult.data?.data?.address) {
      res.status(404).json({
        success: false,
        status: 404,
        error: 'Wallet not found',
      });
      return;
    }

    const walletAddress = walletResult.data.data.address;
    const nonce = await transactionService.getNonce(walletAddress, rpcUrl);

    res.status(200).json({
      success: true,
      status: 200,
      data: {
        walletId,
        walletAddress: walletAddress,
        nonce,
        rpcUrl,
      },
    });
  } catch (error: any) {
    console.error('Error getting nonce:', error);
    const { statusCode, message } = toHttpError(error);
    res.status(statusCode).json({
      success: false,
      status: statusCode,
      error: message,
    });
  }
});

/**
 * @swagger
 * /api/transactions/gas-prices:
 *   post:
 *     summary: Get gas price estimates (Type 2 - EIP-1559) with 3 tiers
 *     description: Returns low, average, and high gas price estimates for EIP-1559 transactions, including gas limit
 *     tags: [Transactions]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rpcUrl
 *             properties:
 *               rpcUrl:
 *                 type: string
 *                 example: "https://eth.llamarpc.com"
 *                 description: "RPC endpoint URL"
 *               transaction:
 *                 type: object
 *                 description: "Optional transaction object for accurate gas limit estimation"
 *     responses:
 *       200:
 *         description: Gas price estimates with 3 tiers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rpcUrl:
 *                   type: string
 *                 low:
 *                   type: object
 *                   properties:
 *                     maxFeePerGas:
 *                       type: string
 *                       description: "Max fee per gas (Type 2 only)"
 *                     maxPriorityFeePerGas:
 *                       type: string
 *                       description: "Max priority fee per gas (Type 2 only)"
 *                     gasLimit:
 *                       type: string
 *                 average:
 *                   type: object
 *                   properties:
 *                     maxFeePerGas:
 *                       type: string
 *                       description: "Max fee per gas (Type 2 only)"
 *                     maxPriorityFeePerGas:
 *                       type: string
 *                       description: "Max priority fee per gas (Type 2 only)"
 *                     gasLimit:
 *                       type: string
 *                 high:
 *                   type: object
 *                   properties:
 *                     maxFeePerGas:
 *                       type: string
 *                       description: "Max fee per gas (Type 2 only)"
 *                     maxPriorityFeePerGas:
 *                       type: string
 *                       description: "Max priority fee per gas (Type 2 only)"
 *                     gasLimit:
 *                       type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post('/gas-prices', apiKeyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { rpcUrl, transaction, transactionType, tokenAddress } = req.body;

    if (!rpcUrl) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'rpcUrl is required',
      });
      return;
    }

    // Pass tokenAddress separately or extract from transaction object
    const txTokenAddress = tokenAddress || transaction?.tokenAddress;
    const gasEstimates = await transactionService.getGasPrices(rpcUrl, transaction, transactionType, txTokenAddress);

    res.status(200).json({
      success: true,
      status: 200,
      data: {
        rpcUrl,
        ...gasEstimates,
      },
    });
  } catch (error: any) {
    console.error('Error fetching gas prices:', error);
    const { statusCode, message } = toHttpError(error);
    res.status(statusCode).json({
      success: false,
      status: statusCode,
      error: message,
    });
  }
});

/**
 * @swagger
 * /api/transactions/gas-price:
 *   post:
 *     summary: Get gas price estimates (Type 1 - Legacy) with 3 tiers
 *     description: Returns low, average, and high gas price estimates for legacy transactions, including gas limit
 *     tags: [Transactions]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rpcUrl
 *             properties:
 *               rpcUrl:
 *                 type: string
 *                 example: "https://eth.llamarpc.com"
 *                 description: "RPC endpoint URL"
 *               transaction:
 *                 type: object
 *                 description: "Optional transaction object for accurate gas limit estimation"
 *     responses:
 *       200:
 *         description: Gas price estimates with 3 tiers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rpcUrl:
 *                   type: string
 *                 low:
 *                   type: object
 *                   properties:
 *                     gasPrice:
 *                       type: string
 *                     gasLimit:
 *                       type: string
 *                 average:
 *                   type: object
 *                   properties:
 *                     gasPrice:
 *                       type: string
 *                     gasLimit:
 *                       type: string
 *                 high:
 *                   type: object
 *                   properties:
 *                     gasPrice:
 *                       type: string
 *                     gasLimit:
 *                       type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post('/gas-price', apiKeyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { rpcUrl, transaction, tokenAddress } = req.body;

    if (!rpcUrl) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'rpcUrl is required',
      });
      return;
    }

    // Pass tokenAddress separately or extract from transaction object
    const txTokenAddress = tokenAddress || transaction?.tokenAddress;
    const gasEstimates = await transactionService.getLegacyGasPrice(rpcUrl, transaction, txTokenAddress);

    res.status(200).json({
      success: true,
      status: 200,
      data: {
        rpcUrl,
        ...gasEstimates,
      },
    });
  } catch (error: any) {
    console.error('Error fetching legacy gas price:', error);
    const { statusCode, message } = toHttpError(error);
    res.status(statusCode).json({
      success: false,
      status: statusCode,
      error: message,
    });
  }
});

/**
 * @swagger
 * /api/transactions/native:
 *   post:
 *     summary: Create a native token transfer transaction (supports Type 1 and Type 2)
 *     description: Creates an unsigned raw transaction. Returns transaction object and unsigned raw hex ready for signing.
 *     tags: [Transactions]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - walletId
 *               - rpcUrl
 *               - to
 *               - transactionType
 *             properties:
 *               walletId:
 *                 type: string
 *                 description: "Wallet ID to create transaction for"
 *               rpcUrl:
 *                 type: string
 *                 example: "https://eth.llamarpc.com"
 *                 description: "RPC endpoint URL (chainId will be automatically fetched)"
 *               to:
 *                 type: string
 *                 example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
 *                 description: "Recipient address"
 *               value:
 *                 type: string
 *                 example: "1000000000000000000"
 *                 description: "Amount in wei (optional, defaults to 0)"
 *               transactionType:
 *                 type: number
 *                 enum: [0, 1, 2]
 *                 description: "Transaction type: 0 or 1 for legacy (Type 1), 2 for EIP-1559 (Type 2)"
 *               gasData:
 *                 type: object
 *                 description: "Gas data object (optional - will be fetched automatically if not provided). STRICT: Type 1 requires gasPrice only (maxFeePerGas/maxPriorityFeePerGas not allowed). Type 2 requires maxFeePerGas and maxPriorityFeePerGas only (gasPrice not allowed)."
 *                 properties:
 *                   gasPrice:
 *                     type: string
 *                     description: "For Type 1 ONLY: Gas price in wei (required for Type 1, NOT allowed for Type 2)"
 *                   maxFeePerGas:
 *                     type: string
 *                     description: "For Type 2 ONLY: Max fee per gas in wei (required for Type 2, NOT allowed for Type 1)"
 *                   maxPriorityFeePerGas:
 *                     type: string
 *                     description: "For Type 2 ONLY: Max priority fee per gas in wei (required for Type 2, NOT allowed for Type 1)"
 *                   gasLimit:
 *                     type: string
 *                     description: "Gas limit (optional, will be estimated if not provided)"
 *               nonce:
 *                 type: number
 *                 description: "Transaction nonce (optional, will be fetched if not provided)"
 *     responses:
 *       200:
 *         description: Unsigned transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 walletId:
 *                   type: string
 *                 transaction:
 *                   type: object
 *                   description: "Raw unsigned transaction object"
 *                 unsignedRaw:
 *                   type: string
 *                   description: "Unsigned raw transaction in hex format (ready for signing)"
 *                 chainId:
 *                   type: number
 *                 rpcUrl:
 *                   type: string
 *                 transactionType:
 *                   type: number
 *                 gasLimit:
 *                   type: string
 *                 nonce:
 *                   type: number
 *       400:
 *         description: Invalid request (validation errors)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Wallet not found
 */
router.post('/native', apiKeyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { 
      walletId, 
      rpcUrl,
      to, 
      value,
      transactionType,
      gasData,
      nonce 
    } = req.body;

    const organizationId = req.organizationId!;

    // Basic validation
    if (!walletId || !rpcUrl || !to) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'walletId, rpcUrl, and to are required',
      });
      return;
    }

    // transactionType is optional - will be auto-detected based on chain support if not provided
    if (transactionType !== undefined && transactionType !== null && transactionType !== 0 && transactionType !== 1 && transactionType !== 2) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'transactionType must be 0, 1 (Legacy), or 2 (EIP-1559) if provided',
      });
      return;
    }

    // gasData is optional - will be fetched if not provided, but validated if provided
    if (gasData && typeof gasData !== 'object') {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'gasData must be an object if provided',
      });
      return;
    }

    // Get wallet from KITE Custody Vault
    if (!walletServiceClient) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'KITE Custody Vault not configured',
      });
      return;
    }

    const walletResult = await walletServiceClient.getWallet(walletId, organizationId);
    if (!walletResult.success || !walletResult.data?.data?.address) {
      res.status(404).json({
        success: false,
        status: 404,
        error: 'Wallet not found',
      });
      return;
    }

    const walletAddress = walletResult.data.data.address;

    // Build transaction request
    const request: TransactionRequest = {
      walletId,
      rpcUrl,
      to,
      value,
      transactionType: transactionType as 0 | 1 | 2,
      gasData,
      nonce,
    };

    // Create transaction (validation happens inside)
    const result = await transactionService.createNativeTransfer(request, walletAddress);

    res.status(200).json({
      success: true,
      status: 200,
      data: {
        walletId,
        transaction: result.transaction,
        unsignedRaw: result.unsignedRaw,
        chainId: result.chainId,
        rpcUrl: result.rpcUrl,
        transactionType: result.transactionType,
        gasLimit: result.gasLimit,
        nonce: result.nonce,
        ...(result.chainWarning && { chainWarning: result.chainWarning }),
      },
    });
  } catch (error: any) {
    console.error('Error creating native transfer:', error);
    const { statusCode, message } = toHttpError(error);
    res.status(statusCode).json({
      success: false,
      status: statusCode,
      error: message,
    });
  }
});

/**
 * @swagger
 * /api/transactions/erc20:
 *   post:
 *     summary: Create an ERC20 token transfer transaction (supports Type 1 and Type 2)
 *     description: Creates an unsigned raw ERC20 transfer transaction. Returns transaction object and unsigned raw hex ready for signing.
 *     tags: [Transactions]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - walletId
 *               - rpcUrl
 *               - tokenAddress
 *               - to
 *               - amount
 *               - transactionType
 *             properties:
 *               walletId:
 *                 type: string
 *                 description: "Wallet ID to create transaction for"
 *               rpcUrl:
 *                 type: string
 *                 example: "https://eth.llamarpc.com"
 *                 description: "RPC endpoint URL (chainId will be automatically fetched)"
 *               tokenAddress:
 *                 type: string
 *                 example: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
 *                 description: "ERC20 token contract address"
 *               to:
 *                 type: string
 *                 example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
 *                 description: "Recipient address"
 *               amount:
 *                 type: string
 *                 example: "1000000"
 *                 description: "Token amount in smallest unit (alias: value is also accepted)"
 *               value:
 *                 type: string
 *                 description: "Alias for amount – token amount in smallest unit"
 *               transactionType:
 *                 type: number
 *                 enum: [0, 1, 2]
 *                 description: "Transaction type: 0 or 1 for legacy (Type 1), 2 for EIP-1559 (Type 2)"
 *               gasData:
 *                 type: object
 *                 description: "Gas data object (optional - will be fetched automatically if not provided). STRICT: Type 1 requires gasPrice only (maxFeePerGas/maxPriorityFeePerGas not allowed). Type 2 requires maxFeePerGas and maxPriorityFeePerGas only (gasPrice not allowed)."
 *                 properties:
 *                   gasPrice:
 *                     type: string
 *                     description: "For Type 1 ONLY: Gas price in wei (required for Type 1, NOT allowed for Type 2)"
 *                   maxFeePerGas:
 *                     type: string
 *                     description: "For Type 2 ONLY: Max fee per gas in wei (required for Type 2, NOT allowed for Type 1)"
 *                   maxPriorityFeePerGas:
 *                     type: string
 *                     description: "For Type 2 ONLY: Max priority fee per gas in wei (required for Type 2, NOT allowed for Type 1)"
 *                   gasLimit:
 *                     type: string
 *                     description: "Gas limit (optional, will be estimated if not provided)"
 *               nonce:
 *                 type: number
 *                 description: "Transaction nonce (optional, will be fetched if not provided)"
 *     responses:
 *       200:
 *         description: Unsigned transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 walletId:
 *                   type: string
 *                 transaction:
 *                   type: object
 *                   description: "Raw unsigned transaction object"
 *                 unsignedRaw:
 *                   type: string
 *                   description: "Unsigned raw transaction in hex format (ready for signing)"
 *                 chainId:
 *                   type: number
 *                 rpcUrl:
 *                   type: string
 *                 tokenAddress:
 *                   type: string
 *                 transactionType:
 *                   type: number
 *                 gasLimit:
 *                   type: string
 *                 nonce:
 *                   type: number
 *       400:
 *         description: Invalid request (validation errors)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Wallet not found
 */
router.post('/erc20', apiKeyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { 
      walletId, 
      rpcUrl,
      tokenAddress, 
      to, 
      amount: amountBody,
      value: valueBody,
      transactionType,
      gasData,
      nonce
    } = req.body;

    // Accept either "amount" or "value" for token amount (ERC20 transfer)
    const amount = amountBody ?? valueBody;

    const organizationId = req.organizationId!;

    // Basic validation
    if (!walletId || !rpcUrl || !tokenAddress || !to || amount === undefined || amount === null || amount === '') {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'walletId, rpcUrl, tokenAddress, to, and amount (or value) are required',
      });
      return;
    }

    // transactionType is optional - will be auto-detected based on chain support if not provided
    if (transactionType !== undefined && transactionType !== null && transactionType !== 0 && transactionType !== 1 && transactionType !== 2) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'transactionType must be 0, 1 (Legacy), or 2 (EIP-1559) if provided',
      });
      return;
    }

    // gasData is optional - will be fetched if not provided, but validated if provided
    if (gasData && typeof gasData !== 'object') {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'gasData must be an object if provided',
      });
      return;
    }

    // Get wallet from KITE Custody Vault
    if (!walletServiceClient) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'KITE Custody Vault not configured',
      });
      return;
    }

    const walletResult = await walletServiceClient.getWallet(walletId, organizationId);
    if (!walletResult.success || !walletResult.data?.data?.address) {
      res.status(404).json({
        success: false,
        status: 404,
        error: 'Wallet not found',
      });
      return;
    }

    const walletAddress = walletResult.data.data.address;

    // Build transaction request (amount may be string from JSON)
    const request: ERC20TransferRequest = {
      walletId,
      rpcUrl,
      tokenAddress,
      to,
      amount: String(amount),
      transactionType: transactionType as 0 | 1 | 2,
      gasData,
      nonce,
    };

    // Create transaction (validation happens inside)
    const result = await transactionService.createERC20Transfer(request, walletAddress);

    res.status(200).json({
      success: true,
      status: 200,
      data: {
        walletId,
        transaction: result.transaction,
        unsignedRaw: result.unsignedRaw,
        chainId: result.chainId,
        rpcUrl: result.rpcUrl,
        tokenAddress: result.tokenAddress,
        transactionType: result.transactionType,
        gasLimit: result.gasLimit,
        nonce: result.nonce,
        ...(result.chainWarning && { chainWarning: result.chainWarning }),
      },
    });
  } catch (error: any) {
    console.error('Error creating ERC20 transfer:', error);
    const { statusCode, message } = toHttpError(error);
    res.status(statusCode).json({
      success: false,
      status: statusCode,
      error: message,
    });
  }
});

/**
 * @swagger
 * /api/transactions/sign:
 *   post:
 *     summary: Sign a transaction using unsignedRaw hex string
 *     description: Accepts unsignedRaw hex string, validates it, and signs it using KITE Custody Vault. The unsignedRaw should be obtained from the transaction creation endpoints (/api/transactions/native or /api/transactions/erc20).
 *     tags: [Transactions]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - walletId
 *               - unsignedRaw
 *             properties:
 *               walletId:
 *                 type: string
 *                 description: "Wallet ID"
 *                 example: "97ab8ed9-bdc1-4364-8e16-7ac95135e1ed"
 *               unsignedRaw:
 *                 type: string
 *                 description: "Unsigned transaction in hex format (0x...). Get this from transaction creation endpoints."
 *                 example: "0x02ee0180830186a0840d2f1eb482d22194de5a4b1360c0d40825099a7b3eafc1e5b9ce1a2a880de0b6b3a764000080c0"
 *               transaction:
 *                 type: object
 *                 description: "Optional transaction object for validation (if provided, will be validated against unsignedRaw)"
 *                 properties:
 *                   type:
 *                     type: number
 *                     enum: [0, 1, 2]
 *                   chainId:
 *                     type: number
 *                   to:
 *                     type: string
 *                   value:
 *                     type: string
 *                   maxFeePerGas:
 *                     type: string
 *                   maxPriorityFeePerGas:
 *                     type: string
 *                   gasPrice:
 *                     type: string
 *                   gasLimit:
 *                     type: string
 *                   nonce:
 *                     type: number
 *     responses:
 *       200:
 *         description: Transaction signed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: number
 *                 data:
 *                   type: object
 *                   properties:
 *                     walletId:
 *                       type: string
 *                     signedHex:
 *                       type: string
 *                       description: "Signed transaction in hex format"
 *                     transactionHash:
 *                       type: string
 *                     signature:
 *                       type: object
 *                       properties:
 *                         r:
 *                           type: string
 *                         s:
 *                           type: string
 *                         v:
 *                           type: number
 *       400:
 *         description: Invalid request or KITE Custody Vault not configured
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: KITE Custody Vault error
 */
router.post('/sign', apiKeyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!walletServiceClient) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'KITE Custody Vault not configured. Set WALLET_SERVICE_URL and WALLET_SERVICE_API_KEY in environment variables.',
      });
      return;
    }

    const organizationId = req.organizationId!;
    const { 
      walletId, 
      unsignedRaw,
      transaction 
    } = req.body;

    // Validation
    if (!walletId || typeof walletId !== 'string') {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'walletId is required and must be a string',
      });
      return;
    }

    if (!unsignedRaw || typeof unsignedRaw !== 'string' || !unsignedRaw.startsWith('0x')) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'unsignedRaw is required and must be a valid hex string starting with 0x',
      });
      return;
    }

    // Get wallet from KITE Custody Vault to verify it exists
    if (!walletServiceClient) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'KITE Custody Vault not configured',
      });
      return;
    }

    const walletResult = await walletServiceClient.getWallet(walletId, organizationId);
    if (!walletResult.success || !walletResult.data?.data?.address) {
      res.status(404).json({
        success: false,
        status: 404,
        error: 'Wallet not found',
      });
      return;
    }

    // Sign the transaction using KITE Custody Vault
    const signResult = await walletServiceClient.signTransaction({
        walletId,
      organizationId: organizationId, // Explicitly pass organizationId
      unsignedRaw,
      transaction,
    });

    if (!signResult.success) {
      res.status(signResult.status || 500).json({
        success: false,
        status: signResult.status || 500,
        error: signResult.error || 'Failed to sign transaction',
      });
      return;
    }

    res.status(200).json({
      success: true,
      status: 200,
      data: {
        walletId,
        unsignedRaw,
        signedHex: signResult.data?.signedHex,
        transactionHash: signResult.data?.transactionHash,
        signature: signResult.data?.signature,
      },
    });
  } catch (error: any) {
    console.error('Error signing transaction:', error);
    const { statusCode, message } = toHttpError(error);
    res.status(statusCode).json({
      success: false,
      status: statusCode,
      error: message,
    });
  }
});

/**
 * @swagger
 * /api/transactions/broadcast:
 *   post:
 *     summary: Broadcast a signed transaction to the blockchain
 *     description: Broadcasts a signed transaction to the specified RPC endpoint. Returns transaction hash and receipt details.
 *     tags: [Transactions]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signedHex
 *               - rpcUrl
 *             properties:
 *               signedHex:
 *                 type: string
 *                 description: "Signed transaction in hex format (0x...)"
 *                 example: "0x02f8..."
 *               rpcUrl:
 *                 type: string
 *                 description: "RPC endpoint URL for broadcasting"
 *                 example: "https://eth.llamarpc.com"
 *     responses:
 *       200:
 *         description: Transaction broadcast successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: number
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionHash:
 *                       type: string
 *                       description: "Transaction hash"
 *                     blockNumber:
 *                       type: number
 *                       description: "Block number (if mined)"
 *                     blockHash:
 *                       type: string
 *                       description: "Block hash (if mined)"
 *                     status:
 *                       type: number
 *                       description: "Transaction status (1 = success, 0 = failed)"
 *                     gasUsed:
 *                       type: string
 *                       description: "Gas used (if mined)"
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Broadcast failed
 */
router.post('/broadcast', apiKeyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { signedHex, rpcUrl } = req.body;

    // Validation
    if (!signedHex || typeof signedHex !== 'string') {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'signedHex is required and must be a string',
      });
      return;
    }

    if (!rpcUrl || typeof rpcUrl !== 'string') {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'rpcUrl is required and must be a string',
      });
      return;
    }

    // Broadcast transaction
    const result = await broadcastService.broadcastTransaction({
      signedHex,
      rpcUrl,
    });

    res.status(200).json({
      success: true,
      status: 200,
      data: {
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        blockHash: result.blockHash,
        status: result.status,
        gasUsed: result.gasUsed?.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error broadcasting transaction:', error);
    const { statusCode, message } = toHttpError(error);
    
    // Include detailed error information
    const errorResponse: any = {
      success: false,
      status: statusCode,
      error: message,
    };
    
    // Add additional error details if available
    if (error.code) {
      errorResponse.errorCode = error.code;
    }
    if (error.data) {
      errorResponse.errorData = error.data;
    }
    if (error.reason) {
      errorResponse.reason = error.reason;
    }
    
    res.status(statusCode).json(errorResponse);
  }
});

export default router;
