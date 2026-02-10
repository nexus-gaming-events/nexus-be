import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { messages, users, events } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { WebSocket } from 'ws';
import { z } from 'zod';

const rooms = new Map<number, Set<WebSocket>>();

const errorSchema = {
    type: 'object',
    properties: {
        error: { type: 'string' },
        details: { type: 'object', additionalProperties: true, nullable: true }
    }
};

export async function chatRoutes(app: FastifyInstance) {

    const paginationSchema = z.object({
        page: z.string().regex(/^\d+$/).default('1').transform(Number),
        limit: z.string().regex(/^\d+$/).default('50').transform(Number),
    });

    // Explicitly check if websocket support is active
    if (!app.hasDecorator('websocketServer')) {
        app.log.error("WebSocket plugin not registered!");
    }

    // HTTP History
    app.get('/events/:id/messages', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Chat'],
            security: [{ apiKey: [] }],
            params: { type: 'object', properties: { id: { type: 'integer' } } },
            querystring: {
                type: 'object',
                properties: { page: { type: 'string' }, limit: { type: 'string' } }
            },
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer' },
                            content: { type: 'string' },
                            createdAt: { type: 'string', format: 'date-time' },
                            userId: { type: 'integer' },
                            username: { type: 'string' },
                            avatarUrl: { type: 'string', nullable: true }
                        }
                    }
                },
                400: errorSchema,
                404: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const eventId = parseInt((req.params as any).id);
        if (isNaN(eventId)) return reply.code(400).send({ error: "Invalid Event ID" });
        const parse = paginationSchema.safeParse(req.query);
        if (!parse.success) return reply.code(400).send({ error: "Invalid pagination" });
        const { page, limit } = parse.data;
        const offset = (page - 1) * limit;

        try {
            const eventExists = await db.query.events.findFirst({ where: eq(events.id, eventId), columns: { id: true } });
            if (!eventExists) return reply.code(404).send({ error: "Event not found" });
            const history = await db.select({ id: messages.id, content: messages.content, createdAt: messages.createdAt, userId: messages.userId, username: users.username, avatarUrl: users.avatarUrl })
                .from(messages).innerJoin(users, eq(messages.userId, users.id)).where(eq(messages.eventId, eventId)).orderBy(desc(messages.createdAt)).limit(limit).offset(offset);
            return reply.send(history.reverse());
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    // WebSocket
    app.get('/chat', {
        websocket: true,
        schema: {
            tags: ['Chat'],
            summary: 'WebSocket Endpoint',
            description: 'Connect via ws://HOST/chat?token=JWT&eventId=123',
            querystring: {
                type: 'object',
                required: ['token', 'eventId'],
                properties: {
                    token: { type: 'string' },
                    eventId: { type: 'string' }
                }
            }
        }
    }, async (socket, req) => {
        const query = req.query as { token: string; eventId: string };

        if (!socket) {
            req.log.error("Incoming request is not a WebSocket upgrade.");
            return;
        }

        let userId: number;
        let username: string;
        let avatarUrl: string | null;

        try {
            if (!query.token) throw new Error("Missing token");
            const decoded = app.jwt.verify<{ id: number, username: string }>(query.token);
            userId = decoded.id;
            username = decoded.username;
        } catch (e) {
            socket.close(1008, "Unauthorized");
            return;
        }

        try {
            const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, avatarUrl: true, username: true } });
            if (!user) throw new Error("User not found");

            username = user.username;
            avatarUrl = user.avatarUrl;
        } catch (e) {
            socket.close(1011, e instanceof Error ? e.message : "Internal error");
            return;
        }

        const eventId = parseInt(query.eventId);
        if (isNaN(eventId)) {
            socket.close(1003, "Invalid Event ID");
            return;
        }

        if (!rooms.has(eventId)) rooms.set(eventId, new Set());
        const room = rooms.get(eventId)!;
        room.add(socket);

        socket.on('message', async (raw) => {
            try {
                const content = raw.toString().trim();
                if (!content) return;
                const [saved] = await db.insert(messages).values({ eventId, userId, username, content, avatarUrl }).returning();
                const payload = JSON.stringify({ type: 'MESSAGE', id: saved.id, userId, username, content, avatarUrl, createdAt: saved.createdAt });
                for (const client of room) {
                    if (client.readyState === WebSocket.OPEN) client.send(payload);
                }
            } catch (err) {
                app.log.error(err);
            }
        });

        socket.on('close', () => {
            room.delete(socket);
            if (room.size === 0) rooms.delete(eventId);
        });
    });

    app.get('/ws/ping', { websocket: true }, (socket, req) => {
        console.log("Ping route hit!");
        socket.on('message', (msg) => {
            console.log("Received:", msg.toString());
            socket.send(`Pong: ${msg.toString()}`);
        });
    });
}
