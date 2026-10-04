import { OAuth2Client } from "google-auth-library";

// Verifies a Google ID token (signature, expiry, audience) and the nonce the
// extension generated for this sign-in attempt.
export function createGoogleVerifier(clientId) {
  if (!clientId) return null;

  const client = new OAuth2Client(clientId);

  return async function verifyGoogleToken({ idToken, nonce }) {
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();

    if (!payload?.sub) throw new Error("Google token has no subject.");
    if (!nonce || payload.nonce !== nonce) throw new Error("Google token nonce mismatch.");

    return {
      sub: payload.sub,
      email: payload.email?.toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: payload.name
    };
  };
}
