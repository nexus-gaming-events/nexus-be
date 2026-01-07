import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { groups, groupMembers, users } from '../db/schema';
import { eq, and, count } from 'drizzle-orm';
import { z } from 'zod';

const errorSchema = {
    type: 'object',
    properties: { error: { type: 'string' }, details: { type: 'object', nullable: true } }
};

const groupObj = {
    type: 'object',
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        ownerId: { type: 'integer' },
        joinedAt: { type: 'string', format: 'date-time', nullable: true }
    }
};

export async function groupRoutes(app: FastifyInstance) {
    const createGroupSchema = z.object({ name: z.string().min(3).max(50) });
    const updateGroupSchema = z.object({ name: z.string().min(3).max(50) });
    const paginationSchema = z.object({
        page: z.string().regex(/^\d+$/).default('1').transform(Number),
        limit: z.string().regex(/^\d+$/).default('10').transform(Number),
    });

    app.post('/groups', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Groups'],
            security: [{ apiKey: [] }],
            body: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string' } }
            },
            response: {
                200: groupObj,
                400: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const parse = createGroupSchema.safeParse(req.body);
        if (!parse.success) return reply.code(400).send(parse.error);
        const userId = req.user.id;
        try {
            const result = await db.transaction(async (tx) => {
                const [newGroup] = await tx.insert(groups).values({ ownerId: userId, name: parse.data.name }).returning();
                await tx.insert(groupMembers).values({ groupId: newGroup.id, userId: userId });
                return newGroup;
            });
            return reply.send(result);
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.get('/groups', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Groups'],
            security: [{ apiKey: [] }],
            querystring: {
                type: 'object',
                properties: { page: { type: 'string' }, limit: { type: 'string' } }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        data: { type: 'array', items: groupObj },
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
            const [totalResult] = await db.select({ count: count() }).from(groupMembers).where(eq(groupMembers.userId, userId));
            const myGroups = await db.select({ id: groups.id, name: groups.name, ownerId: groups.ownerId, joinedAt: groupMembers.joinedAt })
                .from(groups).innerJoin(groupMembers, eq(groups.id, groupMembers.groupId)).where(eq(groupMembers.userId, userId)).limit(limit).offset(offset);
            return reply.send({ data: myGroups, meta: { totalItems: totalResult.count, totalPages: Math.ceil(totalResult.count / limit), currentPage: page, itemsPerPage: limit } });
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.get('/groups/:id', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Groups'],
            security: [{ apiKey: [] }],
            params: { type: 'object', properties: { id: { type: 'integer' } } },
            response: {
                200: groupObj,
                403: errorSchema,
                404: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const groupId = parseInt((req.params as any).id);
        const userId = req.user.id;
        try {
            const membership = await db.query.groupMembers.findFirst({ where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)) });
            if (!membership) return reply.code(403).send({ error: "Not a member" });
            const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
            if (!group) return reply.code(404).send({ error: "Group not found" });
            return reply.send(group);
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.patch('/groups/:id', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Groups'],
            security: [{ apiKey: [] }],
            params: { type: 'object', properties: { id: { type: 'integer' } } },
            body: { type: 'object', properties: { name: { type: 'string' } } },
            response: {
                200: groupObj,
                400: errorSchema,
                403: errorSchema,
                404: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const groupId = parseInt((req.params as any).id);
        const userId = req.user.id;
        const parse = updateGroupSchema.safeParse(req.body);
        if (!parse.success) return reply.code(400).send(parse.error);
        try {
            const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
            if (!group) return reply.code(404).send({ error: "Not found" });
            if (group.ownerId !== userId) return reply.code(403).send({ error: "Unauthorized" });
            const [updated] = await db.update(groups).set({ name: parse.data.name }).where(eq(groups.id, groupId)).returning();
            return reply.send(updated);
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.delete('/groups/:id', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Groups'],
            security: [{ apiKey: [] }],
            params: { type: 'object', properties: { id: { type: 'integer' } } },
            response: {
                200: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
                403: errorSchema,
                404: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const groupId = parseInt((req.params as any).id);
        const userId = req.user.id;
        try {
            const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
            if (!group) return reply.code(404).send({ error: "Not found" });
            if (group.ownerId !== userId) return reply.code(403).send({ error: "Unauthorized" });
            await db.transaction(async (tx) => {
                await tx.delete(groupMembers).where(eq(groupMembers.groupId, groupId));
                await tx.delete(groups).where(eq(groups.id, groupId));
            });
            return reply.send({ success: true, message: "Group deleted" });
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.post('/groups/:id/members', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Groups'],
            security: [{ apiKey: [] }],
            params: { type: 'object', properties: { id: { type: 'integer' } } },
            body: { type: 'object', required: ['userId'], properties: { userId: { type: 'integer' } } },
            response: {
                200: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
                400: errorSchema,
                403: errorSchema,
                404: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const groupId = parseInt((req.params as any).id);
        const schema = z.object({ userId: z.number().int() });
        const parse = schema.safeParse(req.body);
        if (!parse.success) return reply.code(400).send(parse.error);
        const targetUserId = parse.data.userId;
        const requesterId = req.user.id;
        try {
            const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
            if (!group) return reply.code(404).send({ error: "Not found" });
            if (group.ownerId !== requesterId) return reply.code(403).send({ error: "Unauthorized" });
            await db.insert(groupMembers).values({ groupId, userId: targetUserId }).onConflictDoNothing();
            return reply.send({ success: true, message: "Member added" });
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.get('/groups/:id/members', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Groups'],
            security: [{ apiKey: [] }],
            params: { type: 'object', properties: { id: { type: 'integer' } } },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        data: {
                            type: 'array',
                            items: { type: 'object', properties: { id: { type: 'integer' }, username: { type: 'string' }, joinedAt: { type: 'string', format: 'date-time' } } }
                        },
                        meta: { type: 'object', properties: { totalItems: { type: 'integer' }, totalPages: { type: 'integer' }, currentPage: { type: 'integer' }, itemsPerPage: { type: 'integer' } } }
                    }
                },
                400: errorSchema,
                403: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const groupId = parseInt((req.params as any).id);
        const userId = req.user.id;
        const parse = paginationSchema.safeParse(req.query);
        if (!parse.success) return reply.code(400).send({ error: "Invalid pagination" });
        const { page, limit } = parse.data;
        const offset = (page - 1) * limit;
        try {
            const membership = await db.query.groupMembers.findFirst({ where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)) });
            if (!membership) return reply.code(403).send({ error: "Not a member" });
            const [countRes] = await db.select({ count: count() }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
            const members = await db.select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl, joinedAt: groupMembers.joinedAt })
                .from(groupMembers).innerJoin(users, eq(groupMembers.userId, users.id)).where(eq(groupMembers.groupId, groupId)).limit(limit).offset(offset);
            return reply.send({ data: members, meta: { totalItems: countRes.count, totalPages: Math.ceil(countRes.count / limit), currentPage: page, itemsPerPage: limit } });
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.delete('/groups/:id/members/:userId', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Groups'],
            security: [{ apiKey: [] }],
            params: { type: 'object', properties: { id: { type: 'integer' }, userId: { type: 'integer' } } },
            response: {
                200: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
                400: errorSchema,
                403: errorSchema,
                404: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const groupId = parseInt((req.params as any).id);
        const targetUserId = parseInt((req.params as any).userId);
        const requesterId = req.user.id;
        try {
            const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
            if (!group) return reply.code(404).send({ error: "Not found" });
            if (group.ownerId !== requesterId && requesterId !== targetUserId) return reply.code(403).send({ error: "Permission denied" });
            if (group.ownerId === targetUserId) return reply.code(400).send({ error: "Owner cannot be removed" });
            const result = await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId))).returning();
            if (result.length === 0) return reply.code(404).send({ error: "Member not found" });
            return reply.send({ success: true, message: "Member removed" });
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.post('/groups/:id/leave', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Groups'],
            security: [{ apiKey: [] }],
            params: { type: 'object', properties: { id: { type: 'integer' } } },
            response: {
                200: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
                400: errorSchema,
                404: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const groupId = parseInt((req.params as any).id);
        const userId = req.user.id;
        try {
            const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
            if (!group) return reply.code(404).send({ error: "Not found" });
            if (group.ownerId === userId) return reply.code(400).send({ error: "Owner cannot leave" });
            const result = await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))).returning();
            if (result.length === 0) return reply.code(404).send({ error: "Not a member" });
            return reply.send({ success: true, message: "Left group" });
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });
}
