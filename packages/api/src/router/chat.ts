import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { and, count, desc, eq, gte } from '@mindworld/db'
import {
  Chat,
  CreateChatSchema,
  CreateMessageSchema,
  CreateMessageVoteSchema,
  Message,
  MessageVote,
  UpdateChatSchema,
} from '@mindworld/db/schema'

import type { Context } from '../trpc'
import { protectedProcedure } from '../trpc'
import { getAppById } from './app'

/**
 * Get a chat by ID.
 * @param ctx - The context object
 * @param id - The chat ID
 * @returns The chat if found
 * @throws {TRPCError} If chat not found
 */
async function getChatById(ctx: Context, id: string) {
  const chat = await ctx.db.query.Chat.findFirst({
    where: eq(Chat.id, id),
  })

  if (!chat) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Chat with id ${id} not found`,
    })
  }

  return chat
}

/**
 * Get a message by ID.
 * @param ctx - The context object
 * @param id - The message ID
 * @returns The message if found
 * @throws {TRPCError} If message not found
 */
async function getMessageById(ctx: Context, id: string) {
  const message = await ctx.db.query.Message.findFirst({
    where: eq(Message.id, id),
  })

  if (!message) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Message with id ${id} not found`,
    })
  }

  return message
}

export const chatRouter = {
  /**
   * List all chats for an app.
   * Only accessible by authenticated users.
   * @param input - Object containing app ID and pagination parameters
   * @returns List of chats with total count
   */
  listByApp: protectedProcedure
    .input(
      z.object({
        appId: z.string().uuid(),
        offset: z.number().min(0).default(0),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await getAppById(ctx, input.appId)

      const counts = await ctx.db
        .select({ count: count() })
        .from(Chat)
        .where(eq(Chat.appId, input.appId))

      if (!counts[0]) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get chat count',
        })
      }

      const chats = await ctx.db.query.Chat.findMany({
        where: eq(Chat.appId, input.appId),
        orderBy: desc(Chat.updatedAt),
        offset: input.offset,
        limit: input.limit,
      })

      return {
        chats,
        total: counts[0].count,
        offset: input.offset,
        limit: input.limit,
      }
    }),

  /**
   * Get a single chat by ID.
   * Only accessible by authenticated users.
   * @param input - Object containing chat ID
   * @returns The chat if found
   */
  byId: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const chat = await getChatById(ctx, input.id)
      return { chat }
    }),

  /**
   * Create a new chat.
   * Only accessible by authenticated users.
   * @param input - The chat data following the {@link CreateChatSchema}
   * @returns The created chat
   */
  create: protectedProcedure.input(CreateChatSchema).mutation(async ({ ctx, input }) => {
    await getAppById(ctx, input.appId)

    const [chat] = await ctx.db.insert(Chat).values(input).returning()

    if (!chat) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create chat',
      })
    }

    return { chat }
  }),

  /**
   * Update an existing chat.
   * Only accessible by authenticated users.
   * @param input - The chat data following the {@link UpdateChatSchema}
   * @returns The updated chat
   */
  update: protectedProcedure.input(UpdateChatSchema).mutation(async ({ ctx, input }) => {
    const { id, ...update } = input
    const chat = await getChatById(ctx, id)

    if (update.metadata) {
      update.metadata = {
        ...chat.metadata,
        ...update.metadata,
      }
    }

    const [updatedChat] = await ctx.db.update(Chat).set(update).where(eq(Chat.id, id)).returning()

    if (!updatedChat) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update chat',
      })
    }

    return { chat: updatedChat }
  }),

  /**
   * List all messages in a chat.
   * Only accessible by authenticated users.
   * @param input - Object containing chat ID and pagination parameters
   * @returns List of messages with total count
   */
  listMessages: protectedProcedure
    .input(
      z.object({
        chatId: z.string().uuid(),
        offset: z.number().min(0).default(0),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await getChatById(ctx, input.chatId)

      const counts = await ctx.db
        .select({ count: count() })
        .from(Message)
        .where(eq(Message.chatId, input.chatId))

      if (!counts[0]) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get message count',
        })
      }

      const messages = await ctx.db.query.Message.findMany({
        where: eq(Message.chatId, input.chatId),
        orderBy: desc(Message.index),
        offset: input.offset,
        limit: input.limit,
      })

      return {
        messages,
        total: counts[0].count,
        offset: input.offset,
        limit: input.limit,
      }
    }),

  /**
   * Get a single message by ID.
   * Only accessible by authenticated users.
   * @param input - Object containing message ID
   * @returns The message if found
   */
  getMessage: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const message = await getMessageById(ctx, input.id)
      return { message }
    }),

  /**
   * Create a new message in a chat.
   * Only accessible by authenticated users.
   * @param input - The message data following the {@link CreateMessageSchema}
   * @returns The created message
   */
  createMessage: protectedProcedure.input(CreateMessageSchema).mutation(async ({ ctx, input }) => {
    await getChatById(ctx, input.chatId)

    // TODO
    // @ts-ignore
    const [message] = await ctx.db.insert(Message).values(input).returning()

    if (!message) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create message',
      })
    }

    return { message }
  }),

  /**
   * Delete all messages in a chat that were created after the specified message.
   * Only accessible by authenticated users.
   * @param input - Object containing message ID
   */
  deleteTrailingMessages: protectedProcedure
    .input(
      z.object({
        messageId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const message = await getMessageById(ctx, input.messageId)

      await ctx.db
        .delete(Message)
        .where(and(eq(Message.chatId, message.chatId), gte(Message.createdAt, message.createdAt)))

      return { success: true }
    }),

  /**
   * Vote on a message.
   * Only accessible by authenticated users.
   * @param input - The vote data following the {@link CreateMessageVoteSchema}
   * @returns The created or updated vote
   */
  voteMessage: protectedProcedure
    .input(CreateMessageVoteSchema)
    .mutation(async ({ ctx, input }) => {
      await getMessageById(ctx, input.messageId)

      const [vote] = await ctx.db
        .insert(MessageVote)
        .values(input)
        .onConflictDoUpdate({
          target: [MessageVote.chatId, MessageVote.messageId, MessageVote.userId],
          set: { isUpvoted: input.isUpvoted },
        })
        .returning()

      if (!vote) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create or update vote',
        })
      }

      return { vote }
    }),
}
