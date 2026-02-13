import { Router, Request, Response } from 'express';
import { OrganizationService } from '../services/organization.service';
import { adminAuth, AuthRequest } from '../middleware/auth.middleware';
import { toHttpError } from '../utils/errorHandler';

const router = Router();
const orgService = new OrganizationService();

/**
 * @swagger
 * /api/organizations:
 *   post:
 *     summary: Create a new organization (Admin only)
 *     tags: [Organizations]
 *     security:
 *       - basicAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "My Organization"
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 organizationId:
 *                   type: string
 *                 name:
 *                   type: string
 *                 apiKey:
 *                   type: string
 *                   description: API key for API access (use in X-API-Key header)
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post('/', adminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({
        success: false,
        status: 400,
        error: 'Organization name is required',
      });
      return;
    }

    const organization = await orgService.createOrganization(name);

    res.status(201).json({
      success: true,
      status: 201,
      data: organization,
      // API key is returned - use it in X-API-Key header for authentication
    });
  } catch (error: any) {
    console.error('Error creating organization:', error);
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
 * /api/organizations/{organizationId}:
 *   get:
 *     summary: Get organization details (Admin only)
 *     tags: [Organizations]
 *     security:
 *       - basicAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *     responses:
 *       200:
 *         description: Organization details
 *       404:
 *         description: Organization not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:organizationId', adminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const organization = await orgService.getOrganization(organizationId);

    if (!organization) {
      res.status(404).json({
        success: false,
        status: 404,
        error: 'Organization not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      status: 200,
      data: organization,
    });
  } catch (error: any) {
    console.error('Error fetching organization:', error);
    const { statusCode, message } = toHttpError(error);
    res.status(statusCode).json({
      success: false,
      status: statusCode,
      error: message,
    });
  }
});

export default router;
