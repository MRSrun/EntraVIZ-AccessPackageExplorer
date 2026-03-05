/**
 * Entra Viz - Access Package Explorer
 * Copyright (C) 2026 Marc Schramm
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import axios, { AxiosInstance } from 'axios';
import { acquireGraphToken } from './auth';
import type {
  AccessPackageCatalog,
  AccessPackage,
  AccessPackageResource,
  AccessPackageResourceRoleScope,
  AssignmentPolicy,
  AccessPackageAssignment,
} from '../types';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// ─── In-Memory Cache ──────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; timestamp: number; ttlMs: number; }

class GraphCache {
  private store = new Map<string, CacheEntry<unknown>>();
  set<T>(key: string, data: T, ttlMs = 5 * 60 * 1000): void {
    this.store.set(key, { data, timestamp: Date.now(), ttlMs });
  }
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttlMs) { this.store.delete(key); return null; }
    return entry.data as T;
  }
  clear(): void { this.store.clear(); }
}
export const graphCache = new GraphCache();

// ─── Axios client ─────────────────────────────────────────────────────────────
async function createGraphClient(): Promise<AxiosInstance> {
  const token = await acquireGraphToken();
  return axios.create({
    baseURL: GRAPH_BASE,
    timeout: 30000, // 30s per request
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

// ─── Pagination ───────────────────────────────────────────────────────────────
async function fetchAllPages<T>(client: AxiosInstance, url: string): Promise<T[]> {
  const results: T[] = [];
  let nextLink: string | null = url;
  while (nextLink) {
    const currentLink: string = nextLink;
    const path: string = currentLink.startsWith('http')
      ? currentLink.replace(client.defaults.baseURL ?? '', '')
      : currentLink;
    const response: { data: { value: T[]; '@odata.nextLink'?: string } } =
      await client.get<{ value: T[]; '@odata.nextLink'?: string }>(path);
    results.push(...(response.data.value ?? []));
    nextLink = response.data['@odata.nextLink'] ?? null;
  }
  return results;
}

// ─── Graph Service ────────────────────────────────────────────────────────────
export const graphService = {

  async getCatalogs(): Promise<AccessPackageCatalog[]> {
    const key = 'catalogs';
    const cached = graphCache.get<AccessPackageCatalog[]>(key);
    if (cached) return cached;
    const client = await createGraphClient();
    const data = await fetchAllPages<AccessPackageCatalog>(
      client, '/identityGovernance/entitlementManagement/catalogs?$top=50'
    );
    graphCache.set(key, data);
    return data;
  },

  async getAccessPackages(): Promise<AccessPackage[]> {
    const key = 'accessPackages';
    const cached = graphCache.get<AccessPackage[]>(key);
    if (cached) return cached;
    const client = await createGraphClient();
    // $expand=catalog gives us the nested catalog object with the catalog ID
    const data = await fetchAllPages<AccessPackage>(
      client, '/identityGovernance/entitlementManagement/accessPackages?$expand=catalog&$top=50'
    );
    graphCache.set(key, data);
    return data;
  },

  async getCatalogResources(catalogId: string): Promise<AccessPackageResource[]> {
    const key = `resources:${catalogId}`;
    const cached = graphCache.get<AccessPackageResource[]>(key);
    if (cached) return cached;
    const client = await createGraphClient();
    try {
      const data = await fetchAllPages<AccessPackageResource>(
        client, `/identityGovernance/entitlementManagement/catalogs/${catalogId}/resources?$top=50`
      );
      graphCache.set(key, data);
      return data;
    } catch { return []; }
  },

  // Use simple expand — no nested $expand which causes timeouts
  async getPackageResourceRoles(accessPackageId: string): Promise<AccessPackageResourceRoleScope[]> {
    const key = `roleScopes:${accessPackageId}`;
    const cached = graphCache.get<AccessPackageResourceRoleScope[]>(key);
    if (cached) return cached;
    const client = await createGraphClient();
    try {
      // Simpler query — just expand role and scope without deep nesting
      const data = await fetchAllPages<AccessPackageResourceRoleScope>(
        client,
        `/identityGovernance/entitlementManagement/accessPackages/${accessPackageId}/resourceRoleScopes?$expand=role($expand=resource),scope&$top=50`
      );
      graphCache.set(key, data);
      return data;
    } catch (err) {
      console.warn(`[graphService] resourceRoleScopes failed for ${accessPackageId}:`, err);
      return [];
    }
  },

  async getAssignmentPolicies(): Promise<AssignmentPolicy[]> {
    const key = 'policies:all';
    const cached = graphCache.get<AssignmentPolicy[]>(key);
    if (cached) return cached;
    const client = await createGraphClient();
    try {
      // $expand=accessPackage gives us the accessPackageId via the nested object
      const raw = await fetchAllPages<Record<string, unknown>>(
        client, '/identityGovernance/entitlementManagement/assignmentPolicies?$expand=accessPackage&$top=50'
      );
      // Normalise: inject accessPackageId from nested accessPackage.id if missing
      const data = raw.map(p => ({
        ...p,
        accessPackageId: (p['accessPackageId'] as string | undefined)
          ?? ((p['accessPackage'] as Record<string, unknown> | undefined)?.['id'] as string | undefined)
          ?? '',
      })) as unknown as AssignmentPolicy[];
      graphCache.set(key, data);
      return data;
    } catch (err) {
      console.warn('[graphService] assignmentPolicies failed:', err);
      return [];
    }
  },

  async getAssignments(): Promise<AccessPackageAssignment[]> {
    const key = 'assignments:all';
    const cached = graphCache.get<AccessPackageAssignment[]>(key);
    if (cached) return cached;
    const client = await createGraphClient();
    try {
      const data = await fetchAllPages<AccessPackageAssignment>(
        client, '/identityGovernance/entitlementManagement/assignments?$expand=target&$top=50'
      );
      graphCache.set(key, data, 2 * 60 * 1000);
      return data;
    } catch { return []; }
  },

  // ── Full Data Load ──────────────────────────────────────────────────────────
  async loadAllData() {
    // Step 1: catalogs + packages + policies in parallel
    const [catalogs, accessPackages, policies] = await Promise.all([
      this.getCatalogs(),
      this.getAccessPackages(),
      this.getAssignmentPolicies(),
    ]);

    // Step 2: resources per catalog (parallel, best-effort)
    const resourcesMap = new Map<string, AccessPackageResource[]>();
    const resourcesPerCatalog: Record<string, unknown[]> = {};
    await Promise.all(
      catalogs.map(async (catalog) => {
        const resources = await this.getCatalogResources(catalog.id);
        resourcesMap.set(catalog.id, resources);
        resourcesPerCatalog[`${catalog.displayName} (${catalog.id})`] = resources;
      })
    );

    // Step 3: role scopes per package (parallel, best-effort — each has its own try/catch)
    const rolesMap = new Map<string, AccessPackageResourceRoleScope[]>();
    const rolesPerPackage: Record<string, unknown[]> = {};
    await Promise.all(
      accessPackages.map(async (pkg) => {
        const roles = await this.getPackageResourceRoles(pkg.id);
        rolesMap.set(pkg.id, roles);
        rolesPerPackage[`${pkg.displayName} (${pkg.id})`] = roles;
      })
    );

    // Step 4: resolve AAD group display names for policy specificAllowedTargets
    const allGroupIds = policies.flatMap(p =>
      (p.specificAllowedTargets ?? []).map(t => t.groupId).filter((id): id is string => !!id)
    );
    const groupNamesMap = await this.getGroupsBatch(allGroupIds);

    const rawDump = {
      capturedAt: new Date().toISOString(),
      catalogs: catalogs as unknown[],
      accessPackages: accessPackages as unknown[],
      policies: policies as unknown[],
      resourcesPerCatalog,
      rolesPerPackage,
    };

    return { catalogs, accessPackages, policies, resourcesMap, rolesMap, groupNamesMap, rawDump };
  },

  async getGroupDisplayName(groupId: string): Promise<string> {
    const key = `group:${groupId}`;
    const cached = graphCache.get<string>(key);
    if (cached) return cached;
    const client = await createGraphClient();
    try {
      const resp = await client.get<{ displayName: string }>(`/groups/${groupId}?$select=id,displayName`);
      const name = resp.data.displayName ?? groupId;
      graphCache.set(key, name);
      return name;
    } catch {
      return groupId;
    }
  },

  async getGroupsBatch(groupIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    await Promise.all(
      [...new Set(groupIds)].map(async (id) => {
        const name = await this.getGroupDisplayName(id);
        result.set(id, name);
      })
    );
    return result;
  },

  clearCache(): void { graphCache.clear(); },
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
export const MOCK_DATA = {
  catalogs: [
    { id: 'cat-001', displayName: 'IT Infrastructure', description: 'Core IT systems', catalogType: 'userManaged' as const, state: 'published' as const, isExternallyVisible: false, createdDateTime: '2024-01-15T10:00:00Z', modifiedDateTime: '2024-11-01T08:30:00Z' },
    { id: 'cat-002', displayName: 'Business Applications', description: 'Line of business apps', catalogType: 'userManaged' as const, state: 'published' as const, isExternallyVisible: true, createdDateTime: '2024-02-01T09:00:00Z', modifiedDateTime: '2024-10-15T14:00:00Z' },
    { id: 'cat-003', displayName: 'External Partners', description: 'Partner access', catalogType: 'userManaged' as const, state: 'published' as const, isExternallyVisible: true, createdDateTime: '2024-03-10T11:00:00Z', modifiedDateTime: '2024-09-20T16:00:00Z' },
  ],
  accessPackages: [
    { id: 'pkg-001', displayName: 'Azure DevOps Full Access', catalogId: 'cat-001', description: 'Full DevOps access', isHidden: false, createdDateTime: '2024-01-20T10:00:00Z', modifiedDateTime: '2024-11-05T09:00:00Z' },
    { id: 'pkg-002', displayName: 'M365 Developer License',   catalogId: 'cat-001', description: 'M365 dev license', isHidden: false, createdDateTime: '2024-02-10T10:00:00Z', modifiedDateTime: '2024-10-22T11:00:00Z' },
    { id: 'pkg-003', displayName: 'SAP Finance Module',       catalogId: 'cat-002', description: 'SAP Finance access', isHidden: false, createdDateTime: '2024-02-15T10:00:00Z', modifiedDateTime: '2024-09-30T14:30:00Z' },
    { id: 'pkg-004', displayName: 'CRM Sales Team',           catalogId: 'cat-002', description: 'Dynamics 365 CRM', isHidden: false, createdDateTime: '2024-03-01T10:00:00Z', modifiedDateTime: '2024-11-01T10:00:00Z' },
    { id: 'pkg-005', displayName: 'Partner Portal Access',    catalogId: 'cat-003', description: 'External partner access', isHidden: false, createdDateTime: '2024-03-15T10:00:00Z', modifiedDateTime: '2024-10-10T12:00:00Z' },
    { id: 'pkg-006', displayName: 'SOC Security Tools',       catalogId: 'cat-001', description: 'SOC tooling', isHidden: true, createdDateTime: '2024-04-01T10:00:00Z', modifiedDateTime: '2024-11-10T15:00:00Z' },
  ],
  resources: new Map([
    ['cat-001', [
      { id: 'res-001', displayName: 'sg-devops-contributors', originSystem: 'AadGroup', description: 'DevOps Contributors' },
      { id: 'res-002', displayName: 'sg-devops-admins',       originSystem: 'AadGroup', description: 'DevOps Admins' },
      { id: 'res-003', displayName: 'Azure DevOps App',       originSystem: 'AadApplication', url: 'https://dev.azure.com/contoso' },
      { id: 'res-004', displayName: 'sg-m365-devlicense',     originSystem: 'AadGroup', description: 'M365 dev license group' },
      { id: 'res-005', displayName: 'sg-soc-analysts',        originSystem: 'AadGroup', description: 'SOC Analysts' },
      { id: 'res-006', displayName: 'Microsoft Sentinel',     originSystem: 'AadApplication', url: 'https://portal.azure.com' },
    ]],
    ['cat-002', [
      { id: 'res-007', displayName: 'sg-sap-finance',   originSystem: 'AadGroup', description: 'SAP Finance group' },
      { id: 'res-008', displayName: 'SAP S/4HANA',      originSystem: 'AadApplication', url: 'https://sap.contoso.com' },
      { id: 'res-009', displayName: 'sg-crm-sales',     originSystem: 'AadGroup', description: 'CRM Sales group' },
      { id: 'res-010', displayName: 'Dynamics 365 CRM', originSystem: 'AadApplication', url: 'https://crm.contoso.com' },
      { id: 'res-011', displayName: 'Sales SharePoint', originSystem: 'SharePoint', url: 'https://contoso.sharepoint.com/sites/sales' },
    ]],
    ['cat-003', [
      { id: 'res-012', displayName: 'sg-external-partners', originSystem: 'AadGroup', description: 'External partners' },
      { id: 'res-013', displayName: 'Partner Portal SP',    originSystem: 'SharePoint', url: 'https://contoso.sharepoint.com/sites/partners' },
      { id: 'res-014', displayName: 'Partner Teams',        originSystem: 'AadGroup', description: 'Partners Teams channel' },
    ]],
  ]),
  policies: new Map([
    ['pkg-001', [{ id: 'pol-001', accessPackageId: 'pkg-001', displayName: 'IT Approval Required', description: 'IT manager approval', durationInDays: 365, createdDateTime: '2024-01-20T10:00:00Z', modifiedDateTime: '2024-11-05T09:00:00Z', requestApprovalSettings: { isApprovalRequiredForAdd: true, isRequestorJustificationRequired: true } }]],
    ['pkg-002', [{ id: 'pol-002', accessPackageId: 'pkg-002', displayName: 'Self-Service',         description: 'Self-service', durationInDays: 180, createdDateTime: '2024-02-10T10:00:00Z', modifiedDateTime: '2024-10-22T11:00:00Z', requestApprovalSettings: { isApprovalRequiredForAdd: false } }]],
    ['pkg-003', [{ id: 'pol-003', accessPackageId: 'pkg-003', displayName: 'Finance Director',     description: 'Finance+CISO approval', durationInDays: 90, createdDateTime: '2024-02-15T10:00:00Z', modifiedDateTime: '2024-09-30T14:30:00Z', requestApprovalSettings: { isApprovalRequiredForAdd: true } }]],
    ['pkg-004', [{ id: 'pol-004', accessPackageId: 'pkg-004', displayName: 'Sales Manager',        description: 'Sales Manager approval', durationInDays: 365, createdDateTime: '2024-03-01T10:00:00Z', modifiedDateTime: '2024-11-01T10:00:00Z', requestApprovalSettings: { isApprovalRequiredForAdd: true } }]],
    ['pkg-005', [{ id: 'pol-005', accessPackageId: 'pkg-005', displayName: 'Partner Self-Service', description: 'External self-service', durationInDays: 30, createdDateTime: '2024-03-15T10:00:00Z', modifiedDateTime: '2024-10-10T12:00:00Z', requestApprovalSettings: { isApprovalRequiredForAdd: false } }]],
    ['pkg-006', [{ id: 'pol-006', accessPackageId: 'pkg-006', displayName: 'CISO Approval',        description: 'CISO required', durationInDays: 30, createdDateTime: '2024-04-01T10:00:00Z', modifiedDateTime: '2024-11-10T15:00:00Z', requestApprovalSettings: { isApprovalRequiredForAdd: true } }]],
  ]),
};
