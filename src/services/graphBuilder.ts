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

import type {
  GraphData,
  GraphNode,
  GraphEdge,
  AccessPackageCatalog,
  AccessPackage,
  AccessPackageResource,
  AccessPackageResourceRoleScope,
  AssignmentPolicy,
  SpecificAllowedTarget,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Real API returns catalog nested as pkg.catalog.id — mock uses pkg.catalogId */
function getCatalogId(pkg: AccessPackage): string {
  if (pkg.catalogId) return pkg.catalogId;
  return (pkg as unknown as { catalog?: { id?: string } }).catalog?.id ?? '';
}

function mapOriginSystem(s: string | undefined): GraphNode['type'] {
  switch (s) {
    case 'AadGroup':       return 'group';
    case 'AadApplication': return 'application';
    case 'SharePoint':     return 'sharepoint';
    default:               return 'group';
  }
}

function parseIsoDurationHours(iso: string): number {
  const h = parseInt(iso.match(/(\d+)H/)?.[1] ?? '0');
  const d = parseInt(iso.match(/(\d+)D/)?.[1] ?? '0');
  return d * 24 + h;
}

function computeRisk(pkg: AccessPackage, resourceCount: number, policy: AssignmentPolicy | undefined): number {
  let s = 0;
  if (resourceCount > 5) s += 30; else if (resourceCount > 2) s += 15;
  if (pkg.isHidden) s += 20;
  const ap = policy?.requestApprovalSettings;
  if (ap?.isApprovalRequiredForAdd === false || ap?.isApprovalRequired === false) s += 25;
  const dur = policy?.expiration?.duration;
  if (dur && parseIsoDurationHours(dur) < 24) s += 10;
  if (policy?.durationInDays && policy.durationInDays < 30) s += 10;
  return Math.min(s, 100);
}

// ─── Graph Builder ────────────────────────────────────────────────────────────
export function buildGraphData(
  catalogs: AccessPackageCatalog[],
  accessPackages: AccessPackage[],
  resourcesMap: Map<string, AccessPackageResource[]>,
  policiesMap: Map<string, AssignmentPolicy[]>,
  rolesMap: Map<string, AccessPackageResourceRoleScope[]>,
  groupNamesMap: Map<string, string> = new Map()
): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();

  function addNode(node: GraphNode) {
    if (!seenNodes.has(node.id)) { seenNodes.add(node.id); nodes.push(node); }
  }
  function addEdge(edge: GraphEdge) {
    if (!seenEdges.has(edge.id)) { seenEdges.add(edge.id); edges.push(edge); }
  }

  const useRolesMap = rolesMap.size > 0;

  // ── 1. Catalog nodes ───────────────────────────────────────────────────────
  for (const catalog of catalogs) {
    addNode({ id: `catalog:${catalog.id}`, type: 'catalog', label: catalog.displayName, data: catalog as unknown as Record<string, unknown> });

    // Catalog-level resource nodes (orphan until connected by package edge)
    for (const res of resourcesMap.get(catalog.id) ?? []) {
      addNode({
        id: `resource:${res.id}`,
        type: mapOriginSystem(res.originSystem ?? res.resourceType),
        label: res.displayName,
        data: { ...res, catalogId: catalog.id, catalogName: catalog.displayName },
      });
    }
  }

  // ── 2. Access Package nodes + all their edges ─────────────────────────────
  for (const pkg of accessPackages) {
    const catalogId = getCatalogId(pkg);
    const policies  = policiesMap.get(pkg.id) ?? [];

    // Resolve resources for this package
    let pkgResources: AccessPackageResource[] = [];
    if (useRolesMap) {
      const seen = new Set<string>();
      for (const rs of rolesMap.get(pkg.id) ?? []) {
        const res = rs.role?.resource;
        if (res?.id && !seen.has(res.id)) { seen.add(res.id); pkgResources.push(res); }
      }
    } else {
      pkgResources = resourcesMap.get(catalogId) ?? [];
    }

    const riskScore = computeRisk(pkg, pkgResources.length, policies[0]);

    // Package node
    addNode({
      id: `pkg:${pkg.id}`,
      type: 'accessPackage',
      label: pkg.displayName,
      data: { ...pkg, catalogId, resourceCount: pkgResources.length, policyCount: policies.length },
      riskScore,
    });

    // Catalog → Package
    if (catalogId) {
      addEdge({ id: `e:cat-pkg:${pkg.id}`, source: `catalog:${catalogId}`, target: `pkg:${pkg.id}`, label: 'contains', type: 'contains' });
    }

    // Package → Resources
    for (const res of pkgResources) {
      const resId = `resource:${res.id}`;
      addNode({
        id: resId,
        type: mapOriginSystem(res.originSystem ?? res.resourceType),
        label: res.displayName,
        data: res as unknown as Record<string, unknown>,
      });
      addEdge({ id: `e:pkg-res:${pkg.id}-${res.id}`, source: `pkg:${pkg.id}`, target: resId, label: 'grants access to', type: 'grants' });
    }

    // ── Policies ─────────────────────────────────────────────────────────────
    for (const policy of policies) {
      const polId = `policy:${policy.id}`;
      const allowedTargetScope: string = (policy as unknown as { allowedTargetScope?: string }).allowedTargetScope ?? '';
      const targets: SpecificAllowedTarget[] = (policy as unknown as { specificAllowedTargets?: SpecificAllowedTarget[] }).specificAllowedTargets ?? [];

      const SCOPE_MAP: Record<string, { label: string; icon: string; short: string }> = {
        allMemberUsers:                          { label: 'All Members (excl. Guests)',  icon: '👥', short: 'All Members' },
        allDirectoryUsers:                       { label: 'All Users (incl. Guests)',    icon: '🌐', short: 'All Users incl. Guests' },
        allUsersIncludingGuests:                 { label: 'All Users (incl. Guests)',    icon: '🌐', short: 'All Users incl. Guests' },
        allDirectoryServicePrincipals:           { label: 'All Service Principals',      icon: '⚙️', short: 'All Service Principals' },
        allExternalUsers:                        { label: 'All External Users',           icon: '🔗', short: 'All External Users' },
        allConfiguredConnectedOrganizationUsers: { label: 'All Connected Org Users',     icon: '🤝', short: 'All Connected Orgs' },
        specificDirectoryUsers:                  { label: 'Specific Users/Groups',       icon: '🎯', short: 'Specific Users/Groups' },
      };

      // Label the policy node with scope hint so it's readable at a glance
      const scopeInfo = SCOPE_MAP[allowedTargetScope];
      const policyLabel = scopeInfo
        ? `${policy.displayName}
[${scopeInfo.short}]`
        : policy.displayName;

      addNode({ id: polId, type: 'policy', label: policyLabel, data: { ...policy as unknown as Record<string, unknown>, allowedTargetScope } });

      // Package → Policy
      addEdge({ id: `e:pkg-pol:${pkg.id}-${policy.id}`, source: `pkg:${pkg.id}`, target: polId, label: 'governed by', type: 'governed_by' });

      // ── Requestor targets ─────────────────────────────────────────────────
      if (targets.length > 0) {
        // Case A: specific groups or users listed
        for (const target of targets) {
          const odataType = target['@odata.type'] ?? '';
          if (target.groupId && (odataType.includes('groupMembers') || odataType.includes('Group'))) {
            const nodeId = `reqgroup:${target.groupId}`;
            const label  = groupNamesMap.get(target.groupId) ?? target.description ?? target.groupId;
            addNode({ id: nodeId, type: 'requestorGroup', label, data: { groupId: target.groupId, displayName: label, role: 'Requestor Group', odataType } });
            addEdge({ id: `e:pol-rg:${policy.id}-${target.groupId}`, source: polId, target: nodeId, label: 'requestable by', type: 'requests_from' });
          } else if (target.id && (odataType.includes('singleUser') || odataType.includes('User'))) {
            const nodeId = `user:${target.id}`;
            const label  = target.description ?? target.id;
            addNode({ id: nodeId, type: 'user', label, data: { id: target.id, displayName: label, role: 'Requestor User', odataType } });
            addEdge({ id: `e:pol-u:${policy.id}-${target.id}`, source: polId, target: nodeId, label: 'requestable by', type: 'requests_from' });
          }
        }
      } else if (allowedTargetScope && allowedTargetScope !== 'specificDirectoryUsers' && allowedTargetScope !== 'notSpecified') {
        // Case B: broad scope — synthetic shared node (e.g. "🌐 All Users incl. Guests")
        // Shared node ID per scope so multiple policies with same scope share one node
        const info = SCOPE_MAP[allowedTargetScope] ?? { label: allowedTargetScope, icon: '👤', short: allowedTargetScope };
        const nodeId = `scope:${allowedTargetScope}`;
        addNode({
          id: nodeId,
          type: 'requestorGroup',
          label: `${info.icon} ${info.label}`,
          data: { scope: allowedTargetScope, displayName: info.label, role: 'Broad Scope' },
        });
        addEdge({ id: `e:pol-scope:${policy.id}-${allowedTargetScope}`, source: polId, target: nodeId, label: 'requestable by', type: 'requests_from' });
      }
    }
  }

  return { nodes, edges };
}

