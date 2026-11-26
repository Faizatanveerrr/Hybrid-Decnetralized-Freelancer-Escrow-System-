/**
 * Verifies a Google Sign-In credential (the ID token produced by the "Sign in with Google"
 * button) on the server. Needs GOOGLE_CLIENT_ID (the OAuth 2.0 Web client ID from Google Cloud
 * Console). Nothing about the user is trusted until Google's signature and our client ID
 * (audience) check out.
 */
let verifier = null;
export const setGoogleVerifierForTests = (fn) => { verifier = fn; };

export const googleClientId = () => (process.env.GOOGLE_CLIENT_ID || '').trim();
export const isGoogleConfigured = () => Boolean(googleClientId());

export const verifyGoogleCredential = async (credential) => {
  if (verifier) return verifier(credential);
  if (!isGoogleConfigured()) {
    const e = new Error('Google sign-in is not configured on this server.');
    e.code = 'GOOGLE_NOT_CONFIGURED';
    throw e;
  }
  const { OAuth2Client } = await import('google-auth-library');
  const client = new OAuth2Client(googleClientId());
  const ticket = await client.verifyIdToken({ idToken: credential, audience: googleClientId() });
  const p = ticket.getPayload() || {};
  return { sub: p.sub, email: p.email, emailVerified: Boolean(p.email_verified), name: p.name || '', picture: p.picture || '' };
};
