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
  console.warn('KITE Custody Vault not configured. User endpoints will not be available.');
}

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List users in organization
 *     description: Returns all users belonging to the organization. This endpoint calls KITE Custody Vault internally.
 *     tags: [Users]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of users
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
    const result = await walletServiceClient.listUsers(organizationId);

    res.status(200).json({
      success: true,
      status: 200,
      data: result.data || result,
    });
  } catch (error: any) {
    console.error('Error listing users:', error);
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
 * /api/users/{email}:
 *   get:
 *     summary: Get user details
 *     description: Returns user details for the specified email. This endpoint calls KITE Custody Vault internally.
 *     tags: [Users]
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
 *         description: User details
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:email', apiKeyAuth, async (req: AuthRequest, res: Response) => {
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

    const result = await walletServiceClient.getUser(email, organizationId);

    if (!result.success || !result.data) {
      res.status(404).json({
        success: false,
        status: 404,
        error: 'User not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      status: 200,
      data: result.data.data || result.data,
    });
  } catch (error: any) {
    console.error('Error fetching user:', error);
    const { statusCode, message } = toHttpError(error);
    res.status(statusCode).json({
      success: false,
      status: statusCode,
      error: message,
    });
  }
});

export default router;
