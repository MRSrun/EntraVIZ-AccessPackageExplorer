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

/// <reference types="vite/client" />

import { Configuration, PublicClientApplication, LogLevel } from '@azure/msal-browser';

// ─── Auth Configuration ────────────────────────────────────────────────────────
// Replace these values with your Azure App Registration details.
// You can also load them from environment variables (VITE_CLIENT_ID, VITE_TENANT_ID)

export const AUTH_CONFIG = {
  clientId: import.meta.env.VITE_CLIENT_ID || 'YOUR_CLIENT_ID',
  tenantId: import.meta.env.VITE_TENANT_ID || 'YOUR_TENANT_ID',
  redirectUri: import.meta.env.VITE_REDIRECT_URI || window.location.origin,
};

// ─── MSAL Configuration ────────────────────────────────────────────────────────
export const msalConfig: Configuration = {
  auth: {
    clientId: AUTH_CONFIG.clientId,
    authority: `https://login.microsoftonline.com/${AUTH_CONFIG.tenantId}`,
    redirectUri: AUTH_CONFIG.redirectUri,
    postLogoutRedirectUri: AUTH_CONFIG.redirectUri,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error('[MSAL]', message);
            break;
          case LogLevel.Warning:
            console.warn('[MSAL]', message);
            break;
          case LogLevel.Info:
            if (import.meta.env.DEV) console.info('[MSAL]', message);
            break;
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
};

// ─── Graph API Scopes ──────────────────────────────────────────────────────────
export const GRAPH_SCOPES = {
  entitlementManagement: 'EntitlementManagement.Read.All',
  groupRead: 'Group.Read.All',
  applicationRead: 'Application.Read.All',
  userRead: 'User.Read',
};

export const LOGIN_SCOPES = [
  GRAPH_SCOPES.userRead,
  GRAPH_SCOPES.entitlementManagement,
  GRAPH_SCOPES.groupRead,
  GRAPH_SCOPES.applicationRead,
];

export const GRAPH_TOKEN_REQUEST = {
  scopes: LOGIN_SCOPES,
};

// ─── MSAL Instance ─────────────────────────────────────────────────────────────
export const msalInstance = new PublicClientApplication(msalConfig);

// Initialize MSAL and handle redirect
export async function initializeMsal(): Promise<void> {
  await msalInstance.initialize();
  const response = await msalInstance.handleRedirectPromise();
  if (response) {
    msalInstance.setActiveAccount(response.account);
  } else {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      msalInstance.setActiveAccount(accounts[0]);
    }
  }
}

// ─── Token Acquisition ─────────────────────────────────────────────────────────
export async function acquireGraphToken(): Promise<string> {
  const account = msalInstance.getActiveAccount();
  if (!account) throw new Error('No active account. Please sign in.');

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...GRAPH_TOKEN_REQUEST,
      account,
    });
    return response.accessToken;
  } catch {
    // Silent token acquisition failed – trigger interactive flow
    const response = await msalInstance.acquireTokenPopup(GRAPH_TOKEN_REQUEST);
    return response.accessToken;
  }
}

export function signIn(): void {
  msalInstance.loginRedirect({
    scopes: LOGIN_SCOPES,
    prompt: 'select_account',
  });
}

export function signOut(): void {
  const account = msalInstance.getActiveAccount();
  msalInstance.logoutRedirect({ account: account ?? undefined });
}
