# ⬡ Entra ID Access Package Visualizer

An interactive web-based visualization tool for Microsoft Entra ID Entitlement Management. Map and explore Access Packages, Catalogs, Resources, Assignment Policies, and their relationships through a live interactive graph.

![Dark industrial UI with hexagonal node graph](./screenshot-placeholder.png)

---

## Features

- **Interactive Graph** — Zoom, pan, click-to-inspect, highlight connected nodes
- **Real-time Data** — Connects to Microsoft Graph API with proper OAuth2/MSAL auth
- **Demo Mode** — Try without an Azure tenant using rich mock data
- **Risk Scoring** — Automatic risk indicators for packages (many resources, no approval, privileged apps)
- **Filtering** — Filter by Catalog, Resource Type, search by name, toggle edge types
- **Detail Panel** — Formatted + raw JSON view for every entity
- **Export** — Download the graph as PNG
- **Dark theme** — Industrial dark UI with JetBrains Mono + Syne typography

---

## Architecture

```
src/
├── services/
│   ├── auth.ts           # MSAL configuration, token acquisition, signIn/signOut
│   ├── graphService.ts   # Microsoft Graph API calls + in-memory cache + mock data
│   └── graphBuilder.ts   # Transform API data → Cytoscape nodes/edges + filtering
├── hooks/
│   └── useAppStore.ts    # Zustand state store
├── types/
│   └── index.ts          # All TypeScript interfaces
├── App.tsx               # Main UI — layout, views, graph, detail panel
├── App.css               # Full design system
└── main.tsx              # Bootstrap + MsalProvider
```

### Data Flow

```
MSAL Auth → Graph API → graphService → graphBuilder → Cytoscape.js → UI
                          (cache)        (filter)        (render)
```

---

## Azure App Registration Setup

### 1. Create an App Registration

1. Go to [Entra ID App Registrations](https://entra.microsoft.com/#blade/Microsoft_AAD_RegisteredApps)
2. Click **New registration**
3. Name: `Entra Access Package Visualizer`
4. Supported account types: **Single tenant** (or multitenant if needed)
5. Redirect URI: **Single-page application (SPA)** → `http://localhost:3000`
6. Click **Register**

### 2. Configure API Permissions

In the app registration, go to **API Permissions** → **Add a permission** → **Microsoft Graph** → **Delegated**:

| Permission | Purpose |
|---|---|
| `EntitlementManagement.Read.All` | Read access packages, catalogs, policies, assignments |
| `Group.Read.All` | Read security group details |
| `Application.Read.All` | Read enterprise applications |
| `User.Read` | Sign-in and basic profile |

Click **Grant admin consent** for your tenant.

### 3. Note your IDs

- **Application (client) ID** — from the Overview page
- **Directory (tenant) ID** — from the Overview page

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your Client ID and Tenant ID

# 3. Start dev server
npm run dev
# → http://localhost:3000
```

---

## Configuration

`.env.local`:
```env
VITE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_REDIRECT_URI=http://localhost:3000
```

---

## Graph API Endpoints Used

| Endpoint | Data |
|---|---|
| `GET /identityGovernance/entitlementManagement/catalogs` | Access Package Catalogs |
| `GET /identityGovernance/entitlementManagement/accessPackages?$expand=catalog` | Access Packages |
| `GET /identityGovernance/entitlementManagement/catalogs/{id}/resources` | Resources per Catalog |
| `GET /identityGovernance/entitlementManagement/accessPackages/{id}/resourceRoleScopes` | Resource Roles |
| `GET /identityGovernance/entitlementManagement/assignmentPolicies` | Assignment Policies |
| `GET /identityGovernance/entitlementManagement/assignments?$expand=target` | Active Assignments |

All endpoints use **automatic pagination** via `@odata.nextLink`.

---

## Graph Node Types

| Node | Shape | Color | Description |
|---|---|---|---|
| Catalog | Hexagon | Blue | Access Package Catalogs |
| Access Package | Circle | Green | Entitlement bundles |
| Group | Circle | Purple | AAD Security Groups |
| Application | Circle | Orange | Enterprise Applications |
| SharePoint | Circle | Cyan | SharePoint Sites |
| Policy | Diamond | Yellow | Assignment Policies |

## Edge Relationship Types

| Edge | Color | Meaning |
|---|---|---|
| `contains` | Blue | Catalog → Package |
| `grants` | Green | Package → Resource |
| `governed_by` | Yellow (dashed) | Package → Policy |
| `assigned_via` | Purple | User → Package |
| `member_of` | Pink | User → Group |

---

## Risk Scoring

Each Access Package receives an automatic risk score (0–100):

| Factor | Points |
|---|---|
| More than 5 resources | +30 |
| More than 2 resources | +15 |
| Package is hidden | +20 |
| No approval required | +25 |
| Duration < 30 days | +10 |
| Has privileged apps (Sentinel, SAP, Admin) | +15 |

High risk (≥70): Red border | Medium (≥40): Orange | Low: Green

---

## Caching

Graph API responses are cached in-memory:
- **Catalogs, Packages, Resources, Policies**: 5 minutes TTL
- **Assignments**: 2 minutes TTL (more frequently changing)
- Click **↺ Refresh** in the toolbar to clear cache and reload

---

## Building for Production

```bash
npm run build
# Output in ./dist/
```

Deploy the `dist/` directory to any static hosting:
- Azure Static Web Apps
- Azure Blob Storage (static website)
- Vercel / Netlify

For Azure Static Web Apps, add your production URL as an additional Redirect URI in the App Registration.

---

## Technology Stack

| Library | Purpose |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite | Build tool |
| `@azure/msal-browser` + `@azure/msal-react` | Microsoft Authentication Library |
| `react-cytoscapejs` + `cytoscape` | Interactive graph visualization |
| `zustand` | State management |
| `axios` | HTTP client for Graph API |
| Syne + JetBrains Mono | Typography |

---

## License

GPL v3
