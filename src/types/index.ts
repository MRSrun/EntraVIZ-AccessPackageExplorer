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

// ============================================================
// Entra ID / Graph API Types
// ============================================================

export interface AccessPackageCatalog {
  id: string;
  displayName: string;
  description?: string;
  catalogType: 'userManaged' | 'serviceDefault';
  state: 'published' | 'unpublished';
  isExternallyVisible: boolean;
  createdDateTime: string;
  modifiedDateTime: string;
}

export interface AccessPackage {
  id: string;
  displayName: string;
  description?: string;
  isHidden: boolean;
  isRoleScopesVisible?: boolean;
  createdDateTime: string;
  modifiedDateTime: string;
  // Real Graph API returns catalog as nested object, not catalogId at top level
  catalog?: AccessPackageCatalog;
  catalogId?: string; // present in mock data / some API versions
}

export interface AccessPackageResource {
  id: string;
  displayName: string;
  description?: string;
  resourceType?: string;   // present in some API versions / mock
  originSystem?: string;   // real API: "AadGroup" | "AadApplication" | "SharePoint"
  originId?: string;       // real API: the AAD object ID
  url?: string;
  addedDateTime?: string;
  createdDateTime?: string;
  attributes?: AccessPackageResourceAttribute[];
}

export interface AccessPackageResourceAttribute {
  name: string;
  isEditable: boolean;
  isPersistedOnAssignmentEnabled: boolean;
  source?: { odataType?: string };
  destination?: { odataType?: string };
}

export interface AccessPackageResourceRole {
  id: string;
  displayName?: string;
  description?: string;
  originId?: string;
  originSystem?: string;
  resource?: AccessPackageResource;
}

// The resourceRoleScopes endpoint returns this wrapper shape:
// GET /accessPackages/{id}/resourceRoleScopes?$expand=role($expand=resource),scope
export interface AccessPackageResourceRoleScope {
  id: string;
  createdDateTime?: string;
  role?: AccessPackageResourceRole;         // ← resource is nested here
  scope?: AccessPackageResourceScope;
}

export interface AccessPackageResourceScope {
  id: string;
  displayName: string;
  description?: string;
  url: string;
  isRootScope: boolean;
  originId: string;
  originSystem: string;
  resource?: AccessPackageResource;
}

export interface AssignmentPolicy {
  id: string;
  accessPackageId: string;
  displayName: string;
  description?: string;
  allowedTargetScope?: string; // real API: "specificDirectoryUsers" | "allMemberUsers" etc.
  // Old API fields
  canExtend?: boolean;
  durationInDays?: number;
  expirationDateTime?: string;
  // Real API expiration shape
  expiration?: {
    endDateTime?: string | null;
    duration?: string;   // ISO 8601 e.g. "PT8H", "P30D"
    type?: string;       // "afterDuration" | "afterDateTime" | "noExpiration"
  };
  // Real API: specific users/groups allowed to request
  specificAllowedTargets?: SpecificAllowedTarget[];
  requestorSettings?: RequestorSettings;
  requestApprovalSettings?: RequestApprovalSettings;
  createdDateTime: string;
  modifiedDateTime: string;
}

// Real API shape for specificAllowedTargets entries
export interface SpecificAllowedTarget {
  '@odata.type'?: string;    // "#microsoft.graph.groupMembers" | "#microsoft.graph.singleUser" etc.
  groupId?: string;          // for groupMembers
  id?: string;               // for singleUser
  description?: string;      // display name / description
  isBackup?: boolean;
}

export interface RequestorSettings {
  scopeType?: string;
  acceptRequests?: boolean;
  allowedRequestors?: AllowedRequestor[];
  enableTargetsToSelfAddAccess?: boolean;
}

export interface AllowedRequestor {
  odataType?: string;
  isBackup?: boolean;
  id?: string;
  description?: string;
}

export interface RequestApprovalSettings {
  isApprovalRequired?: boolean;           // old API
  isApprovalRequiredForAdd?: boolean;     // real API v1.0
  isApprovalRequiredForUpdate?: boolean;  // real API v1.0
  isApprovalRequiredForExtension?: boolean;
  isRequestorJustificationRequired?: boolean;
  approvalMode?: string;
  stages?: ApprovalStage[];
  approvalStages?: ApprovalStage[];
}

export interface ApprovalStage {
  approvalStageTimeOutInDays: number;
  isApproverJustificationRequired: boolean;
  isEscalationEnabled: boolean;
  escalationTimeInMinutes?: number;
  primaryApprovers?: AllowedRequestor[];
  escalationApprovers?: AllowedRequestor[];
}

export interface AccessPackageAssignment {
  id: string;
  targetId: string;
  assignmentPolicyId: string;
  accessPackageId: string;
  state: 'delivered' | 'delivering' | 'deliveryFailed' | 'expired' | string;
  status: string;
  createdDateTime: string;
  expiredDateTime?: string;
  target?: AssignmentTarget;
}

export interface AssignmentTarget {
  id: string;
  displayName?: string;
  email?: string;
  objectId?: string;
  subjectType?: string;
}

// ============================================================
// Graph Visualization Types
// ============================================================

export type NodeType = 'catalog' | 'accessPackage' | 'group' | 'application' | 'sharepoint' | 'policy' | 'user' | 'requestorGroup';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  data: Record<string, unknown>;
  riskScore?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: 'contains' | 'grants' | 'assigned_via' | 'member_of' | 'governed_by' | 'requests_from';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ============================================================
// UI State Types
// ============================================================

export type ViewMode = 'graph' | 'packages' | 'resources' | 'policies' | 'debug';

export interface FilterState {
  catalogId: string | null;
  resourceType: string | null;
  searchQuery: string;
  visibleEdgeTypes: GraphEdge['type'][];
  focusNodeId: string | null;  // when set, show only this node + all connected nodes
}

export interface AppState {
  catalogs: AccessPackageCatalog[];
  accessPackages: AccessPackage[];
  resources: Map<string, AccessPackageResource[]>;
  policies: Map<string, AssignmentPolicy[]>;
  assignments: AccessPackageAssignment[];
  graphData: GraphData;
  loading: boolean;
  error: string | null;
  selectedNode: GraphNode | null;
  viewMode: ViewMode;
  filters: FilterState;
  lastFetched: Date | null;
}

// ============================================================
// MSAL / Auth Types
// ============================================================

export interface AuthConfig {
  clientId: string;
  tenantId: string;
  redirectUri: string;
}
