import type { SQL } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { and, count, desc, eq, gt, lt } from 'drizzle-orm'
import { z } from 'zod'

import type { Transaction } from '@mindworld/db/client'
import {
  CreateMembershipSchema,
  CreateWorkspaceSchema,
  Membership,
  UpdateWorkspaceSchema,
  User,
  Workspace,
} from '@mindworld/db/schema'

import type { Context } from '../trpc'
import { cfg } from '../config'
import { userProtectedProcedure } from '../trpc'

/**
 * Verify if the user is a member of the workspace
 */
export async function verifyWorkspaceMembership(ctx: Context, workspaceId: string) {
  const membership = await ctx.db.query.Membership.findFirst({
    where: and(eq(Membership.workspaceId, workspaceId), eq(Membership.userId, ctx.auth.userId!)),
  })

  if (!membership) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You are not a member of this workspace',
    })
  }

  return membership
}

/**
 * Verify if the user is the owner of the workspace.
 * @param ctx - The context object
 * @param workspaceId - The workspace ID to verify ownership for
 * @throws {TRPCError} If user is not the workspace owner
 */
export async function verifyWorkspaceOwner(ctx: Context, workspaceId: string) {
  const membership = await verifyWorkspaceMembership(ctx, workspaceId)

  if (membership.role !== 'owner') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only workspace owner can perform this action',
    })
  }

  return membership
}

async function createWorkspace(
  ctx: Context,
  tx: Transaction,
  input: z.infer<typeof CreateWorkspaceSchema>,
) {
  // Check if user has reached the maximum number of workspaces
  const userWorkspacesCount = await tx
    .select({ count: count() })
    .from(Membership)
    .where(eq(Membership.userId, ctx.auth.userId!))
    .then((r) => r[0]!.count)

  if (userWorkspacesCount >= cfg.perUser.maxWorkspaces) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `You have reached the maximum limit of ${cfg.perUser.maxWorkspaces} workspaces`,
    })
  }

  const [workspace] = await tx.insert(Workspace).values(input).returning()
  if (!workspace) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create workspace',
    })
  }

  await tx.insert(Membership).values({
    workspaceId: workspace.id,
    userId: ctx.auth.userId!,
    role: 'owner',
  })

  return {
    workspace,
    role: 'owner' as const,
  }
}

