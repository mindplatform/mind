import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { VercelPgDatabase } from 'drizzle-orm/vercel-postgres/driver'
import { sql } from '@vercel/postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { drizzle as drizzleVercel } from 'drizzle-orm/vercel-postgres'

import * as schema from './schema'

export type DB = PostgresJsDatabase<typeof schema> | VercelPgDatabase<typeof schema>

export const db: DB = [
  '127.0.0.1',
  'localhost',
].includes(new URL(process.env.POSTGRES_URL!).hostname)
  ? drizzle({
      connection: {
        url: process.env.POSTGRES_URL!,
      },
      schema,
      casing: 'camelCase',
    })
  : drizzleVercel({
      client: sql,
      schema,
      casing: 'camelCase',
    })
