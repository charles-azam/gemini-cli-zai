/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HybridTokenStorage } from '../mcp/token-storage/hybrid-token-storage.js';
import type { OAuthCredentials } from '../mcp/token-storage/types.js';
import { debugLogger } from '../utils/debugLogger.js';
import { AuthType } from './authTypes.js';

const KEYCHAIN_SERVICE_NAME = 'gemini-cli-api-key';
const LEGACY_DEFAULT_ENTRY = 'default-api-key';
const API_KEY_ENTRIES: Record<AuthType, string> = {
  [AuthType.USE_GEMINI]: 'gemini-api-key',
  [AuthType.USE_GLM]: 'glm-api-key',
  [AuthType.LOGIN_WITH_GOOGLE]: 'oauth-personal',
  [AuthType.USE_VERTEX_AI]: 'vertex-ai',
  [AuthType.LEGACY_CLOUD_SHELL]: 'cloud-shell',
  [AuthType.COMPUTE_ADC]: 'compute-default-credentials',
};

const storage = new HybridTokenStorage(KEYCHAIN_SERVICE_NAME);

function getEntryKey(authType: AuthType = AuthType.USE_GEMINI): string {
  return API_KEY_ENTRIES[authType] ?? API_KEY_ENTRIES[AuthType.USE_GEMINI];
}

/**
 * Load cached API key
 */
export async function loadApiKey(
  authType: AuthType = AuthType.USE_GEMINI,
): Promise<string | null> {
  try {
    const entryKey = getEntryKey(authType);
    const credentials = await storage.getCredentials(entryKey);

    if (credentials?.token?.accessToken) {
      return credentials.token.accessToken;
    }

    if (authType === AuthType.USE_GEMINI) {
      const legacy = await storage.getCredentials(LEGACY_DEFAULT_ENTRY);
      if (legacy?.token?.accessToken) {
        return legacy.token.accessToken;
      }
    }

    return null;
  } catch (error: unknown) {
    // Log other errors but don't crash, just return null so user can re-enter key
    debugLogger.error('Failed to load API key from storage:', error);
    return null;
  }
}

/**
 * Save API key
 */
export async function saveApiKey(
  apiKey: string | null | undefined,
  authType: AuthType = AuthType.USE_GEMINI,
): Promise<void> {
  if (!apiKey || apiKey.trim() === '') {
    try {
      await storage.deleteCredentials(getEntryKey(authType));
      if (authType === AuthType.USE_GEMINI) {
        await storage.deleteCredentials(LEGACY_DEFAULT_ENTRY);
      }
    } catch (error: unknown) {
      // Ignore errors when deleting, as it might not exist
      debugLogger.warn('Failed to delete API key from storage:', error);
    }
    return;
  }

  // Wrap API key in OAuthCredentials format as required by HybridTokenStorage
  const credentials: OAuthCredentials = {
    serverName: getEntryKey(authType),
    token: {
      accessToken: apiKey,
      tokenType: 'ApiKey',
    },
    updatedAt: Date.now(),
  };

  await storage.setCredentials(credentials);
}

/**
 * Clear cached API key
 */
export async function clearApiKey(
  authType: AuthType = AuthType.USE_GEMINI,
): Promise<void> {
  try {
    await storage.deleteCredentials(getEntryKey(authType));
    if (authType === AuthType.USE_GEMINI) {
      await storage.deleteCredentials(LEGACY_DEFAULT_ENTRY);
    }
  } catch (error: unknown) {
    debugLogger.error('Failed to clear API key from storage:', error);
  }
}
