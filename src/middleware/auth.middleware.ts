import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { PostgresClient } from '../storage/postgres.client';

export interface AuthRequest extends Request {
  organizationId?: string;
  isAdmin?: boolean;
  headers: any;
}

/**
 * Admin authentication middleware
 * Validates admin email/password from .env
 */
export const adminAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.status(401).json({
        success: false,
        status: 401,
        error: 'Missing or invalid authorization header',
      });
      return;
    }

    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const [email, password] = credentials.split(':');

    if (email !== config.adminEmail || password !== config.adminPassword) {
      res.status(401).json({
        success: false,
        status: 401,
        error: 'Invalid admin credentials',
      });
      return;
    }

    req.isAdmin = true;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      status: 401,
      error: 'Authentication failed',
    });
  }
};

/**
 * Organization API key authentication middleware
 * Validates API key and sets organizationId on request
 */
export const apiKeyAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check both header formats (case-insensitive)
    const apiKey = (req.headers['x-api-key'] || req.headers['X-API-Key']) as string;
    
    if (!apiKey) {
      res.status(401).json({
        success: false,
        status: 401,
        error: 'Missing API key. Provide it in X-API-Key header',
      });
      return;
    }

    const postgres = new PostgresClient();
    const organization = await postgres.getOrganizationByApiKey(apiKey);

    if (!organization) {
      res.status(401).json({
        success: false,
        status: 401,
        error: 'Invalid API key',
      });
      return;
    }

    req.organizationId = organization.organization_id;
    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      status: 401,
      error: 'Invalid API key',
    });
    return;
  }
};
