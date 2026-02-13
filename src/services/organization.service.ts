import { PostgresClient } from '../storage/postgres.client';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export class OrganizationService {
  private postgres: PostgresClient;

  constructor() {
    this.postgres = new PostgresClient();
  }

  /**
   * Create a new organization
   * Generates an API key for the organization
   */
  async createOrganization(name: string): Promise<{
    organizationId: string;
    name: string;
    apiKey: string;
    createdAt: string;
  }> {
    const organizationId = uuidv4();
    const apiKey = this.generateApiKey();

    await this.postgres.storeOrganization(organizationId, name, apiKey);

    return {
      organizationId,
      name,
      apiKey,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Get organization by ID
   */
  async getOrganization(organizationId: string): Promise<{
    organizationId: string;
    name: string;
    apiKey?: string; // Only return in admin context
    createdAt: string;
  } | null> {
    const org = await this.postgres.getOrganization(organizationId);
    
    if (!org) {
      return null;
    }

    return {
      organizationId: org.organization_id,
      name: org.name,
      apiKey: org.api_key,
      createdAt: org.created_at,
    };
  }

  /**
   * Generate a secure API key
   */
  private generateApiKey(): string {
    // Generate a 32-byte random key and encode as hex
    return `kite_${crypto.randomBytes(32).toString('hex')}`;
  }

  /**
   * Validate API key and get organization
   * Uses PostgreSQL index for efficient lookup
   */
  async validateApiKey(apiKey: string): Promise<{
    organizationId: string;
    name: string;
  } | null> {
    const org = await this.postgres.getOrganizationByApiKey(apiKey);
    if (!org) {
      return null;
    }
    return {
      organizationId: org.organization_id,
      name: org.name,
    };
  }

  /**
   * Delete organization
   */
  async deleteOrganization(organizationId: string): Promise<void> {
    await this.postgres.deleteOrganization(organizationId);
  }

  /**
   * List all organizations
   */
  async listOrganizations(): Promise<any[]> {
    return await this.postgres.listOrganizations();
  }
}
