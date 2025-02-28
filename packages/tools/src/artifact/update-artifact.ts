import { tool } from 'ai'
import { z } from 'zod'

import { eq } from '@mindworld/db'
import { db } from '@mindworld/db/client'
import { Artifact } from '@mindworld/db/schema'

import type { Context } from '../context'
import { getArtifactHandler } from './server'

export const updateArtifact = (ctx: Context) =>
  tool({
    description: 'Update a artifact with the given description.',
    parameters: z.object({
      id: z.string().describe('The ID of the artifact to update'),
      description: z.string().describe('The description of changes that need to be made'),
    }),
    execute: async ({ id, description }) => {
      const dataStream = ctx.dataStream!

      const artifact = await db.query.Artifact.findFirst({
        where: eq(Artifact.id, id),
      })
      if (!artifact) {
        return {
          error: 'Artifact not found',
        }
      }

      dataStream.writeData({
        type: 'clear',
        content: artifact.title,
      })

      const artifactHandler = getArtifactHandler(artifact.kind)
      if (!artifactHandler) {
        throw new Error(`No artifact handler found for kind: ${artifact.kind}`)
      }

      await artifactHandler.onUpdateArtifact({
        artifact,
        description,
        ctx,
      })

      dataStream.writeData({ type: 'finish', content: '' })

      return {
        id,
        title: artifact.title,
        kind: artifact.kind,
        content: 'The artifact has been updated successfully.',
      }
    },
  })
