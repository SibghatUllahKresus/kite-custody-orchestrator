import { Router, Response } from 'express';
import { apiKeyAuth, AuthRequest } from '../middleware/auth.middleware';
import { WalletServiceClient } from '../services/signing-client.service';
import { toHttpError } from '../utils/errorHandler';

const router = Router();
let walletServiceClient: WalletServiceClient | null = null;

// Initialize KITE Custody Vault client if configured
try {
  walletServiceClient = new WalletServiceClient();
} catch (error) {
  console.warn('KITE Custody Vault not configured. Wallet endpoints will not be available.');
}

/**
 * @swagger
 * /api/wallets:
 *   post:
 *     summary: Create user and wallet for the organization
 *     description: Creates a user (if doesn't exist) and their wallet in the organization. This endpoint calls KITE Custody Vault internally.
 *     tags: [Wallets]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userEmail
 *             properties:
 *               userEmail:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *                 description: "User email (required). User will be created if doesn't exist, then wallet will be created for the user."
 *     responses:
 *       201:
 *         description: User and wallet created successfully
 *       400:
 *         description: Invalid request or KITE Custody Vault not configured
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: User already has a wallet in this organization
 */
router.post('/', apiKeyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!walletServiceClient) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'KITE Custody Vault not configured. Set WALLET_SERVICE_URL and WALLET_SERVICE_API_KEY in environment variables.',
      });
      return;
    }

    const { userEmail } = req.body;
    const organizationId = req.organizationId!;

    if (!userEmail || typeof userEmail !== 'string' || !userEmail.includes('@')) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'userEmail is required and must be a valid email address',
      });
      return;
    }

    const result = await walletServiceClient.createWallet(organizationId, userEmail);

    res.status(201).json({
      success: true,
      status: 201,
      data: result.data || result,
    });
  } catch (error: any) {
    console.error('Error creating wallet:', error);
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
 * /api/wallets:
 *   get:
 *     summary: List all wallets for the organization
 *     description: Returns all wallets belonging to the organization. This endpoint calls KITE Custody Vault internally.
 *     tags: [Wallets]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of wallets
 *       401:
 *         description: Unauthorized
 */
router.get('/', apiKeyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!walletServiceClient) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'KITE Custody Vault not configured',
      });
      return;
    }

    const organizationId = req.organizationId!;
    const result = await walletServiceClient.listWallets(organizationId);

    res.status(200).json({
      success: true,
      status: 200,
      data: result.data || result,
    });
  } catch (error: any) {
    console.error('Error listing wallets:', error);
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
 * /api/wallets/{walletId}:
 *   get:
 *     summary: Get wallet details
 *     description: Returns wallet details for the specified wallet ID. This endpoint calls KITE Custody Vault internally.
 *     tags: [Wallets]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: walletId
 *         required: true
 *         schema:
 *           type: string
 *         description: Wallet ID
 *     responses:
 *       200:
 *         description: Wallet details
 *       404:
 *         description: Wallet not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:walletId', apiKeyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!walletServiceClient) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'KITE Custody Vault not configured',
      });
      return;
    }

    const { walletId } = req.params;
    const organizationId = req.organizationId!;

    if (!walletId) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'walletId is required',
      });
      return;
    }

    const result = await walletServiceClient.getWallet(walletId, organizationId);

    if (!result.success || !result.data) {
      res.status(404).json({
        success: false,
        status: 404,
        error: 'Wallet not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      status: 200,
      data: result.data.data || result.data,
    });
  } catch (error: any) {
    console.error('Error fetching wallet:', error);
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
 * /api/wallets/users/{email}/wallets:
 *   get:
 *     summary: Get wallets for a specific user
 *     description: Returns all wallets belonging to a user in the organization. This endpoint calls KITE Custody Vault internally.
 *     tags: [Wallets]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *         description: User email
 *     responses:
 *       200:
 *         description: User wallets retrieved successfully
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.get('/users/:email/wallets', apiKeyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!walletServiceClient) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'KITE Custody Vault not configured',
      });
      return;
    }

    const { email } = req.params;
    const organizationId = req.organizationId!;

    if (!email) {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'email is required',
      });
      return;
    }

    const result = await walletServiceClient.getWalletsByUser(email, organizationId);

    res.status(200).json({
      success: true,
      status: 200,
      data: result.data || result,
    });
  } catch (error: any) {
    console.error('Error fetching user wallets:', error);
    const { statusCode, message } = toHttpError(error);
    res.status(statusCode).json({
      success: false,
      status: statusCode,
      error: message,
    });
  }
});

export default router;
