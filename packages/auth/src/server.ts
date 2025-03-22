import type { LiteralUnion, Models } from 'better-auth'
import { createRandomStringGenerator } from '@better-auth/utils/random'
import { betterAuth } from 'better-auth'
import { emailHarmony } from 'better-auth-harmony'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import {
  admin,
  apiKey,
  bearer,
  genericOAuth,
  jwt,
  oidcProvider,
  openAPI,
  organization,
  twoFactor,
  username,
} from 'better-auth/plugins'
import { passkey } from 'better-auth/plugins/passkey'

import { db } from '@mindworld/db/client'
import { redis } from '@mindworld/db/redis'
import { generateId } from '@mindworld/shared'

import { env } from './env'

export const auth = betterAuth({
  appName: 'Mind',
  baseURL: getBaseUrl(),
  basePath: '/api/auth',
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  secondaryStorage: {
    get: async (key) => {
      const value = await redis.get<string>(key)
      return value ? value : null
    },
    set: async (key, value, ttl) => {
      if (ttl) await redis.set(key, value, { ex: ttl })
      else await redis.set(key, value)
    },
    delete: async (key) => {
      await redis.del(key)
    },
  },
  advanced: {
    generateId: ({ model }: { model: LiteralUnion<Models, string> }) =>
      generateId(modelPrefix(model)),
  },
  plugins: [
    nextCookies(),
    bearer(),
    jwt(),
    passkey(),
    twoFactor(),
    username(),
    admin(),
    organization(),
    genericOAuth({
      config: [],
    }),
    oidcProvider({
      loginPage: '/sign-in',
      consentPage: '/path/to/consent/page',
      metadata: {
        issuer: 'https://your-domain.com',
        authorization_endpoint: '/custom/oauth2/authorize',
        token_endpoint: '/custom/oauth2/token',
        // ...other custom metadata
      },
    }),
    apiKey({
      apiKeyHeaders: 'X-API-KEY',
      defaultPrefix: 'sk_',
      minimumNameLength: 0,
      maximumNameLength: 64,
      enableMetadata: true,
      // Only applies to the verification process for a given API key
      rateLimit: {
        enabled: true,
        timeWindow: 1000 * 60, // 1 minute
        maxRequests: 100,
      },
    }),
    openAPI(),
    emailHarmony(),
  ],
})

export function getBaseUrl() {
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`
  // eslint-disable-next-line no-restricted-properties
  return `http://localhost:${process.env.PORT ?? 3000}`
}

function modelPrefix(model: LiteralUnion<Models, string>) {
  switch (model) {
    case 'user':
      return 'user'
    case 'account':
      return 'acc'
    case 'session':
      return 'ses'
    case 'verification':
      return 'vrf'
    case 'rate-limit':
      return 'rl'
    case 'organization':
      return 'org'
    case 'member':
      return 'member'
    case 'invitation':
      return 'invite'
    case 'jwks':
      return 'jwks'
    case 'passkey':
      return 'passkey'
    case 'two-factor':
      return '2fa'
    default:
      return model.slice(0, 6)
  }
}

export const generateRandomString = createRandomStringGenerator('a-z', '0-9', 'A-Z', '-_')
