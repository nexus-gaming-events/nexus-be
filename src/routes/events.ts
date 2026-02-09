import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { events, participants, messages, groupMembers, users, friendships } from '../db/schema';
import { eq, and, count, desc, or, not, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { OAuth2Client } from "google-auth-library";

const errorSchema = {
    type: 'object',
    properties: {
        error: { type: 'string' },
        details: { type: 'object', nullable: true }
    }
};

const eventObj = {
    type: 'object',
    properties: {
        id: { type: 'integer' },
        hostId: { type: 'integer' },
        title: { type: 'string' },
        description: { type: 'string', nullable: true },
        game: { type: 'string' },
        discordVoiceLink: { type: 'string', nullable: true },
        startTime: { type: 'string', format: 'date-time' },
        maxPlayers: { type: 'integer' },
        maxSpectators: { type: 'integer' },
        playerCount: { type: 'integer' },
        spectatorCount: { type: 'integer' },
        groupId: { type: 'integer', nullable: true },
        onlyFriends: { type: 'boolean' },
        myRole: { type: 'string', nullable: true },
        host: { type: 'object', properties: { id: { type: 'integer' }, username: { type: 'string' }, avatarUrl: { type: 'string' } }, nullable: true }
    }
};

const paginationQuery = {
    type: 'object',
    properties: {
        page: { type: 'string', default: '1' },
        limit: { type: 'string', default: '10' }
    }
};

export async function eventRoutes(app: FastifyInstance) {
    const createEventSchema = z.object({
        title: z.string().min(3).max(100),
        description: z.string().optional(),
        game: z.string().min(1),
        discordVoiceLink: z.string().url().optional(),
        startTime: z.string().datetime(),
        maxPlayers: z.number().int().min(1).max(100).default(5),
        maxSpectators: z.number().int().min(0).max(100).default(2),
    });
    const updateEventSchema = createEventSchema.partial();
    const joinSchema = z.object({ role: z.enum(['player', 'spectator']) });

    // 1. CREATE
    app.post('/events', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Events'],
            security: [{ apiKey: [] }],
            body: {
                type: 'object',
                required: ['title', 'game', 'startTime'],
                properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    game: { type: 'string' },
                    discordVoiceLink: { type: 'string' },
                    startTime: { type: 'string', format: 'date-time' },
                    maxPlayers: { type: 'integer', default: 5 },
                    maxSpectators: { type: 'integer', default: 2 },
                }
            },
            response: {
                200: eventObj,
                400: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const parse = createEventSchema.safeParse(req.body);
        if (!parse.success) return reply.code(400).send({ error: 'Invalid input', details: parse.error });
        const data = parse.data;
        const userId = req.user.id;
        try {
            const result = await db.transaction(async (tx) => {
                const [newEvent] = await tx.insert(events).values({ hostId: userId, ...data, startTime: new Date(data.startTime) }).returning();
                await tx.insert(participants).values({ eventId: newEvent.id, userId: userId, role: 'player' });
                return newEvent;
            });
            return reply.send(result);
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    // 2. LIST
    app.get('/events', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Events'],
            security: [{ apiKey: [] }],
            querystring: paginationQuery,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        data: { type: 'array', items: eventObj },
                        meta: {
                            type: 'object',
                            properties: {
                                totalItems: { type: 'integer' },
                                totalPages: { type: 'integer' },
                                currentPage: { type: 'integer' },
                                itemsPerPage: { type: 'integer' }
                            }
                        }
                    }
                },
                400: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const userId = req.user.id;
        const { page, limit } = req.query as { page: number, limit: number };
        const offset = (page - 1) * limit;

        try {
            const myGroups = await db.select({ id: groupMembers.groupId })
                .from(groupMembers).where(eq(groupMembers.userId, userId));
            const myGroupIds = myGroups.map(g => g.id);

            const myFriends = await db.select({ id: users.id })
                .from(users)
                .innerJoin(friendships, or(
                    and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, users.id), eq(friendships.status, 'accepted')),
                    and(eq(friendships.addresseeId, userId), eq(friendships.requesterId, users.id), eq(friendships.status, 'accepted'))
                ));
            const myFriendIds = myFriends.map(f => f.id);
            myFriendIds.push(userId);

            const visibilityFilters = (table: typeof events) => or(
                and(isNull(table.groupId), eq(table.onlyFriends, false)), // Public
                eq(table.hostId, userId), // Host
                and(not(isNull(table.groupId)), myGroupIds.length > 0 ? inArray(table.groupId, myGroupIds) : undefined), // Group
                and(eq(table.onlyFriends, true), inArray(table.hostId, myFriendIds)) // Friends
            );

            const allMatching = await db.select({ id: events.id }).from(events).where(visibilityFilters(events));
            const totalItems = allMatching.length;
            const totalPages = Math.ceil(totalItems / limit);

            const rawEvents = await db.query.events.findMany({
                where: visibilityFilters(events),
                orderBy: [desc(events.startTime)],
                limit: limit,
                offset: offset,
                with: {
                    host: { columns: { username: true, avatarUrl: true } },
                    participants: { columns: { role: true, userId: true } }
                }
            });

            const data = rawEvents.map(event => {
                const playerCount = event.participants.filter(p => p.role === 'player').length;
                const spectatorCount = event.participants.filter(p => p.role === 'spectator').length;
                const myParticipation = event.participants.find(p => p.userId === userId);

                return {
                    ...event,
                    playerCount,
                    spectatorCount,
                    myRole: myParticipation ? myParticipation.role : null,
                };
            });

            return reply.send({
                data,
                meta: {
                    totalItems,
                    totalPages,
                    currentPage: page,
                    itemsPerPage: limit
                }
            });
        } catch (err) {
            req.log.error(err);
            return reply.code(500).send({ error: "Database error" });
        }
    });

    // 3. GET ONE
    app.get('/events/:id', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Events'],
            summary: 'Get a single event details',
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        ...eventObj.properties,
                        participants: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    userId: { type: 'integer' },
                                    role: { type: 'string' },
                                    user: {
                                        type: 'object',
                                        properties: {
                                            username: { type: 'string' },
                                            avatarUrl: { type: 'string', nullable: true }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                404: errorSchema,
                500: errorSchema,
            }
        }
    }, async (req, reply) => {
        const { id } = req.params as { id: number };
        const userId = req.user.id;

        try {
            const event = await db.query.events.findFirst({
                where: eq(events.id, id),
                with: {
                    host: {
                        columns: { id: true, username: true, avatarUrl: true }
                    },
                    participants: {
                        columns: { role: true, userId: true },
                        with: {
                            user: { columns: { username: true, avatarUrl: true } }
                        }
                    }
                }
            });

            if (!event) {
                return reply.code(404).send({ error: "Event not found" });
            }

            const playerCount = event.participants.filter(p => p.role === 'player').length;
            const spectatorCount = event.participants.filter(p => p.role === 'spectator').length;
            const myParticipation = event.participants.find(p => p.userId === userId);

            return reply.send({
                ...event,
                playerCount,
                spectatorCount,
                myRole: myParticipation ? myParticipation.role : null
            });
        } catch (err) {
            req.log.error(err);
            return reply.code(500).send({ error: "Database error" });
        }
    });

    // 4. UPDATE
    app.patch('/events/:id', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Events'],
            security: [{ apiKey: [] }],
            params: { type: 'object', properties: { id: { type: 'integer' } } },
            body: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    game: { type: 'string' },
                    startTime: { type: 'string', format: 'date-time' },
                    maxPlayers: { type: 'integer' },
                }
            },
            response: {
                200: eventObj,
                400: errorSchema,
                403: errorSchema,
                404: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const eventId = parseInt((req.params as any).id);
        if (isNaN(eventId)) return reply.code(400).send({ error: "Invalid ID" });
        const userId = req.user.id;
        const parse = updateEventSchema.safeParse(req.body);
        if (!parse.success) return reply.code(400).send({ error: 'Invalid input', details: parse.error });
        const updates = parse.data;
        if (Object.keys(updates).length === 0) return reply.code(400).send({ error: "No fields to update" });

        try {
            const event = await db.query.events.findFirst({ where: eq(events.id, eventId), columns: { hostId: true } });
            if (!event) return reply.code(404).send({ error: "Event not found" });
            if (event.hostId !== userId) return reply.code(403).send({ error: "Unauthorized" });

            const updateData: any = { ...updates };
            if (updates.startTime) updateData.startTime = new Date(updates.startTime);

            const [updatedEvent] = await db.update(events).set(updateData).where(eq(events.id, eventId)).returning();
            return reply.send(updatedEvent);
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    // 5. DELETE
    app.delete('/events/:id', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Events'],
            security: [{ apiKey: [] }],
            params: { type: 'object', properties: { id: { type: 'integer' } } },
            response: {
                200: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
                400: errorSchema,
                403: errorSchema,
                404: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const eventId = parseInt((req.params as any).id);
        if (isNaN(eventId)) return reply.code(400).send({ error: "Invalid ID" });
        const userId = req.user.id;
        try {
            const event = await db.query.events.findFirst({ where: eq(events.id, eventId), columns: { hostId: true } });
            if (!event) return reply.code(404).send({ error: "Event not found" });
            if (event.hostId !== userId) return reply.code(403).send({ error: "Unauthorized" });

            await db.transaction(async (tx) => {
                await tx.delete(messages).where(eq(messages.eventId, eventId));
                await tx.delete(participants).where(eq(participants.eventId, eventId));
                await tx.delete(events).where(eq(events.id, eventId));
            });
            return reply.send({ success: true, message: "Event deleted successfully" });
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    // 6. JOIN
    app.post('/events/:id/join', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Events'],
            security: [{ apiKey: [] }],
            params: { type: 'object', properties: { id: { type: 'integer' } } },
            body: {
                type: 'object',
                required: ['role'],
                properties: { role: { type: 'string', enum: ['player', 'spectator'] } }
            },
            response: {
                200: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
                400: errorSchema,
                404: errorSchema,
                409: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const eventId = parseInt((req.params as any).id);
        if (isNaN(eventId)) return reply.code(400).send({ error: "Invalid ID" });
        const parse = joinSchema.safeParse(req.body);
        if (!parse.success) return reply.code(400).send(parse.error);
        const { role } = parse.data;
        const userId = req.user.id;

        try {
            await db.transaction(async (tx) => {
                const event = await tx.query.events.findFirst({ where: eq(events.id, eventId) });
                if (!event) throw new Error("Event not found");
                const existing = await tx.query.participants.findFirst({ where: and(eq(participants.eventId, eventId), eq(participants.userId, userId)) });
                if (existing) throw new Error("Already joined");
                const limit = role === 'player' ? event.maxPlayers : event.maxSpectators;
                const [stats] = await tx.select({ count: count() }).from(participants).where(and(eq(participants.eventId, eventId), eq(participants.role, role)));
                if (stats.count >= limit) throw new Error(`${role} slots are full`);
                await tx.insert(participants).values({ eventId, userId, role });
            });
            return reply.send({ success: true, message: "Joined successfully" });
        } catch (err: any) {
            const status = err.message === "Event not found" ? 404 : 409;
            return reply.code(status).send({ error: err.message || "Join failed" });
        }
    });

    // 7. LEAVE
    app.post('/events/:id/leave', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Events'],
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
        const eventId = parseInt((req.params as any).id);
        if (isNaN(eventId)) return reply.code(400).send({ error: "Invalid ID" });
        const userId = req.user.id;
        try {
            const result = await db.delete(participants).where(and(eq(participants.eventId, eventId), eq(participants.userId, userId))).returning();
            if (result.length === 0) return reply.code(404).send({ error: "Not a participant" });
            return reply.send({ success: true, message: "Left event" });
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    // 8. ADD TO GOOGLE CALENDAR
    app.post('/events/:id/calendar', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Events'],
            security: [{ apiKey: [] }],
            body: {
                type: 'object',
                required: ['googleAccessToken'],
                properties: { googleAccessToken: { type: 'string' } }
            }
        }
    }, async (req, reply) => {
        const eventId = parseInt((req.params as any).id);
        const { googleAccessToken } = req.body as { googleAccessToken: string };

        try {
            const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
            if (!event) return reply.code(404).send({ error: "Event not found" });

            const oauth2Client = new OAuth2Client();
            oauth2Client.setCredentials({ access_token: googleAccessToken });

            const calendar = require('googleapis').google.calendar({ version: 'v3', auth: oauth2Client });

            const calendarEvent = {
                summary: `Nexus: ${event.title}`,
                description: `Game: ${event.game}\n${event.description || ''}`,
                start: { dateTime: event.startTime.toISOString() },
                // Default to 2 hours duration if end time not set
                end: { dateTime: new Date(event.startTime.getTime() + 2 * 60 * 60 * 1000).toISOString() },
            };

            const result = await calendar.events.insert({
                calendarId: 'primary',
                requestBody: calendarEvent,
            });

            return reply.send({ success: true, link: result.data.htmlLink });
        } catch (err) {
            req.log.error(err);
            return reply.code(500).send({ error: "Failed to add to Google Calendar" });
        }
    });
}
