import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { swaggerSpec } from './config/swagger';
import { toHttpError, DEFAULT_SERVER_MESSAGE } from './utils/errorHandler';
import { PostgresClient } from './storage/postgres.client';
import { checkVaultConnectivity } from './services/signing-client.service';
import organizationRoutes from './routes/organization.routes';
import transactionRoutes from './routes/transaction.routes';
import walletRoutes from './routes/wallet.routes';
import userRoutes from './routes/user.routes';

const app: Express = express();
const postgres = new PostgresClient();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'KITE Custody Orchestrator API',
}));

// Health check
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 service:
 *                   type: string
 *                   example: wallet-management
 */
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    status: 200,
    data: {
      status: 'ok',
      service: 'kite-custody-orchestrator',
    },
  });
});

// API Routes
app.use('/api/organizations', organizationRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/wallets', walletRoutes); // Wallet endpoints
app.use('/api/users', userRoutes); // User endpoints

// Error handling middleware — never throws so the process keeps running
app.use((err: any, req: Request, res: Response, next: any) => {
  try {
    console.error('[Orchestrator] Request error:', err?.message || err);
    if (res.headersSent) return;
    const { statusCode, message } = toHttpError(err);
    res.status(statusCode).json({
      success: false,
      status: statusCode,
      error: message || DEFAULT_SERVER_MESSAGE,
    });
  } catch (e) {
    console.error('[Orchestrator] Error middleware threw:', e);
    if (!res.headersSent) {
      try {
        res.status(500).json({ success: false, status: 500, error: DEFAULT_SERVER_MESSAGE });
      } catch (_) {}
    }
  }
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize PostgreSQL tables
    console.log('Initializing database...');
    await postgres.initialize();
    console.log('✅ PostgreSQL initialized');

    // Fail fast if KITE Custody Vault is not up (short timeout; deploy Vault first)
    if (config.walletService) {
      console.log('Checking KITE Custody Vault connectivity...');
      await checkVaultConnectivity(5000);
      console.log('✅ KITE Custody Vault is reachable');
    }

    // Start server
    const port = parseInt(config.port) || 3000;
    app.listen(port, () => {
      console.log(`✅ KITE Custody Orchestrator running on port ${port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      if (config.walletService) {
        console.log(`KITE Custody Vault URL: ${config.walletService.url}`);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Keep process running on errors — log and continue
process.on('uncaughtException', (err) => {
  console.error('[Orchestrator] uncaughtException (process kept running):', err?.message || err);
  if (err?.stack) console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Orchestrator] unhandledRejection (process kept running):', reason);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  try {
    await postgres.close();
  } catch (e) {
    console.error('Error during postgres close:', e);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  try {
    await postgres.close();
  } catch (e) {
    console.error('Error during postgres close:', e);
  }
  process.exit(0);
});

startServer().catch((err) => {
  console.error('[Orchestrator] startServer failed:', err);
  process.exit(1);
});
