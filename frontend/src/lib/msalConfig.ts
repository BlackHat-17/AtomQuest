import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AAD_CLIENT_ID ?? '',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AAD_TENANT_ID ?? 'common'}`,
    redirectUri: import.meta.env.VITE_AAD_REDIRECT_URI ?? window.location.origin,
  },
  cache: { cacheLocation: 'localStorage' },
};

export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
};

// Lazy factory — MSAL requires window.crypto which is only available in secure
// contexts (HTTPS or localhost). Instantiating at module load time crashes the
// app when served over plain HTTP (e.g. a raw EC2 IP). We create the instance
// only when the SSO button is actually clicked.
let _msalInstance: PublicClientApplication | null = null;

export function getMsalInstance(): PublicClientApplication {
  if (!_msalInstance) {
    _msalInstance = new PublicClientApplication(msalConfig);
  }
  return _msalInstance;
}

/** @deprecated Use getMsalInstance() instead to avoid HTTP-context crashes */
export const msalInstance = {
  initialize: () => getMsalInstance().initialize(),
  loginPopup: (req: typeof loginRequest) => getMsalInstance().loginPopup(req),
};