export const workspaceRouter = {
  /**
   * List all workspaces for the current user.
   * Only accessible by authenticated users.
   * @param input - Pagination parameters
   * @returns List of workspaces with user's role in each workspace
   */
  list: userProtectedProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/workspaces' } })
    .input(
      z
        .object({
          after: z.string().optional(),
          before: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
        })
        .refine(
          ({ after, before }) => !(after && before),
          'Cannot use both after and before cursors',
        )
        .default({
          limit: 50,
        }),
    )
    .query(async ({ input, ctx }) => {
      const conditions: SQL<unknown>[] = [eq(Membership.userId, ctx.auth.userId)]

      // Add cursor conditions based on pagination direction
      if (input.after) {
        conditions.push(gt(Workspace.id, input.after))
      } else if (input.before) {
        conditions.push(lt(Workspace.id, input.before))
      }

      return await ctx.db.transaction(async (tx) => {
        // Determine if this is backward pagination
        const isBackwardPagination = !!input.before

        // Fetch workspaces with appropriate ordering
        let workspaces
        if (isBackwardPagination) {
          workspaces = await tx
            .select({
              workspace: Workspace,
              role: Membership.role,
            })
            .from(Membership)
            .innerJoin(Workspace, eq(Workspace.id, Membership.workspaceId))
            .where(and(...conditions))
            .orderBy(Workspace.id) // Ascending order
            .limit(input.limit + 1)
        } else {
          workspaces = await tx
            .select({
              workspace: Workspace,
              role: Membership.role,
            })
            .from(Membership)
            .innerJoin(Workspace, eq(Workspace.id, Membership.workspaceId))
            .where(and(...conditions))
            .orderBy(desc(Workspace.id)) // Descending order
            .limit(input.limit + 1)
        }

        const hasMore = workspaces.length > input.limit
        if (hasMore) {
          workspaces.pop()
        }

        // Reverse results for backward pagination to maintain consistent ordering
        workspaces = isBackwardPagination ? workspaces.reverse() : workspaces

        // If no workspaces are found, create a personal workspace
        if (!input.after && !input.before && !workspaces.length) {
          workspaces.push(
            await createWorkspace(ctx, tx, {
              name: 'My workspace',
            }),
          )
        }

        // Get first and last workspace IDs
        const first = workspaces.at(0)?.workspace.id
        const last = workspaces.at(workspaces.length - 1)?.workspace.id

        return {
          workspaces,
          hasMore,
          first,
          last,
        }
      })
    }),

  /**
   * Get a single workspace by ID.
   * Only accessible by authenticated users who are members of the workspace.
   * @param input - The workspace ID
   * @returns The workspace and user's role if found
   * @throws {TRPCError} If workspace not found or user is not a member
   */
  get: userProtectedProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/workspaces/{id}' } })
    .input(
      z.object({
        id: z.string().min(32),
      }),
    )
    .query(async ({ input, ctx }) => {
      const workspace = await ctx.db
        .select({
          workspace: Workspace,
          role: Membership.role,
        })
        .from(Membership)
        .innerJoin(Workspace, eq(Workspace.id, Membership.workspaceId))
        .where(and(eq(Membership.workspaceId, input.id), eq(Membership.userId, ctx.auth.userId)))
        .limit(1)
        .then((rows) => rows[0])

      if (!workspace) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workspace not found',
        })
      }

      return workspace
    }),

  create: userProtectedProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/workspaces' } })
    .input(CreateWorkspaceSchema)
    .mutation(async ({ input, ctx }) => {
      return await ctx.db.transaction(async (tx) => {
        return createWorkspace(ctx, tx, input)
      })
    }),

  update: userProtectedProcedure
    .meta({ openapi: { method: 'PATCH', path: '/v1/workspaces/{id}' } })
    .input(UpdateWorkspaceSchema)
    .mutation(async ({ input, ctx }) => {
      const memberships = await ctx.db
        .select({ role: Membership.role })
        .from(Membership)
        .where(and(eq(Membership.workspaceId, input.id), eq(Membership.userId, ctx.auth.userId)))
        .limit(1)

      if (memberships[0]?.role !== 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only owner can update workspace',
        })
      }

      const [workspace] = await ctx.db
        .update(Workspace)
        .set({ name: input.name })
        .where(eq(Workspace.id, input.id))
        .returning()

      if (!workspace) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update workspace',
        })
      }

      return {
        workspace,
        role: 'owner' as const,
      }
    }),

  /**
   * Delete a workspace.
   * Only accessible by the workspace owner.
   * Deletes all memberships before deleting the workspace.
   * @param input - The workspace ID
   * @throws {TRPCError} If user is not the workspace owner
   */
  delete: userProtectedProcedure
    .meta({ openapi: { method: 'DELETE', path: '/v1/workspaces/{id}' } })
    .input(
      z.object({
        id: z.string().min(32),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return await ctx.db.transaction(async (tx) => {
        const memberships = await tx
          .select({ role: Membership.role })
          .from(Membership)
          .where(and(eq(Membership.workspaceId, input.id), eq(Membership.userId, ctx.auth.userId)))
          .limit(1)

        if (memberships[0]?.role !== 'owner') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only owner can delete workspace',
          })
        }

        // Delete all memberships first
        await tx.delete(Membership).where(eq(Membership.workspaceId, input.id))

        // Then delete the workspace
        await tx.delete(Workspace).where(eq(Workspace.id, input.id))
      })
    }),

  /**
   * List all members of a workspace.
   * Only accessible by workspace members.
   * @param input - The workspace ID and pagination parameters
   * @returns List of workspace members with their roles
   */
  listMembers: userProtectedProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/workspaces/{workspaceId}/members' } })
    .input(
      z
        .object({
          workspaceId: z.string().min(32),
          after: z.string().optional(),
          before: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
        })
        .refine(
          ({ after, before }) => !(after && before),
          'Cannot use both after and before cursors',
        ),
    )
    .query(async ({ input, ctx }) => {
      // Check if the current user is a member of the workspace
      const currentMembership = await ctx.db.query.Membership.findFirst({
        where: (membership, { and, eq }) =>
          and(
            eq(membership.workspaceId, input.workspaceId),
            eq(membership.userId, ctx.auth.userId),
          ),
      })

      if (!currentMembership) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workspace not found',
        })
      }

      const conditions: SQL<unknown>[] = [eq(Membership.workspaceId, input.workspaceId)]

      // Add cursor conditions based on pagination direction
      if (input.after) {
        conditions.push(gt(User.id, input.after))
      } else if (input.before) {
        conditions.push(lt(User.id, input.before))
      }

      // Determine if this is backward pagination
      const isBackwardPagination = !!input.before

      // Fetch members with appropriate ordering
      let members
      if (isBackwardPagination) {
        members = (
          await ctx.db
            .select({
              user: User,
              role: Membership.role,
            })
            .from(Membership)
            .innerJoin(User, eq(User.id, Membership.userId))
            .where(and(...conditions))
            .orderBy(User.id) // Ascending order by User ID
            .limit(input.limit + 1)
        ).map((member) => ({ ...member, user: filteredUser(member.user) }))
      } else {
        members = (
          await ctx.db
            .select({
              user: User,
              role: Membership.role,
            })
            .from(Membership)
            .innerJoin(User, eq(User.id, Membership.userId))
            .where(and(...conditions))
            .orderBy(desc(User.id)) // Descending order by User ID
            .limit(input.limit + 1)
        ).map((member) => ({ ...member, user: filteredUser(member.user) }))
      }

      const hasMore = members.length > input.limit
      if (hasMore) {
        members.pop()
      }

      // Reverse results for backward pagination to maintain consistent ordering
      members = isBackwardPagination ? members.reverse() : members

      // Get first and last member IDs
      const first = members.length > 0 ? members[0]?.user?.id : undefined
      const last = members.length > 0 ? members[members.length - 1]?.user?.id : undefined

      return {
        members,
        hasMore,
        first,
        last,
      }
    }),

  /**
   * Get a specific member of a workspace.
   * Only accessible by workspace members.
   * @param input - Object containing workspaceId and userId
   * @returns The member's user info and role if found
   * @throws {TRPCError} If member not found or user doesn't have access
   */
  getMember: userProtectedProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/workspaces/{workspaceId}/members/{userId}' } })
    .input(
      z.object({
        workspaceId: z.string().min(32),
        userId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      // Check if the current user is a member of the workspace
      const currentMembership = await ctx.db.query.Membership.findFirst({
        where: (membership, { and, eq }) =>
          and(
            eq(membership.workspaceId, input.workspaceId),
            eq(membership.userId, ctx.auth.userId),
          ),
      })

      if (!currentMembership) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workspace not found',
        })
      }

      const [member] = await ctx.db
        .select({
          user: User,
          role: Membership.role,
        })
        .from(Membership)
        .innerJoin(User, eq(User.id, Membership.userId))
        .where(
          and(eq(Membership.workspaceId, input.workspaceId), eq(Membership.userId, input.userId)),
        )
        .limit(1)

      if (!member) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Member not found',
        })
      }

      return {
        ...member,
        user: filteredUser(member.user),
      }
    }),

  addMember: userProtectedProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/workspaces/{workspaceId}/members' } })
    .input(CreateMembershipSchema)
    .mutation(async ({ input, ctx }) => {
      const memberships = await ctx.db
        .select({ role: Membership.role })
        .from(Membership)
        .where(
          and(
            eq(Membership.workspaceId, input.workspaceId),
            eq(Membership.userId, ctx.auth.userId),
          ),
        )
        .limit(1)

      if (memberships[0]?.role !== 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only owner can add members',
        })
      }

      // Check if workspace has reached the maximum number of members
      const membersCount = await ctx.db
        .select({ count: count() })
        .from(Membership)
        .where(eq(Membership.workspaceId, input.workspaceId))
        .then((r) => r[0]!.count)

      if (membersCount >= cfg.perWorkspace.maxMembers) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Workspace has reached the maximum limit of ${cfg.perWorkspace.maxMembers} members`,
        })
      }

      // Check if the user being added has reached their maximum number of workspaces
      const userWorkspacesCount = await ctx.db
        .select({ count: count() })
        .from(Membership)
        .where(eq(Membership.userId, input.userId))
        .then((r) => r[0]!.count)

      if (userWorkspacesCount >= cfg.perUser.maxWorkspaces) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `User has reached the maximum limit of ${cfg.perUser.maxWorkspaces} workspaces`,
        })
      }

      const user = await ctx.db.query.User.findFirst({
        where: eq(User.id, input.userId),
      })

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        })
      }

      if (input.role !== 'member') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Role can only be "member"',
        })
      }

      const [membership] = await ctx.db.insert(Membership).values(input).returning()

      if (!membership) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add member',
        })
      }

      return {
        user: filteredUser(user),
        role: membership.role,
      }
    }),

  deleteMember: userProtectedProcedure
    .meta({ openapi: { method: 'DELETE', path: '/v1/workspaces/{workspaceId}/members/{userId}' } })
    .input(
      z.object({
        workspaceId: z.string().min(32),
        userId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const memberships = await ctx.db
        .select({ role: Membership.role })
        .from(Membership)
        .where(
          and(
            eq(Membership.workspaceId, input.workspaceId),
            eq(Membership.userId, ctx.auth.userId),
          ),
        )
        .limit(1)

      if (memberships[0]?.role !== 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only owner can delete members',
        })
      }

      // Owner cannot be deleted
      if (input.userId === ctx.auth.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Owner cannot be deleted',
        })
      }

      await ctx.db
        .delete(Membership)
        .where(
          and(eq(Membership.workspaceId, input.workspaceId), eq(Membership.userId, input.userId)),
        )
    }),

  transferOwner: userProtectedProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/workspaces/{workspaceId}/transfer-ownership' } })
    .input(
      z.object({
        workspaceId: z.string().min(32),
        userId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await ctx.db.transaction(async (tx) => {
        // Check if current user is the owner
        const currentMembership = await tx
          .select()
          .from(Membership)
          .where(
            and(
              eq(Membership.workspaceId, input.workspaceId),
              eq(Membership.userId, ctx.auth.userId),
            ),
          )
          .limit(1)

        if (currentMembership[0]?.role !== 'owner') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only owner can transfer ownership',
          })
        }

        // Check if new owner exists and is a member
        const newOwnerMembership = await tx
          .select()
          .from(Membership)
          .where(
            and(eq(Membership.workspaceId, input.workspaceId), eq(Membership.userId, input.userId)),
          )
          .limit(1)

        if (!newOwnerMembership[0]) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'New owner must be an existing member',
          })
        }

        // Update current owner to member
        await tx
          .update(Membership)
          .set({ role: 'member' })
          .where(
            and(
              eq(Membership.workspaceId, input.workspaceId),
              eq(Membership.userId, ctx.auth.userId),
            ),
          )

        // Update new owner
        await tx
          .update(Membership)
          .set({ role: 'owner' })
          .where(
            and(eq(Membership.workspaceId, input.workspaceId), eq(Membership.userId, input.userId)),
          )
      })
    }),
}

function filteredUser(user: User) {
  const info = user.info
  return {
    ...user,
    info: {
      username: info.username!, // this requires enabling "Users can set usernames to their account" in Clerk
      firstName: info.firstName,
      lastName: info.lastName,
      imageUrl: info.imageUrl,
    },
  }
}
