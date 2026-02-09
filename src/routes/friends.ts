import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { users, friendships } from '../db/schema';
import { eq, and, or } from 'drizzle-orm';
import { z } from 'zod';

const errorSchema = {
    type: 'object',
    properties: { error: { type: 'string' }, details: { type: 'object', nullable: true } }
};

const userItem = {
    type: 'object',
    properties: {
        id: { type: 'integer' },
        username: { type: 'string' },
        avatarUrl: { type: 'string', nullable: true },
        steamId: { type: 'string', nullable: true },
        discordId: { type: 'string', nullable: true }
    }
};

export async function friendRoutes(app: FastifyInstance) {
    const paginationSchema = z.object({
        page: z.string().regex(/^\d+$/).default('1').transform(Number),
        limit: z.string().regex(/^\d+$/).default('20').transform(Number),
    });

    app.post('/friends/request', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Friends'],
            security: [{ apiKey: [] }],
            body: {
                type: 'object',
                required: ['targetUserId'],
                properties: { targetUserId: { type: 'integer' } }
            },
            response: {
                200: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
                400: errorSchema,
                409: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const schema = z.object({ targetUserId: z.number().int() });
        const parse = schema.safeParse(req.body);
        if (!parse.success) return reply.code(400).send(parse.error);
        const { targetUserId } = parse.data;
        const requesterId = req.user.id;
        if (requesterId === targetUserId) return reply.code(400).send({ error: "Self request" });

        try {
            const existing = await db.query.friendships.findFirst({
                where: or(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, targetUserId)), and(eq(friendships.requesterId, targetUserId), eq(friendships.addresseeId, requesterId)))
            });
            if (existing) return reply.code(409).send({ error: "Relationship exists" });
            await db.insert(friendships).values({ requesterId, addresseeId: targetUserId, status: 'pending' });
            return reply.send({ success: true, message: "Friend request sent" });
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.post('/friends/accept', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Friends'],
            security: [{ apiKey: [] }],
            body: {
                type: 'object',
                required: ['requesterId'],
                properties: { requesterId: { type: 'integer' } }
            },
            response: {
                200: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
                400: errorSchema,
                404: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const schema = z.object({ requesterId: z.number().int() });
        const parse = schema.safeParse(req.body);
        if (!parse.success) return reply.code(400).send(parse.error);
        const { requesterId } = parse.data;
        const userId = req.user.id;
        try {
            const res = await db.update(friendships).set({ status: 'accepted' })
                .where(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, userId), eq(friendships.status, 'pending'))).returning();
            if (res.length === 0) return reply.code(404).send({ error: "No pending request" });
            return reply.send({ success: true, message: "Friend request accepted" });
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.get('/friends', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Friends'],
            security: [{ apiKey: [] }],
            querystring: {
                type: 'object',
                properties: { page: { type: 'string' }, limit: { type: 'string' } }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        data: { type: 'array', items: userItem },
                        meta: { type: 'object', properties: { totalItems: { type: 'integer' }, totalPages: { type: 'integer' }, currentPage: { type: 'integer' }, itemsPerPage: { type: 'integer' } } }
                    }
                },
                400: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const parse = paginationSchema.safeParse(req.query);
        if (!parse.success) return reply.code(400).send({ error: "Invalid pagination" });
        const { page, limit } = parse.data;
        const offset = (page - 1) * limit;
        const userId = req.user.id;

        try {
            const allFriends = await db.select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl, steamId: users.steamId, discordId: users.discordId })
                .from(users)
                .innerJoin(friendships, or(and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, users.id), eq(friendships.status, 'accepted')), and(eq(friendships.addresseeId, userId), eq(friendships.requesterId, users.id), eq(friendships.status, 'accepted'))));

            const paginatedData = allFriends.slice(offset, offset + limit);
            return reply.send({ data: paginatedData, meta: { totalItems: allFriends.length, totalPages: Math.ceil(allFriends.length / limit), currentPage: page, itemsPerPage: limit } });
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.get('/friends/requests', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Friends'],
            security: [{ apiKey: [] }],
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            requesterId: { type: 'integer' },
                            username: { type: 'string' },
                            avatarUrl: { type: 'string' },
                            sentAt: { type: 'string', format: 'date-time' }
                        }
                    }
                },
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const userId = req.user.id;
        try {
            const requests = await db.select({ requesterId: users.id, username: users.username, avatarUrl: users.avatarUrl, sentAt: friendships.createdAt })
                .from(friendships).innerJoin(users, eq(friendships.requesterId, users.id)).where(and(eq(friendships.addresseeId, userId), eq(friendships.status, 'pending')));
            return reply.send(requests);
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.delete('/friends/:targetId', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Friends'],
            security: [{ apiKey: [] }],
            params: { type: 'object', properties: { targetId: { type: 'integer' } } },
            response: {
                200: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
                400: errorSchema,
                404: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const targetId = parseInt((req.params as any).targetId);
        if (isNaN(targetId)) return reply.code(400).send({ error: "Invalid User ID" });
        const userId = req.user.id;
        try {
            const result = await db.delete(friendships).where(or(and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, targetId)), and(eq(friendships.requesterId, targetId), eq(friendships.addresseeId, userId)))).returning();
            if (result.length === 0) return reply.code(404).send({ error: "Friendship not found" });
            return reply.send({ success: true, message: "Friendship removed" });
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.get('/friends/sent', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Friends'],
            security: [{ apiKey: [] }]
        }
    }, async (req, reply) => {
        const userId = req.user.id;
        try {
            const sent = await db.select({
                targetId: users.id,
                username: users.username,
                avatarUrl: users.avatarUrl,
                sentAt: friendships.createdAt
            })
                .from(friendships)
                .innerJoin(users, eq(friendships.addresseeId, users.id)) // Join with the person we sent TO
                .where(and(
                    eq(friendships.requesterId, userId),
                    eq(friendships.status, 'pending')
                ));

            return reply.send(sent);
        } catch (err) {
            return reply.code(500).send({ error: "DB Error" });
        }
    });

    // DECLINE / DELETE FRIEND REQUEST
    app.delete('/friends/requests/:requesterId', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Friends'],
            summary: 'Decline an incoming friend request',
            params: {
                type: 'object',
                properties: {
                    requesterId: { type: 'integer' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' }
                    }
                },
                400: errorSchema,
                404: errorSchema,
                500: errorSchema,
            }
        }
    }, async (req, reply) => {
        const { requesterId } = req.params as { requesterId: number };
        const myId = req.user.id; // I am the one rejecting the request

        try {
            // Delete the friendship row ONLY IF:
            // 1. It was sent BY the requesterId
            // 2. It was sent TO me (myId)
            // 3. The status is 'pending'
            const deleted = await db.delete(friendships)
                .where(and(
                    eq(friendships.requesterId, requesterId),
                    eq(friendships.addresseeId, myId),
                    eq(friendships.status, 'pending')
                ))
                .returning();

            if (deleted.length === 0) {
                return reply.code(404).send({ error: "Friend request not found or already handled" });
            }

            return reply.send({ success: true, message: "Friend request declined" });
        } catch (err) {
            req.log.error(err);
            return reply.code(500).send({ error: "Failed to decline request" });
        }
    });
}
