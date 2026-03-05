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

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import { useAppStore } from './hooks/useAppStore';
import type { RawApiDump } from './hooks/useAppStore';
import { signIn, signOut } from './services/auth';
import { graphService } from './services/graphService';
import type { GraphNode, GraphEdge, ViewMode } from './types';
import './App.css';

// ─── Color Tokens ─────────────────────────────────────────────────────────────
const NODE_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  catalog:        { bg: '#1a1f36', border: '#4f8ef7', icon: '📦' },
  accessPackage:  { bg: '#0f2d1a', border: '#22c55e', icon: '🔐' },
  group:          { bg: '#1f1a2e', border: '#a855f7', icon: '👥' },
  application:    { bg: '#2d1a0f', border: '#f97316', icon: '⚙️' },
  sharepoint:     { bg: '#1a2d2d', border: '#06b6d4', icon: '📄' },
  policy:         { bg: '#2d2d0f', border: '#eab308', icon: '📋' },
  user:           { bg: '#2d0f1a', border: '#ec4899', icon: '👤' },
  requestorGroup: { bg: '#1a2d1a', border: '#86efac', icon: '🧑‍🤝‍🧑' },
};

const RISK_COLORS = {
  low:    '#22c55e',
  medium: '#f97316',
  high:   '#ef4444',
};

function getRiskColor(score: number): string {
  if (score >= 70) return RISK_COLORS.high;
  if (score >= 40) return RISK_COLORS.medium;
  return RISK_COLORS.low;
}

// ─── Cytoscape Stylesheet ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CYTO_STYLE: any[] = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(bgColor)',
      'border-color': 'data(borderColor)',
      'border-width': 2,
      'label': 'data(label)',
      'color': '#e8eaf6',
      'font-family': '"JetBrains Mono", monospace',
      'font-size': '11px',
      'text-wrap': 'wrap',
      'text-max-width': '120px',
      'text-valign': 'bottom',
      'text-margin-y': 6,
      'text-background-color': '#0a0b14',
      'text-background-opacity': 0.85,
      'text-background-padding': '3px',
      'text-background-shape': 'roundrectangle',
      'width': 52,
      'height': 52,
      'shape': 'ellipse',
      'transition-property': 'border-color, border-width, background-color',
      'transition-duration': 200,
    },
  },
  {
    selector: 'node[type = "catalog"]',
    style: { shape: 'hexagon', width: 64, height: 64 },
  },
  {
    selector: 'node[type = "policy"]',
    style: { shape: 'diamond', width: 46, height: 46 },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 4,
      'border-color': '#ffffff',
      'overlay-color': '#ffffff',
      'overlay-padding': 6,
      'overlay-opacity': 0.08,
    },
  },
  {
    selector: 'node.highlighted',
    style: {
      'border-width': 3,
      'border-color': '#f0f0f0',
    },
  },
  {
    selector: 'node.faded',
    style: { opacity: 0.25 },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#334155',
      'line-color': '#334155',
      'width': 1.5,
      'label': 'data(label)',
      'font-family': '"JetBrains Mono", monospace',
      'font-size': '9px',
      'color': '#64748b',
      'text-rotation': 'autorotate',
      'text-background-color': '#0a0b14',
      'text-background-opacity': 0.9,
      'text-background-padding': '2px',
      'opacity': 0.7,
    },
  },
  {
    selector: 'edge[type = "contains"]',
    style: { 'line-color': '#4f8ef7', 'target-arrow-color': '#4f8ef7' },
  },
  {
    selector: 'edge[type = "grants"]',
    style: { 'line-color': '#22c55e', 'target-arrow-color': '#22c55e' },
  },
  {
    selector: 'edge[type = "governed_by"]',
    style: { 'line-color': '#eab308', 'target-arrow-color': '#eab308', 'line-style': 'dashed' },
  },
  {
    selector: 'edge[type = "requests_from"]',
    style: { 'line-color': '#86efac', 'target-arrow-color': '#86efac', 'line-style': 'dotted', width: 1.5 },
  },
  {
    selector: 'edge.faded',
    style: { opacity: 0.08 },
  },
];

