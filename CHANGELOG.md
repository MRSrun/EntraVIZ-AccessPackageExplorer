# Changelog

All notable changes to **Entra Viz - Access Package Explorer** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-03-05

### Added

#### Authentication
- Microsoft MSAL browser-based sign-in (OAuth 2.0 / OpenID Connect)
- Automatic token acquisition and refresh via `@azure/msal-browser`
- Sign out support with username display in sidebar
- Demo mode with realistic mock data — no Azure tenant required

#### Graph Visualization
- Interactive node-graph powered by Cytoscape.js and `react-cytoscapejs`
- Node types with distinct shapes and colors:
  - **Catalog** — blue hexagon
  - **Access Package** — green circle
  - **Group** — purple circle
  - **Application** — orange circle
  - **SharePoint** — cyan circle
  - **Policy** — yellow diamond
  - **Requestor Group** — light green circle
- Color-coded relationship edges:
  - **Contains** (blue) — catalog → package
  - **Grants Access** (green) — package → resource
  - **Governed By** (yellow dashed) — package → policy
  - **Requestable By** (green dotted) — policy → requestor group/user
  - **Assigned Via** (purple) — for assignment edges
  - **Member Of** (pink) — for membership edges
- Toggle individual relationship types on/off via toolbar
- Risk scoring on access packages (color-coded border intensity)
- Node detail panel on click showing all raw properties
- Export graph as PNG (full resolution, 2x scale)
- COSE layout with configurable edge lengths

#### Filtering & Search
- Filter graph by catalog (dropdown)
- Filter graph by resource type (Groups, Applications, SharePoint)
- Live node search with connected-node highlighting
- Catalog filter in sidebar with click-to-filter
- Focus mode: click any list card to isolate that object and its direct relationships in the graph
- "Show All" banner with one-click to exit focus mode

#### Access Packages View
- Card grid listing all access packages
- Shows catalog name, description, created date, hidden badge
- Catalog dropdown filter
- Click-to-focus: opens graph focused on the selected package (catalog + resources + policy + requestor groups)

#### Resources View
- Card grid listing all catalog resources
- Type badges: AadGroup, AadApplication, SharePointOnline
- Shows catalog name, description, URL
- Catalog dropdown filter
- Click-to-focus: opens graph showing all packages that grant access to the selected resource

#### Policies View
- Card grid listing all assignment policies
- Displays `allowedTargetScope` as human-readable badge:
  - Specific Users & Groups
  - All Members (excl. Guests)
  - All Users (incl. Guests)
  - All External Users
  - All Service Principals
  - All Connected Org Users
- Shows specific allowed target group/user chips when `specificAllowedTargets` is populated
- Displays approval requirements, duration (ISO 8601 and days), expiration type
- Click-to-focus: opens graph showing the policy, its package, and all requestor targets

#### Policy Scope Visualization
- Broad scopes (`allMemberUsers`, `allDirectoryUsers`, etc.) rendered as shared synthetic scope nodes
- Multiple policies sharing the same broad scope share one node in the graph
- Specific group targets resolved to display names via `GET /groups/{id}` Microsoft Graph call

#### Microsoft Graph API Integration
- Fetches catalogs, access packages, resources, policies, role scopes, and group names
- `$expand=catalog` on access packages to resolve `catalogId` from nested object
- `$expand=accessPackage` on policies to resolve `accessPackageId`
- `$expand=role($expand=resource),scope` on resource role scopes
- Automatic pagination via `@odata.nextLink` traversal
- In-memory cache with configurable TTL (5 min default, 2 min for assignments)
- 30-second per-request timeout
- Best-effort loading — individual endpoint failures do not break the full load

#### Debug & Export View
- Raw API dump captured from all Graph API responses
- Tabs: Summary (node/edge counts), Role Scopes, Resources, Raw JSON
- Download full dump as timestamped JSON file for offline auditing

#### UI & Design
- Dark theme with CSS custom properties throughout
- Fonts: Syne (headings), JetBrains Mono (code/metadata)
- Sidebar with collapsible catalog list, navigation badges with counts
- Stats bar showing live node/edge counts per type
- Graph legend with node type color reference
- Hover-reveal "⬡ View" button on list cards
- Focus banner showing focused node name with "✕ Show All" dismiss button
- Responsive card grid layout

#### Licensing & Copyright
- GNU General Public License v3.0
- Copyright (C) 2026 Marc Schramm
- Copyright header in all source files
- `LICENSE` and `NOTICE` files in project root
- Copyright notice on login screen and sidebar footer
- Third-party library attributions in `NOTICE`

#### Project Setup
- Vite + React 18 + TypeScript
- Zustand for global state management
- Axios for HTTP with Bearer token injection
- `.env.local` support for `VITE_CLIENT_ID`, `VITE_TENANT_ID`, `VITE_REDIRECT_URI`
- `.env.example` for onboarding reference
- `.gitignore` excluding `node_modules/`, `dist/`, `.env.local`
- Production build via `npm run build` (Vite bundles and inlines env vars)

---

## [Unreleased]

### Planned
- Assignment visualization — show active assignments as graph edges between users and packages
- Export to CSV — download package/resource/policy data as spreadsheet
- Dark/light theme toggle
- Graph layout options (breadthfirst, grid, dagre)
- Approval stage visualization — show approvers connected to policies

---

*Maintained by Marc Schramm — https://github.com/MRSrun/EntraVIZ-AccessPackageExplorer*