// ─── Filter ───────────────────────────────────────────────────────────────────
export function filterGraphData(
  graphData: GraphData,
  catalogId: string | null,
  resourceType: string | null,
  searchQuery: string,
  visibleEdgeTypes: GraphEdge['type'][],
  focusNodeId: string | null = null,
): GraphData {
  let filteredNodes = [...graphData.nodes];

  // focusNodeId: smart focus based on node type
  if (focusNodeId) {
    const keep = new Set<string>([focusNodeId]);
    const focusedNode = graphData.nodes.find(n => n.id === focusNodeId);
    const nodeType = focusedNode?.type;

    // For resource/group/application/sharepoint nodes: first find parent package(s), then show full package view
    // For policy nodes: first find parent package(s), then show full package view
    // For package nodes: show direct neighbors + policy requestor groups
    // For catalog nodes: show all packages + their direct children

    let packageIds: string[] = [];

    if (nodeType === 'accessPackage') {
      packageIds = [focusNodeId];
    } else if (
      nodeType === 'group' || nodeType === 'application' || nodeType === 'sharepoint' ||
      nodeType === 'policy' || nodeType === 'requestorGroup' || nodeType === 'user'
    ) {
      // Walk UP to find parent packages (edges pointing TO this node, or FROM this node to a package)
      for (const e of graphData.edges) {
        if (e.target === focusNodeId && graphData.nodes.find(n => n.id === e.source)?.type === 'accessPackage') {
          packageIds.push(e.source);
        }
        if (e.source === focusNodeId && graphData.nodes.find(n => n.id === e.target)?.type === 'accessPackage') {
          packageIds.push(e.target);
        }
        // policy → resource: package is the source of a 'governed_by' edge to this policy
        if (nodeType === 'policy') {
          if (e.target === focusNodeId && e.type === 'governed_by') packageIds.push(e.source);
        }
        // requestorGroup → policy → package
        if (nodeType === 'requestorGroup' || nodeType === 'user') {
          if (e.target === focusNodeId && e.type === 'requests_from') {
            const polId = e.source;
            for (const e2 of graphData.edges) {
              if (e2.target === polId && e2.type === 'governed_by') packageIds.push(e2.source);
            }
          }
        }
      }
    }

    // Now for each package, include full neighborhood: catalog + resources + policies + requestor groups
    for (const pkgId of [...new Set(packageIds)]) {
      keep.add(pkgId);
      for (const e of graphData.edges) {
        // Direct neighbors of the package
        if (e.source === pkgId) keep.add(e.target);
        if (e.target === pkgId) keep.add(e.source);
      }
      // Also include requestor groups connected to policies of this package
      const policyIds = [...keep].filter(id => id.startsWith('policy:'));
      for (const polId of policyIds) {
        for (const e of graphData.edges) {
          if (e.source === polId) keep.add(e.target);
        }
      }
    }

    // If no package found (orphan node), fall back to 1-hop
    if (packageIds.length === 0) {
      for (const e of graphData.edges) {
        if (e.source === focusNodeId) keep.add(e.target);
        if (e.target === focusNodeId) keep.add(e.source);
      }
    }

    filteredNodes = filteredNodes.filter(n => keep.has(n.id));
  } else if (catalogId) {
    const root = `catalog:${catalogId}`;
    const keep = new Set<string>([root]);
    let frontier = [root];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const e of graphData.edges) {
        if (frontier.includes(e.source) && !keep.has(e.target)) { keep.add(e.target); next.push(e.target); }
        if (frontier.includes(e.target) && !keep.has(e.source)) { keep.add(e.source); next.push(e.source); }
      }
      frontier = next;
    }
    filteredNodes = filteredNodes.filter(n => keep.has(n.id));
  }

  if (resourceType) {
    const allowed = new Set(['catalog', 'accessPackage', 'policy', 'requestorGroup', 'user', resourceType]);
    filteredNodes = filteredNodes.filter(n => allowed.has(n.type));
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    const matched = new Set<string>();
    filteredNodes.forEach(n => { if (n.label.toLowerCase().includes(q)) matched.add(n.id); });
    graphData.edges.forEach(e => {
      if (matched.has(e.source)) matched.add(e.target);
      if (matched.has(e.target)) matched.add(e.source);
    });
    filteredNodes = filteredNodes.filter(n => matched.has(n.id));
  }

  const nodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = graphData.edges.filter(e =>
    nodeIds.has(e.source) && nodeIds.has(e.target) && visibleEdgeTypes.includes(e.type)
  );

  return { nodes: filteredNodes, edges: filteredEdges };
}
