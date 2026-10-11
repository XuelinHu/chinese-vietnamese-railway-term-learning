import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOidcIdToken } from '../src/auth/oidc.js';

const issuer = 'https://identity.example.test/realms/front';
const clientId = 'railway-term-learning-web';
const nonce = 'a-random-login-nonce-value';

test('OIDC ID token verification checks signature, issuer, audience, client, and nonce', async () => {
  const { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } = await import('jose');
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256' }] });

  async function token(claims = {}, audience = clientId) {
    return new SignJWT({ nonce, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('shared-user-123')
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(privateKey);
  }

  const signed = await token({ azp: clientId });
  assert.deepEqual(await verifyOidcIdToken(signed, nonce, { issuer, clientId, jwks }), { subject: 'shared-user-123' });
  await assert.rejects(verifyOidcIdToken(signed, 'different-nonce-value', { issuer, clientId, jwks }));
  await assert.rejects(verifyOidcIdToken(await token({ azp: 'another-client' }), nonce, { issuer, clientId, jwks }));
  await assert.rejects(verifyOidcIdToken(signed, nonce, { issuer: `${issuer}/wrong`, clientId, jwks }));
  await assert.rejects(verifyOidcIdToken(await token({}, 'another-client'), nonce, { issuer, clientId, jwks }));
});