// ─── Utility Functions ────────────────────────────────────────────────────────
function buildCytoElements(nodes: GraphNode[], edges: GraphEdge[]) {
  const cyNodes = nodes.map(n => ({
    data: {
      id: n.id,
      label: n.label,
      type: n.type,
      bgColor: NODE_COLORS[n.type]?.bg ?? '#1a1a2e',
      borderColor: n.riskScore !== undefined && n.riskScore > 40
        ? getRiskColor(n.riskScore)
        : NODE_COLORS[n.type]?.border ?? '#4f8ef7',
      riskScore: n.riskScore ?? 0,
      raw: n,
    },
  }));

  const cyEdges = edges.map(e => ({
    data: {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: e.type,
    },
  }));

  return [...cyNodes, ...cyEdges];
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function DetailPanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const [showRaw, setShowRaw] = useState(false);
  const icon = NODE_COLORS[node.type]?.icon ?? '📦';

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <span className="detail-icon">{icon}</span>
        <div className="detail-title">
          <h3>{node.label}</h3>
          <span className={`node-type-badge type-${node.type}`}>{node.type}</span>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {node.riskScore !== undefined && node.riskScore > 0 && (
        <div className="risk-indicator">
          <span className="risk-label">Risk Score</span>
          <div className="risk-bar-wrap">
            <div
              className="risk-bar"
              style={{
                width: `${node.riskScore}%`,
                background: getRiskColor(node.riskScore),
              }}
            />
          </div>
          <span className="risk-value" style={{ color: getRiskColor(node.riskScore) }}>
            {node.riskScore}/100
          </span>
        </div>
      )}

      <div className="detail-tabs">
        <button className={!showRaw ? 'active' : ''} onClick={() => setShowRaw(false)}>Formatted</button>
        <button className={showRaw ? 'active' : ''} onClick={() => setShowRaw(true)}>JSON</button>
      </div>

      {showRaw ? (
        <pre className="json-view">{JSON.stringify(node.data, null, 2)}</pre>
      ) : (
        <div className="formatted-view">
          {Object.entries(node.data).map(([key, val]) => {
            if (val === null || val === undefined) return null;
            const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
            return (
              <div key={key} className="detail-row">
                <span className="detail-key">{camelToLabel(key)}</span>
                <span className="detail-val">{strVal}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function camelToLabel(s: string): string {
  return s.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

// ─── Nav Item ─────────────────────────────────────────────────────────────────
function NavItem({ icon, label, active, count, onClick }: {
  icon: string; label: string; active: boolean; count?: number; onClick: () => void;
}) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {count !== undefined && <span className="nav-badge">{count}</span>}
    </button>
  );
}

// ─── Packages List View ───────────────────────────────────────────────────────
function PackagesView() {
  const { accessPackages, catalogs, setViewMode, setFilter } = useAppStore();
  const [selectedCatalog, setSelectedCatalog] = useState<string>('');
  const catalogMap = new Map(catalogs.map(c => [c.id, c]));

  const filtered = accessPackages.filter(pkg =>
    !selectedCatalog || (pkg.catalogId ?? pkg.catalog?.id ?? '') === selectedCatalog
  );

  const openInGraph = (nodeId: string) => {
    setFilter({ focusNodeId: nodeId, catalogId: null, searchQuery: '' });
    setViewMode('graph');
  };

  return (
    <div className="list-view">
      <div className="list-view-header">
        <h2 className="view-title">Access Packages <span>({filtered.length})</span></h2>
        <div className="list-filter-bar">
          <label className="list-filter-label">Catalog</label>
          <select className="list-filter-select" value={selectedCatalog} onChange={e => setSelectedCatalog(e.target.value)}>
            <option value="">All Catalogs</option>
            {catalogs.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}
          </select>
        </div>
      </div>
      <div className="card-grid">
        {filtered.map(pkg => (
          <div key={pkg.id} className="entity-card entity-card-clickable" onClick={() => openInGraph(`pkg:${pkg.id}`)} title="Click to focus in graph">
            <div className="card-header">
              <span className="card-icon">🔐</span>
              <div>
                <div className="card-name">{pkg.displayName}</div>
                <div className="card-sub">
                  {catalogMap.get(pkg.catalogId ?? pkg.catalog?.id ?? '')?.displayName ?? pkg.catalog?.displayName ?? '—'}
                </div>
              </div>
              <div className="card-actions-right">
                {pkg.isHidden && <span className="badge badge-warn">Hidden</span>}
                <span className="card-graph-btn">⬡ View</span>
              </div>
            </div>
            {pkg.description && <p className="card-desc">{pkg.description}</p>}
            <div className="card-meta">
              <span>Created: {new Date(pkg.createdDateTime).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="list-empty">No packages found for this catalog.</div>}
      </div>
    </div>
  );
}

// ─── Resources List View ──────────────────────────────────────────────────────
function ResourcesView() {
  const { resources, catalogs, setViewMode, setFilter } = useAppStore();
  const [selectedCatalog, setSelectedCatalog] = useState<string>('');
  const catalogMap = new Map(catalogs.map(c => [c.id, c]));
  const allResources = Array.from(resources.entries()).flatMap(([catId, res]) =>
    (res ?? []).map(r => ({ ...r, _catalogId: catId }))
  );
  const filtered = allResources.filter(r => !selectedCatalog || r._catalogId === selectedCatalog);
  const iconMap: Record<string, string> = { AadGroup: '👥', AadApplication: '⚙️', SharePoint: '📄', SharePointOnline: '📄' };

  const openInGraph = (nodeId: string) => {
    setFilter({ focusNodeId: nodeId, catalogId: null, searchQuery: '' });
    setViewMode('graph');
  };

  if (allResources.length === 0) {
    return (
      <div className="list-view">
        <h2 className="view-title">Resources <span>(0)</span></h2>
        <div style={{ color: 'var(--text-muted)', padding: '20px', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}>No resources found.</div>
      </div>
    );
  }

  return (
    <div className="list-view">
      <div className="list-view-header">
        <h2 className="view-title">Resources <span>({filtered.length})</span></h2>
        <div className="list-filter-bar">
          <label className="list-filter-label">Catalog</label>
          <select className="list-filter-select" value={selectedCatalog} onChange={e => setSelectedCatalog(e.target.value)}>
            <option value="">All Catalogs</option>
            {catalogs.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}
          </select>
        </div>
      </div>
      <div className="card-grid">
        {filtered.map(res => {
          const resourceType = res.originSystem ?? res.resourceType ?? 'Unknown';
          return (
            <div key={`${res._catalogId}-${res.id}`} className="entity-card entity-card-clickable" onClick={() => openInGraph(`resource:${res.id}`)} title="Click to focus in graph">
              <div className="card-header">
                <span className="card-icon">{iconMap[resourceType] ?? '📦'}</span>
                <div>
                  <div className="card-name">{res.displayName ?? res.id}</div>
                  <div className="card-sub">{catalogMap.get(res._catalogId)?.displayName ?? res._catalogId}</div>
                </div>
                <div className="card-actions-right">
                  <span className={`badge badge-type-${resourceType.toLowerCase().replace('/', '-')}`}>{resourceType}</span>
                  <span className="card-graph-btn">⬡ View</span>
                </div>
              </div>
              {res.description && <p className="card-desc">{res.description}</p>}
              {res.url && <div className="card-url">{res.url}</div>}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="list-empty">No resources found for this catalog.</div>}
      </div>
    </div>
  );
}

// ─── Policies List View ───────────────────────────────────────────────────────
function PoliciesView() {
  const { policies, accessPackages, setViewMode, setFilter } = useAppStore();
  const pkgMap = new Map(accessPackages.map(p => [p.id, p]));
  const allPolicies = Array.from(policies.entries()).flatMap(([pkgId, pols]) =>
    (pols ?? []).map(p => ({ ...p, pkgName: pkgMap.get(pkgId)?.displayName ?? pkgMap.get(p.accessPackageId)?.displayName ?? pkgId }))
  );

  const SCOPE_LABELS: Record<string, { label: string; icon: string }> = {
    allMemberUsers:                          { label: 'All Members (excl. Guests)',  icon: '👥' },
    allDirectoryUsers:                       { label: 'All Users (incl. Guests)',    icon: '🌐' },
    allUsersIncludingGuests:                 { label: 'All Users (incl. Guests)',    icon: '🌐' },
    allDirectoryServicePrincipals:           { label: 'All Service Principals',      icon: '⚙️' },
    allExternalUsers:                        { label: 'All External Users',           icon: '🔗' },
    allConfiguredConnectedOrganizationUsers: { label: 'All Connected Org Users',     icon: '🤝' },
    specificDirectoryUsers:                  { label: 'Specific Users & Groups',     icon: '🎯' },
  };

  const openInGraph = (nodeId: string) => {
    setFilter({ focusNodeId: nodeId, catalogId: null, searchQuery: '' });
    setViewMode('graph');
  };

  if (allPolicies.length === 0) {
    return (
      <div className="list-view">
        <h2 className="view-title">Assignment Policies <span>(0)</span></h2>
        <div style={{ color: 'var(--text-muted)', padding: '20px', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}>No policies found.</div>
      </div>
    );
  }

  return (
    <div className="list-view">
      <h2 className="view-title">Assignment Policies <span>({allPolicies.length})</span></h2>
      <div className="card-grid">
        {allPolicies.map(pol => {
          const scope = (pol as unknown as { allowedTargetScope?: string }).allowedTargetScope ?? '';
          const scopeInfo = SCOPE_LABELS[scope];
          const targets = (pol as unknown as { specificAllowedTargets?: Array<{ description?: string; groupId?: string; '@odata.type'?: string }> }).specificAllowedTargets ?? [];
          return (
            <div key={pol.id} className="entity-card entity-card-clickable" onClick={() => openInGraph(`policy:${pol.id}`)} title="Click to focus in graph">
              <div className="card-header">
                <span className="card-icon">📋</span>
                <div>
                  <div className="card-name">{pol.displayName}</div>
                  <div className="card-sub">{pol.pkgName}</div>
                </div>
                <div className="card-actions-right">
                  {(pol.requestApprovalSettings?.isApprovalRequired || pol.requestApprovalSettings?.isApprovalRequiredForAdd) && (
                    <span className="badge badge-info">Approval</span>
                  )}
                  <span className="card-graph-btn">⬡ View</span>
                </div>
              </div>
              {pol.description && <p className="card-desc">{pol.description}</p>}
              <div className="policy-scope-row">
                <span className="policy-scope-title">Who can request:</span>
                {scopeInfo ? <span className="policy-scope-badge">{scopeInfo.icon} {scopeInfo.label}</span>
                  : scope ? <span className="policy-scope-badge">{scope}</span> : null}
              </div>
              {targets.length > 0 && (
                <div className="policy-targets">
                  {targets.map((t, i) => (
                    <span key={i} className="policy-target-chip">
                      {(t["@odata.type"] ?? '').includes('groupMembers') ? '👥' : '👤'} {t.description ?? t.groupId ?? '—'}
                    </span>
                  ))}
                </div>
              )}
              <div className="card-meta">
                {pol.durationInDays != null && <span>Duration: {pol.durationInDays}d</span>}
                {pol.expiration?.duration && <span>Duration: {pol.expiration.duration}</span>}
                {pol.requestApprovalSettings?.isApprovalRequiredForAdd != null && (
                  <span>Approval: {pol.requestApprovalSettings.isApprovalRequiredForAdd ? 'Required' : 'Not required'}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Graph View ───────────────────────────────────────────────────────────────
function GraphView() {
  const cyRef = useRef<cytoscape.Core | null>(null);
  const { getFilteredGraph, setSelectedNode, filters, setFilter, catalogs } = useAppStore();
  const filteredGraph = getFilteredGraph();
  const elements = buildCytoElements(filteredGraph.nodes, filteredGraph.edges);

  const LAYOUT = {
    name: 'cose',
    idealEdgeLength: 150,
    nodeOverlap: 20,
    refresh: 20,
    fit: true,
    padding: 30,
    randomize: false,
    componentSpacing: 100,
    nodeRepulsion: 400000,
    edgeElasticity: 100,
    nestingFactor: 5,
    gravity: 80,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1,
  };

  const handleCyInit = useCallback((cy: cytoscape.Core) => {
    cyRef.current = cy;

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const raw = node.data('raw') as GraphNode;
      setSelectedNode(raw);

      // Highlight connected
      cy.elements().addClass('faded');
      node.removeClass('faded').addClass('highlighted');
      node.connectedEdges().removeClass('faded').addClass('highlighted');
      node.neighborhood().nodes().removeClass('faded');
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        cy.elements().removeClass('faded highlighted');
      }
    });
  }, [setSelectedNode]);

  const handleFitGraph = () => cyRef.current?.fit(undefined, 30);
  const handleResetLayout = () => {
    cyRef.current?.layout(LAYOUT).run();
    setTimeout(() => cyRef.current?.fit(undefined, 30), 1200);
  };

  const EDGE_TYPES: Array<{ type: GraphEdge['type']; label: string; color: string }> = [
    { type: 'contains',      label: 'Contains',       color: '#4f8ef7' },
    { type: 'grants',        label: 'Grants Access',  color: '#22c55e' },
    { type: 'governed_by',   label: 'Governed By',    color: '#eab308' },
    { type: 'requests_from', label: 'Requestable By', color: '#86efac' },
    { type: 'assigned_via',  label: 'Assigned Via',   color: '#a855f7' },
    { type: 'member_of',     label: 'Member Of',      color: '#ec4899' },
  ];

  const toggleEdgeType = (type: GraphEdge['type']) => {
    const current = filters.visibleEdgeTypes;
    const next = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    setFilter({ visibleEdgeTypes: next });
  };

  return (
    <div className="graph-view">
      {/* Graph Controls */}
      <div className="graph-controls">
        <div className="control-group">
          <label>Catalog</label>
          <select
            value={filters.catalogId ?? ''}
            onChange={e => setFilter({ catalogId: e.target.value || null })}
          >
            <option value="">All Catalogs</option>
            {catalogs.map(c => (
              <option key={c.id} value={c.id}>{c.displayName}</option>
            ))}
          </select>
        </div>
        <div className="control-group">
          <label>Resource Type</label>
          <select
            value={filters.resourceType ?? ''}
            onChange={e => setFilter({ resourceType: e.target.value || null })}
          >
            <option value="">All Types</option>
            <option value="group">Groups</option>
            <option value="application">Applications</option>
            <option value="sharepoint">SharePoint</option>
          </select>
        </div>
        <div className="control-group edge-toggles">
          <label>Relationships</label>
          <div className="toggle-row">
            {EDGE_TYPES.map(et => (
              <button
                key={et.type}
                className={`edge-toggle ${filters.visibleEdgeTypes.includes(et.type) ? 'active' : ''}`}
                style={{ '--edge-color': et.color } as React.CSSProperties}
                onClick={() => toggleEdgeType(et.type)}
              >
                {et.label}
              </button>
            ))}
          </div>
        </div>
        <div className="graph-actions">
          <button className="action-btn" onClick={handleFitGraph} title="Fit to screen">⊡</button>
          <button className="action-btn" onClick={handleResetLayout} title="Re-layout">↺</button>
          <button
            className="action-btn"
            title="Export PNG"
            onClick={() => {
              if (!cyRef.current) return;
              const png = cyRef.current.png({ full: true, scale: 2, bg: '#0a0b14' });
              const a = document.createElement('a');
              a.href = png;
              a.download = 'entra-graph.png';
              a.click();
            }}
          >↓ PNG</button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="stats-bar">
        <span>🔵 {filteredGraph.nodes.filter(n => n.type === 'catalog').length} Catalogs</span>
        <span>🟢 {filteredGraph.nodes.filter(n => n.type === 'accessPackage').length} Packages</span>
        <span>🟣 {filteredGraph.nodes.filter(n => n.type === 'group').length} Groups</span>
        <span>🟠 {filteredGraph.nodes.filter(n => n.type === 'application').length} Apps</span>
        <span>🔵 {filteredGraph.nodes.filter(n => n.type === 'sharepoint').length} SharePoint</span>
        <span>🟡 {filteredGraph.nodes.filter(n => n.type === 'policy').length} Policies</span>
        <span>🟩 {filteredGraph.nodes.filter(n => n.type === 'requestorGroup').length} Requestor Groups</span>
        <span>⚡ {filteredGraph.edges.length} Edges</span>
      </div>

      {/* Focus Banner — shown when navigated from a list card */}
      {filters.focusNodeId && (
        <div className="focus-banner">
          <span className="focus-banner-icon">🔍</span>
          <span className="focus-banner-text">
            Focused on: <strong>{filteredGraph.nodes.find(n => n.id === filters.focusNodeId)?.label ?? filters.focusNodeId}</strong>
            {' '}— showing all connected nodes
          </span>
          <button
            className="focus-banner-clear"
            onClick={() => setFilter({ focusNodeId: null })}
          >
            ✕ Show All
          </button>
        </div>
      )}

      {/* Cytoscape */}
      <div className="cytoscape-wrap">
        {elements.length > 0 ? (
          <CytoscapeComponent
            elements={elements}
            stylesheet={CYTO_STYLE}
            layout={LAYOUT}
            cy={handleCyInit}
            style={{ width: '100%', height: '100%' }}
            minZoom={0.1}
            maxZoom={3}
            wheelSensitivity={0.2}
          />
        ) : (
          <div className="empty-graph">
            <div className="empty-icon">⬡</div>
            <p>No nodes match the current filters</p>
            <button onClick={() => setFilter({ catalogId: null, resourceType: null, searchQuery: '', focusNodeId: null })}>
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="graph-legend">
        {Object.entries(NODE_COLORS).map(([type, colors]) => (
          <div key={type} className="legend-item">
            <div className="legend-dot" style={{ background: colors.border }} />
            <span>{type === 'requestorGroup' ? 'Requestor Group' : type}</span>
          </div>
        ))}
        <div className="legend-item">
          <div className="legend-dot" style={{ background: RISK_COLORS.high }} />
          <span>High Risk</span>
        </div>
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">⬡</div>
        <h1>Entra ID<br /><em>Access Package Visualizer</em></h1>
        <p>Interactively explore Microsoft Entra ID entitlement management — catalogs, packages, resources, policies and their relationships.</p>
        <div className="login-actions">
          <button className="btn-primary" onClick={() => signIn()}>
            <svg width="20" height="20" viewBox="0 0 23 23" fill="none">
              <path d="M1 1h10v10H1zM12 1h10v10H12zM1 12h10v10H1zM12 12h10v10H12z" fill="currentColor" opacity=".5"/>
            </svg>
            Sign in with Microsoft
          </button>
          <button className="btn-secondary" onClick={onDemo}>
            ◈ Try Demo Mode
          </button>
        </div>
        <p className="login-note">
          Requires: <code>EntitlementManagement.Read.All</code> · <code>Group.Read.All</code> · <code>Application.Read.All</code>
        </p>
        <p className="login-copyright">
          © 2026 Marc Schramm · Licensed under{' '}
          <a href="https://www.gnu.org/licenses/gpl-3.0.txt" target="_blank" rel="noreferrer">GPL v3</a>
        </p>
      </div>
      <div className="login-bg">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="bg-hex" style={{
            '--i': i,
            animationDelay: `${(i * 0.4) % 3}s`,
          } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}

// ─── Debug / Data Export View ─────────────────────────────────────────────────
function DebugView() {
  const { rawDump, graphData, catalogs, accessPackages, resources, policies } = useAppStore();
  const [activeTab, setActiveTab] = useState<'summary' | 'roles' | 'resources' | 'raw'>('summary');

  const downloadJson = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fullDump = {
    capturedAt: rawDump?.capturedAt ?? new Date().toISOString(),
    summary: {
      catalogs: catalogs.length,
      accessPackages: accessPackages.length,
      totalResources: Array.from(resources.values()).reduce((s, r) => s + r.length, 0),
      totalPolicies: Array.from(policies.values()).reduce((s, p) => s + p.length, 0),
      graphNodes: graphData.nodes.length,
      graphEdges: graphData.edges.length,
    },
    rawApiResponses: rawDump,
    graphData: {
      nodes: graphData.nodes,
      edges: graphData.edges,
    },
  };

  const rolesEntries = rawDump ? Object.entries(rawDump.rolesPerPackage) : [];
  const resourceEntries = rawDump ? Object.entries(rawDump.resourcesPerCatalog) : [];

  return (
    <div className="list-view debug-view">
      <div className="debug-header">
        <h2 className="view-title">🔬 Data Debug &amp; Export</h2>
        <div className="debug-actions">
          <button className="debug-dl-btn" onClick={() => downloadJson(fullDump, `entra-dump-${Date.now()}.json`)}>
            ↓ Download Full Dump (.json)
          </button>
          {rawDump && (
            <span className="debug-ts">Captured: {new Date(rawDump.capturedAt).toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {!rawDump && (
        <div className="debug-notice">
          ⚠ No live data captured yet. Sign in with a real Microsoft account to capture Graph API responses. Demo mode data is not included here.
        </div>
      )}

      <div className="debug-tabs">
        {(['summary', 'roles', 'resources', 'raw'] as const).map(tab => (
          <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
            {tab === 'summary' && '📊 Summary'}
            {tab === 'roles' && `🔗 Role Scopes (${rolesEntries.length} packages)`}
            {tab === 'resources' && `📦 Resources (${resourceEntries.length} catalogs)`}
            {tab === 'raw' && '📄 Raw JSON'}
          </button>
        ))}
      </div>

      <div className="debug-content">
        {activeTab === 'summary' && (
          <div className="debug-summary">
            <div className="debug-stat-grid">
              {[
                { label: 'Catalogs', value: catalogs.length, color: '#4f8ef7' },
                { label: 'Access Packages', value: accessPackages.length, color: '#22c55e' },
                { label: 'Resources', value: Array.from(resources.values()).reduce((s, r) => s + r.length, 0), color: '#a855f7' },
                { label: 'Policies', value: Array.from(policies.values()).reduce((s, p) => s + p.length, 0), color: '#eab308' },
                { label: 'Graph Nodes', value: graphData.nodes.length, color: '#06b6d4' },
                { label: 'Graph Edges', value: graphData.edges.length, color: '#f97316' },
              ].map(s => (
                <div key={s.label} className="debug-stat" style={{ borderColor: s.color }}>
                  <div className="debug-stat-value" style={{ color: s.color }}>{s.value}</div>
                  <div className="debug-stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            <h3 className="debug-section-title">Graph Nodes by Type</h3>
            <div className="debug-table-wrap">
              <table className="debug-table">
                <thead><tr><th>Type</th><th>Count</th><th>Example</th></tr></thead>
                <tbody>
                  {(['catalog','accessPackage','group','application','sharepoint','policy','user'] as const).map(t => {
                    const nodes = graphData.nodes.filter(n => n.type === t);
                    return nodes.length > 0 ? (
                      <tr key={t}>
                        <td><span className={`node-type-badge type-${t}`}>{t}</span></td>
                        <td>{nodes.length}</td>
                        <td className="debug-example">{nodes[0]?.label}</td>
                      </tr>
                    ) : null;
                  })}
                </tbody>
              </table>
            </div>

            <h3 className="debug-section-title">Graph Edges by Type</h3>
            <div className="debug-table-wrap">
              <table className="debug-table">
                <thead><tr><th>Type</th><th>Count</th><th>Example</th></tr></thead>
                <tbody>
                  {(['contains','grants','governed_by','assigned_via','member_of'] as const).map(t => {
                    const edges = graphData.edges.filter(e => e.type === t);
                    return edges.length > 0 ? (
                      <tr key={t}>
                        <td><code>{t}</code></td>
                        <td>{edges.length}</td>
                        <td className="debug-example">{edges[0]?.source} → {edges[0]?.target}</td>
                      </tr>
                    ) : null;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'roles' && (
          <div>
            {rolesEntries.length === 0 ? (
              <div className="debug-notice">No role scope data captured. Sign in with live data.</div>
            ) : rolesEntries.map(([pkgName, roles]) => (
              <div key={pkgName} className="debug-section">
                <div className="debug-section-header">
                  <span className="debug-pkg-name">🔐 {pkgName}</span>
                  <span className="debug-count">{(roles as unknown[]).length} role scopes</span>
                </div>
                <pre className="debug-json">{JSON.stringify(roles, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'resources' && (
          <div>
            {resourceEntries.length === 0 ? (
              <div className="debug-notice">No resource data captured. Sign in with live data.</div>
            ) : resourceEntries.map(([catName, resources]) => (
              <div key={catName} className="debug-section">
                <div className="debug-section-header">
                  <span className="debug-pkg-name">📦 {catName}</span>
                  <span className="debug-count">{(resources as unknown[]).length} resources</span>
                </div>
                <pre className="debug-json">{JSON.stringify(resources, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'raw' && (
          <div>
            <div className="debug-raw-actions">
              <span className="debug-hint">This is the complete raw JSON that you can upload for analysis.</span>
              <button className="debug-dl-btn" onClick={() => downloadJson(fullDump, `entra-dump-${Date.now()}.json`)}>
                ↓ Download Full Dump
              </button>
            </div>
            <pre className="debug-json debug-json-full">{JSON.stringify(fullDump, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { accounts } = useMsal();
  const isAuthenticated = accounts.length > 0;

  const {
    viewMode, setViewMode,
    selectedNode, setSelectedNode,
    filters, setFilter,
    loading, error,
    catalogs, accessPackages, resources, policies,
    loadDemoData, loadRealData,
    clearError,
    lastFetched,
  } = useAppStore();

  const [isDemoMode, setIsDemoMode] = useState(false);
  const [showDemoMode, setShowDemoMode] = useState(!isAuthenticated);

  useEffect(() => {
    if (isAuthenticated && !isDemoMode) {
      loadRealData(async () => {
        const { catalogs, accessPackages, resourcesMap, rolesMap, policies, rawDump, groupNamesMap } =
          await graphService.loadAllData();

        const policiesMap = new Map<string, import('./types').AssignmentPolicy[]>();
        for (const policy of policies) {
          const existing = policiesMap.get(policy.accessPackageId) ?? [];
          existing.push(policy);
          policiesMap.set(policy.accessPackageId, existing);
        }

        return { catalogs, accessPackages, resourcesMap, policiesMap, rolesMap, groupNamesMap, rawDump };
      });
    }
  }, [isAuthenticated, isDemoMode, loadRealData]);

  const handleDemoMode = () => {
    setIsDemoMode(true);
    setShowDemoMode(false);
    loadDemoData();
  };

  const totalResources = Array.from(resources.values()).reduce((sum, r) => sum + r.length, 0);
  const totalPolicies = Array.from(policies.values()).reduce((sum, p) => sum + p.length, 0);

  if (showDemoMode && !isAuthenticated) {
    return <LoginScreen onDemo={handleDemoMode} />;
  }

  const VIEWS: Array<{ id: ViewMode; icon: string; label: string; count?: number }> = [
    { id: 'graph', icon: '⬡', label: 'Graph View' },
    { id: 'packages', icon: '🔐', label: 'Access Packages', count: accessPackages.length },
    { id: 'resources', icon: '📦', label: 'Resources', count: totalResources },
    { id: 'policies', icon: '📋', label: 'Policies', count: totalPolicies },
    { id: 'debug', icon: '🔬', label: 'Debug & Export' },
  ];

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-hex">⬡</span>
          <div>
            <div className="logo-title">Entra Viz</div>
            <div className="logo-sub">Access Package Explorer</div>
          </div>
        </div>

        {/* Search */}
        <div className="sidebar-search">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search nodes..."
            value={filters.searchQuery}
            onChange={e => setFilter({ searchQuery: e.target.value })}
          />
          {filters.searchQuery && (
            <button className="search-clear" onClick={() => setFilter({ searchQuery: '' })}>✕</button>
          )}
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {VIEWS.map(v => (
            <NavItem
              key={v.id}
              icon={v.icon}
              label={v.label}
              active={viewMode === v.id}
              count={v.count}
              onClick={() => setViewMode(v.id)}
            />
          ))}
        </nav>

        {/* Catalog Filter (sidebar) */}
        {catalogs.length > 0 && (
          <div className="sidebar-section">
            <div className="section-label">Catalogs</div>
            {catalogs.map(c => (
              <button
                key={c.id}
                className={`catalog-item ${filters.catalogId === c.id ? 'active' : ''}`}
                onClick={() => setFilter({ catalogId: filters.catalogId === c.id ? null : c.id })}
              >
                <span className="catalog-dot" style={{
                  background: c.isExternallyVisible ? '#22c55e' : '#4f8ef7'
                }} />
                <span className="catalog-name">{c.displayName}</span>
                {c.isExternallyVisible && <span className="ext-badge">ext</span>}
              </button>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="sidebar-footer">
          {lastFetched && (
            <div className="last-fetched">
              ↺ {lastFetched.toLocaleTimeString()}
            </div>
          )}
          {isDemoMode && (
            <div className="demo-badge">◈ DEMO MODE</div>
          )}
          {isAuthenticated && (
            <button className="signout-btn" onClick={() => signOut()}>
              Sign Out · {accounts[0]?.username}
            </button>
          )}
          {!isAuthenticated && !isDemoMode && (
            <button className="signout-btn" onClick={() => signIn()}>Sign In</button>
          )}
          <div className="sidebar-copyright">
            © 2026 Marc Schramm<br />
            <a href="https://www.gnu.org/licenses/gpl-3.0.txt" target="_blank" rel="noreferrer">GPL v3 License</a>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main">
        {/* Header */}
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="page-title">
              {VIEWS.find(v => v.id === viewMode)?.icon}{' '}
              {VIEWS.find(v => v.id === viewMode)?.label}
            </h1>
            {isDemoMode && <span className="topbar-badge">Demo Data</span>}
          </div>
          <div className="topbar-right">
            {loading && <div className="spinner" />}
            {error && (
              <div className="error-pill" onClick={clearError}>
                ⚠ {error} · dismiss
              </div>
            )}
            <button
              className="refresh-btn"
              onClick={() => isDemoMode ? loadDemoData() : loadRealData(async () => {
                graphService.clearCache();
                const { catalogs, accessPackages, resourcesMap, rolesMap, policies, rawDump, groupNamesMap } = await graphService.loadAllData();
                const policiesMap = new Map<string, import('./types').AssignmentPolicy[]>();
                for (const policy of policies) {
                  const existing = policiesMap.get(policy.accessPackageId) ?? [];
                  existing.push(policy);
                  policiesMap.set(policy.accessPackageId, existing);
                }
                return { catalogs, accessPackages, resourcesMap, policiesMap, rolesMap, groupNamesMap, rawDump };
              })}
            >
              ↺ Refresh
            </button>
          </div>
        </header>

        {/* View Content */}
        <div className="content">
          {viewMode === 'graph' && <GraphView />}
          {viewMode === 'packages' && <PackagesView />}
          {viewMode === 'resources' && <ResourcesView />}
          {viewMode === 'policies' && <PoliciesView />}
          {viewMode === 'debug' && <DebugView />}
        </div>
      </main>

      {/* Detail Panel */}
      {selectedNode && (
        <aside className="right-panel">
          <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        </aside>
      )}
    </div>
  );
}
