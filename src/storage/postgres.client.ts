import { Pool, PoolClient } from 'pg';
import { config } from '../config';

export class PostgresClient {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: config.postgres.host,
      port: parseInt(config.postgres.port),
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: {
        rejectUnauthorized: false, // RDS uses self-signed certificates, allow connection
      },
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }

  /**
   * Retry connection with exponential backoff
   */
  private async retryConnection<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const isConnectionError = 
          error.message?.includes('Connection terminated') ||
          error.message?.includes('timeout') ||
          error.message?.includes('ECONNREFUSED') ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNREFUSED';

        if (isConnectionError && attempt < maxRetries) {
          const waitTime = delayMs * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`PostgreSQL connection failed (attempt ${attempt}/${maxRetries}), retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw error;
      }
    }
    
    throw lastError || new Error('Connection failed after retries');
  }

  /**
   * Initialize database tables (organizations table only)
   */
  async initialize(): Promise<void> {
    return this.retryConnection(async () => {
      const client = await this.pool.connect();
      try {
        // Create organizations table
        await client.query(`
          CREATE TABLE IF NOT EXISTS organizations (
            organization_id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            api_key VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create index on api_key for efficient lookups
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_organizations_api_key ON organizations(api_key)
        `);

        // Create index on organization_id
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_organizations_id ON organizations(organization_id)
        `);

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });
  }

  /**
   * Store organization in PostgreSQL
   */
  async storeOrganization(organizationId: string, name: string, apiKey: string): Promise<void> {
    return this.retryConnection(async () => {
      const client = await this.pool.connect();
      try {
        await client.query(
          `INSERT INTO organizations (organization_id, name, api_key, created_at, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (organization_id) 
           DO UPDATE SET name = $2, api_key = $3, updated_at = CURRENT_TIMESTAMP`,
          [organizationId, name, apiKey]
        );
      } finally {
        client.release();
      }
    });
  }

  /**
   * Get organization by ID
   */
  async getOrganization(organizationId: string): Promise<any | null> {
    return this.retryConnection(async () => {
      const client = await this.pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM organizations WHERE organization_id = $1',
          [organizationId]
        );
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    });
  }

  /**
   * Get organization by API key (efficient lookup using index)
   */
  async getOrganizationByApiKey(apiKey: string): Promise<any | null> {
    return this.retryConnection(async () => {
      const client = await this.pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM organizations WHERE api_key = $1',
          [apiKey]
        );
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    });
  }

  /**
   * Delete organization
   */
  async deleteOrganization(organizationId: string): Promise<void> {
    return this.retryConnection(async () => {
      const client = await this.pool.connect();
      try {
        await client.query(
          'DELETE FROM organizations WHERE organization_id = $1',
          [organizationId]
        );
      } finally {
        client.release();
      }
    });
  }

  /**
   * List all organizations
   */
  async listOrganizations(): Promise<any[]> {
    return this.retryConnection(async () => {
      const client = await this.pool.connect();
      try {
        const result = await client.query(
          'SELECT organization_id, name, created_at FROM organizations ORDER BY created_at DESC'
        );
        return result.rows;
      } finally {
        client.release();
      }
    });
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
