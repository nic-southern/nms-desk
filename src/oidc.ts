import * as client from "openid-client"

import type { AppConfig } from "./config.ts"
import type { Actor } from "./types.ts"

export type OidcConfig = client.Configuration

export async function discoverOidc(config: AppConfig): Promise<OidcConfig> {
  return client.discovery(
    new URL(config.oidcIssuer),
    config.oidcClientId,
    config.oidcClientSecret
  )
}

export function callbackUrl(publicUrl: string, oauth2 = false) {
  return oauth2
    ? `${publicUrl}/api/auth/oauth2/callback/tickets`
    : `${publicUrl}/api/auth/callback/tickets`
}

export async function buildLoginUrl(input: {
  oidc: OidcConfig
  publicUrl: string
  scopes: string
  state: string
  nonce: string
  verifier: string
}) {
  const challenge = await client.calculatePKCECodeChallenge(input.verifier)
  return client.buildAuthorizationUrl(input.oidc, {
    redirect_uri: callbackUrl(input.publicUrl),
    scope: input.scopes,
    state: input.state,
    nonce: input.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  })
}

export async function finishLogin(input: {
  oidc: OidcConfig
  publicUrl: string
  currentUrl: URL
  verifier: string
  state: string
  nonce: string
}): Promise<{ actor: Actor; idToken?: string }> {
  const tokens = await client.authorizationCodeGrant(input.oidc, input.currentUrl, {
    pkceCodeVerifier: input.verifier,
    expectedState: input.state,
    expectedNonce: input.nonce,
  })
  const claims = tokens.claims()
  if (!claims) {
    throw new Error("Sign-in did not return an identity")
  }
  const email =
    typeof claims.email === "string" && claims.email.trim().length > 0
      ? claims.email
      : typeof claims.preferred_username === "string"
        ? claims.preferred_username
        : ""
  const name =
    typeof claims.name === "string" && claims.name.trim().length > 0
      ? claims.name
      : email || "Signed-in user"
  if (!claims.sub) {
    throw new Error("Sign-in did not return a user")
  }
  return {
    actor: { sub: String(claims.sub), email, name },
    idToken: tokens.id_token,
  }
}

export function buildLogoutUrl(input: {
  oidc: OidcConfig
  publicUrl: string
  idToken?: string
}) {
  const params: Record<string, string> = {
    post_logout_redirect_uri: input.publicUrl,
  }
  if (input.idToken) params.id_token_hint = input.idToken
  return client.buildEndSessionUrl(input.oidc, params)
}

export function publicRequestUrl(publicUrl: string, requestUrl: string) {
  const incoming = new URL(requestUrl)
  const base = new URL(publicUrl)
  incoming.protocol = base.protocol
  incoming.host = base.host
  return incoming
}
