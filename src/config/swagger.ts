import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'KITE Custody Orchestrator API',
      version: '1.0.0',
      description: 'KITE Custody Orchestrator – client-facing API for the KITE custody solution. Handles organizations, wallets, users, transaction creation, signing (via KITE Custody Vault), and broadcasting. Standalone deployable.',
      contact: {
        name: 'KITE Support',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key obtained from organization creation',
        },
        basicAuth: {
          type: 'http',
          scheme: 'basic',
          description: 'Admin credentials (email:password)',
        },
      },
    },
    tags: [
      {
        name: 'Organizations',
        description: 'Organization management endpoints (Admin only)',
      },
      {
        name: 'Wallets',
        description: 'Wallet management (calls KITE Custody Vault internally)',
      },
      {
        name: 'Users',
        description: 'User management (calls KITE Custody Vault internally)',
      },
      {
        name: 'Transactions',
        description: 'Transaction creation, signing, and broadcasting (Type 1 and Type 2)',
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/index.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
