import { cache } from 'react'
import { headers } from 'next/headers'
import { auth as clerkAuth, clerkClient } from '@clerk/nextjs/server'
import { ClerkAPIResponseError } from '@clerk/shared'
import { TRPCError } from '@trpc/server'

import { eq } from '@mindworld/db'
import { db } from '@mindworld/db/client'
import { App, OAuthApp } from '@mindworld/db/schema'

import { env } from './env'
import { getAppIdByApiKey } from './router/api-key'

export type Auth =
  // for user auth
  | {
      userId: string
      isAdmin?: never
      appId?: never
    }
  // for admin user auth
  | {
      userId: string
      isAdmin: true
      appId?: never
    }
  // for app user auth
  | {
      userId: string
      isAdmin?: never
      appId: string
    }
  // for app api key auth
  | {
      userId?: never
      isAdmin?: never
      appId: string
    }

export const authForApi = cache(async (): Promise<Auth | Response | undefined> => {
  const heads = await headers()
  const appId = heads.get('X-APP-ID')
  const authType = heads.get('X-AUTH-TYPE')
  const [authScheme, token] = (heads.get('Authorization') ?? '').split(' ')

  if (authScheme === 'Bearer' && token) {
    if (!authType || authType.toUpperCase() === 'API-KEY') {
      const gotAppId = await getAppIdByApiKey({ db } as any, token)
      if (!gotAppId) {
        if (authType) {
          return new Response('Unauthorized', { status: 401 })
        } else {
          // pass through
        }
      } else {
        if (appId && appId !== gotAppId) {
          return new Response('Unauthorized', { status: 401 })
        }
        return {
          appId: gotAppId,
        }
      }
    } else if (authType.toUpperCase() === 'OAUTH') {
      if (!appId) {
        return new Response('Unauthorized', { status: 401 })
      }
      const app = await db.query.OAuthApp.findFirst({
        where: eq(OAuthApp.appId, appId),
      })
      if (!app) {
        return new Response('Unauthorized', { status: 401 })
      }
      // TODO: get from database
      const oauthApp = await getClerkOAuthApp(app.oauthAppId)
      if (!oauthApp?.clientSecret) {
        return new Response('Unauthorized', { status: 401 })
      }
      // Introspect token
      // NOTE: cannot use bearer auth here
      // See: https://github.com/ory/fosite/blob/master/introspection_request_handler.go
      // TODO: cache
      const r = await fetch(oauthApp.tokenIntrospectionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // basic auth
          Authorization: `Basic ${Buffer.from(`${oauthApp.clientId}:${oauthApp.clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          token,
        }),
      })
      if (!r.ok) {
        return new Response('Unauthorized', { status: 401 })
      }
      const info = (await r.json()) as TokenInfo
      if (!info.active) {
        return new Response('Unauthorized', { status: 401 })
      }
      return {
        userId: info.sub,
        appId: app.appId,
      }
    } else {
      return new Response('Unauthorized', { status: 401 })
    }
  }
})

export const authForUser = cache(async (): Promise<Response | undefined> => {
  const heads = await headers()
  const appId = heads.get('X-APP-ID')
  if (appId) {
    const app = await db.query.App.findFirst({
      where: eq(App.id, appId),
    })
    if (!app) {
      return new Response('Unauthorized', { status: 401 })
    }
  }
})

export async function auth(): Promise<Auth> {
  const r = (await authForApi()) as Auth | undefined
  if (r) {
    return r
  }

  const heads = await headers()
  const appId = heads.get('X-APP-ID')

  const auth = authForAdmin(await clerkAuth())

  if (appId) {
    // appId has been checked in `authForUser`
    return {
      userId: auth.userId,
      appId,
    }
  }

  return auth
}

export function authForAdmin(
  auth: Omit<Awaited<ReturnType<typeof clerkAuth>>, 'redirectToSignIn'>,
): Auth {
  const { userId: _userId, orgId, orgRole } = auth
  // the middleware has already checked the user
  const userId = _userId!

  const isAdmin = orgId === env.CLERK_ADMIN_ORGANIZATION_ID && orgRole === 'org:admin'

  return !isAdmin
    ? {
        userId,
      }
    : {
        userId,
        isAdmin,
      }
}

export function checkAppUser(auth: Auth, appId: string) {
  if (!auth.userId) {
    return
  }
  if (auth.appId && auth.appId !== appId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: `Accessing the app is not authorized by the user`,
    })
  }
}

// Get OAuth app from Clerk
export async function getClerkOAuthApp(oauthAppId: string) {
  const client = await clerkClient()
  try {
    return await client.oauthApplications.getOAuthApplication(oauthAppId)
  } catch (error) {
    if (error instanceof ClerkAPIResponseError && error.status === 404) {
      return null
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to get OAuth app from Clerk',
      cause: error,
    })
  }
}

type TokenInfo =
  | {
      active: false
    }
  | {
      active: true
      client_id: string
      iat: number
      scope: string
      sub: string // user id
    }
