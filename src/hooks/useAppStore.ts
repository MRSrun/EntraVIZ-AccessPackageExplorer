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

import { create } from 'zustand';
import { MOCK_DATA } from '../services/graphService';
import { buildGraphData, filterGraphData } from '../services/graphBuilder';
import type {
  AppState, FilterState, GraphData, GraphNode, ViewMode,
  AccessPackageCatalog, AccessPackage, AccessPackageResource, AssignmentPolicy,
  AccessPackageResourceRoleScope,
} from '../types';

export interface RawApiDump {
  capturedAt: string;
  catalogs: unknown[];
  accessPackages: unknown[];
  policies: unknown[];
  resourcesPerCatalog: Record<string, unknown[]>;
  rolesPerPackage: Record<string, unknown[]>;
}

interface AppStore extends AppState {
  rawDump: RawApiDump | null;
  setViewMode: (mode: ViewMode) => void;
  setSelectedNode: (node: GraphNode | null) => void;
  setFilter: (filter: Partial<FilterState>) => void;
  loadDemoData: () => void;
  loadRealData: (loader: () => Promise<{
    catalogs: AccessPackageCatalog[];
    accessPackages: AccessPackage[];
    resourcesMap: Map<string, AccessPackageResource[]>;
    policiesMap: Map<string, AssignmentPolicy[]>;
    rolesMap: Map<string, AccessPackageResourceRoleScope[]>;
    groupNamesMap: Map<string, string>;
    rawDump: RawApiDump;
  }>) => Promise<void>;
  getFilteredGraph: () => GraphData;
  clearError: () => void;
}

const DEFAULT_FILTERS: FilterState = {
  catalogId: null,
  resourceType: null,
  searchQuery: '',
  visibleEdgeTypes: ['contains', 'grants', 'assigned_via', 'member_of', 'governed_by', 'requests_from'],
  focusNodeId: null,
};

export const useAppStore = create<AppStore>((set, get) => ({
  catalogs: [],
  accessPackages: [],
  resources: new Map(),
  policies: new Map(),
  assignments: [],
  graphData: { nodes: [], edges: [] },
  loading: false,
  error: null,
  selectedNode: null,
  viewMode: 'graph',
  filters: DEFAULT_FILTERS,
  lastFetched: null,
  rawDump: null,

  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setFilter: (partial) => set((state) => ({ filters: { ...state.filters, ...partial } })),
  clearError: () => set({ error: null }),

  loadDemoData: () => {
    const { catalogs, accessPackages, resources, policies } = MOCK_DATA;
    const rolesMap = new Map<string, AccessPackageResourceRoleScope[]>();
    const groupNamesMap = new Map<string, string>();
    const graphData = buildGraphData(catalogs, accessPackages, resources, policies, rolesMap, groupNamesMap);

    const packagesWithCatalog = accessPackages.map(pkg => ({
      ...pkg,
      catalog: catalogs.find(c => c.id === pkg.catalogId),
    }));

    set({
      catalogs,
      accessPackages: packagesWithCatalog,
      resources,
      policies,
      graphData,
      loading: false,
      error: null,
      lastFetched: new Date(),
      rawDump: null,
    });
  },

  loadRealData: async (loader) => {
    set({ loading: true, error: null });
    try {
      const { catalogs, accessPackages, resourcesMap, policiesMap, rolesMap, groupNamesMap, rawDump } = await loader();
      const graphData = buildGraphData(catalogs, accessPackages, resourcesMap, policiesMap, rolesMap, groupNamesMap);

      set({
        catalogs,
        accessPackages,
        resources: resourcesMap,
        policies: policiesMap,
        graphData,
        loading: false,
        lastFetched: new Date(),
        rawDump,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load data from Microsoft Graph',
      });
    }
  },

  getFilteredGraph: () => {
    const { graphData, filters } = get();
    return filterGraphData(
      graphData,
      filters.catalogId,
      filters.resourceType,
      filters.searchQuery,
      filters.visibleEdgeTypes,
      filters.focusNodeId,
    );
  },
}));
