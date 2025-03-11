import { cache } from 'react'
import { headers } from 'next/headers'
import { auth as clerkAuth } from '@clerk/nextjs/server'
import { TRPCError } from '@trpc/server'

import { eq } from '@mindworld/db'
import { db } from '@mindworld/db/client'
import { App, OAuthApp } from '@mindworld/db/schema'

import { env } from '@/env'
import { getClerkOAuthApp } from './router/oauth-app'

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

export const authForApi = cache(async (): Promise<Auth | Response> => {
  const heads = await headers()
  const appId = heads.get('X-APP-ID')
  const authType = heads.get('X-AUTH-TYPE')
  const [authScheme, token] = (heads.get('Authorization') ?? '').split(' ')

  if (authScheme === 'Bearer' && token) {
    if (!authType || authType.toUpperCase() === 'API-KEY') {
      // TODO: get app by api key
      const app: App | undefined = {} as App
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!app) {
        if (authType) {
          return new Response('Unauthorized', { status: 401 })
        } else {
          // pass through
        }
      } else {
        if (appId && appId !== app.id) {
          return new Response('Unauthorized', { status: 401 })
        }
        return {
          appId: app.id,
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
      const oauthApp = await getClerkOAuthApp(app.oauthAppId)
      if (!oauthApp?.clientSecret) {
        return new Response('Unauthorized', { status: 401 })
      }
      // Introspect token
      // NOTE: cannot use bearer auth here
      // See: https://github.com/ory/fosite/blob/master/introspection_request_handler.go
      const r = await fetch('', {
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

  const { userId, orgId, orgRole } = await clerkAuth()
  if (userId) {
    const isAdmin = orgId === env.CLERK_ADMIN_ORGANIZATION_ID && orgRole === 'org:admin'

    if (appId) {
      const app = await db.query.App.findFirst({
        where: eq(App.id, appId),
      })
      if (!app) {
        return new Response('Unauthorized', { status: 401 })
      }
      return {
        userId,
        appId,
      }
    }

    return !isAdmin
      ? {
          userId,
        }
      : {
          userId,
          isAdmin,
        }
  }

  return new Response('Unauthorized', { status: 401 })
})

export async function auth(): Promise<Auth> {
  return (await authForApi()) as Auth
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
