import { sql } from '@vercel/postgres'
import { drizzle } from 'drizzle-orm/vercel-postgres'

import * as schema from './schema'

export { schema }

export const db = drizzle({
  client: sql,
  schema,
  casing: 'camelCase',
})

export type DB = typeof db
