import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import type { SQL } from '@mindworld/db'
import { and, asc, desc, eq, gt, lt } from '@mindworld/db'
import { Artifact, ArtifactSuggestion, Chat } from '@mindworld/db/schema'

import type { Context } from '../trpc'
import { protectedProcedure } from '../trpc'

async function verifyUserChat(ctx: Context, chatId: string) {
  const chat = await ctx.db.query.Chat.findFirst({
    where: eq(Chat.id, chatId),
  })

  if (chat?.userId !== ctx.auth.userId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Chat with id ${chatId} not found`,
    })
  }

  return chat
}

async function verifyUserArtifact(ctx: Context, artifactId: string) {
  const artifact = await ctx.db.query.Artifact.findFirst({
    where: eq(Artifact.id, artifactId),
    with: {
      chat: true,
    },
  })

  if (artifact?.userId !== ctx.auth.userId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Artifact with id ${artifactId} not found`,
    })
  }

  return artifact
}

export const artifactRouter = {
  /**
   * List all artifacts (of only latest version) for a chat.
   * Only accessible by authenticated users.
   */
  listByChat: protectedProcedure
    .input(
      z.object({
        chatId: z.string().min(32),
        after: z.string().optional(),
        before: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await verifyUserChat(ctx, input.chatId)

      const conditions: SQL<unknown>[] = [eq(Artifact.chatId, input.chatId)]

      if (input.after) {
        conditions.push(gt(Artifact.id, input.after))
      }
      if (input.before) {
        conditions.push(lt(Artifact.id, input.before))
      }

      const artifacts = await ctx.db
        .selectDistinctOn([Artifact.id])
        .from(Artifact)
        .where(and(...conditions))
        .orderBy(asc(Artifact.id), desc(Artifact.version))
        .limit(input.limit + 1)

      const hasMore = artifacts.length > input.limit
      if (hasMore) {
        artifacts.pop()
      }

      return {
        artifacts,
        hasMore,
        limit: input.limit,
      }
    }),

  /**
   * List all versions of an artifact by ID.
   * Only accessible by authenticated users.
   */
  listVersionsById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        after: z.number().optional(),
        before: z.number().optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await verifyUserArtifact(ctx, input.id)

      const conditions: SQL<unknown>[] = [eq(Artifact.id, input.id)]

      if (input.after) {
        conditions.push(gt(Artifact.version, input.after))
      }
      if (input.before) {
        conditions.push(lt(Artifact.version, input.before))
      }

      const versions = await ctx.db.query.Artifact.findMany({
        where: and(...conditions),
        orderBy: desc(Artifact.version),
        limit: input.limit + 1,
      })

      const hasMore = versions.length > input.limit
      if (hasMore) {
        versions.pop()
      }

      if (!versions.length) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Artifact with id ${input.id} not found`,
        })
      }

      return {
        versions,
        hasMore,
        limit: input.limit,
      }
    }),

  /**
   * Delete all versions of an artifact after the specified version.
   * Only accessible by authenticated users.
   */
  deleteVersionsByIdAfterVersion: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        after: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyUserArtifact(ctx, input.id)

      return await ctx.db.transaction(async (tx) => {
        // Delete related suggestions first
        await tx
          .delete(ArtifactSuggestion)
          .where(
            and(
              eq(ArtifactSuggestion.artifactId, input.id),
              gt(ArtifactSuggestion.artifactVersion, input.after),
            ),
          )

        // Then delete artifact versions
        await tx
          .delete(Artifact)
          .where(and(eq(Artifact.id, input.id), gt(Artifact.version, input.after)))
      })
    }),

  /**
   * List suggestions for an artifact.
   * Only accessible by authenticated users.
   */
  listSuggestions: protectedProcedure
    .input(
      z.object({
        artifactId: z.string(),
        artifactVersion: z.number().optional(),
        after: z.string().optional(),
        before: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await verifyUserArtifact(ctx, input.artifactId)

      const conditions: SQL<unknown>[] = [
        eq(ArtifactSuggestion.artifactId, input.artifactId),
      ]
      if (input.artifactVersion) {
        conditions.push(eq(ArtifactSuggestion.artifactVersion, input.artifactVersion))
      }

      if (input.after) {
        conditions.push(gt(ArtifactSuggestion.id, input.after))
      }
      if (input.before) {
        conditions.push(lt(ArtifactSuggestion.id, input.before))
      }

      const suggestions = await ctx.db.query.ArtifactSuggestion.findMany({
        where: and(...conditions),
        orderBy: asc(ArtifactSuggestion.id),
        limit: input.limit + 1,
      })

      const hasMore = suggestions.length > input.limit
      if (hasMore) {
        suggestions.pop()
      }

      return {
        suggestions,
        hasMore,
        limit: input.limit,
      }
    }),
}
