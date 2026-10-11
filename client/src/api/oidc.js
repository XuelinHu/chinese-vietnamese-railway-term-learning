import { post } from './http';

export async function startOidc(mode) {
  const result = await post('/auth/oidc/start', {
    mode,
    redirectUri: `${window.location.origin}/oidc/callback`
  });
  window.location.assign(result.authorizeUrl);
}
