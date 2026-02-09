import { FastifyInstance } from "fastify";
import { db } from "../db";
import { z } from "zod";
import { eq, ilike } from "drizzle-orm";
import { users } from "../db/schema";

const errorSchema = {
    type: 'object',
    properties: {
        error: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'object', nullable: true }
    }
};

const bannerGradientSchema = z.object({
    type: z.enum(['linear', 'radial']).default('linear'),
    colors: z.array(z.string()).min(2), // Validates array of color strings
    parameter: z.number().default(0.0) // Angle or radius
});

const updateUserSchema = z.object({
    username: z.string().min(3).max(30).optional(),
    avatarUrl: z.string().url().optional(),
    bio: z.string().max(500).optional(),
    bannerGradient: bannerGradientSchema.optional(),
});

const userResponseSchema = {
    type: 'object',
    properties: {
        id: { type: 'integer' },
        username: { type: 'string' },
        avatarUrl: { type: 'string', nullable: true },
        bannerGradient: {
            type: 'object',
            properties: {
                type: { type: 'string' },
                colors: { type: 'array', items: { type: 'string' } },
                parameter: { type: 'number' }
            }
        }
    }
};

export async function userRoutes(app: FastifyInstance) {

    app.get('/users', {
        schema: {
            description: 'Get all users',
            security: [{ apiKey: [] }],
            tags: ['Users'],
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer' },
                            username: { type: 'string' },
                            email: { type: 'string', nullable: true },
                            avatarUrl: { type: 'string', nullable: true }
                        }
                    }
                },
                401: errorSchema,
                500: errorSchema
            }
        },
        preHandler: [app.authenticate],
    }, async (req, reply) => {
        try {
            return reply.send(await db.query.users.findMany());
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.get('/users/:id', {
        schema: {
            description: 'Get user by ID',
            security: [{ apiKey: [] }],
            tags: ['Users'],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        username: { type: 'string' },
                        email: { type: 'string', nullable: true },
                        avatarUrl: { type: 'string', nullable: true }
                    }
                },
                401: errorSchema,
                404: errorSchema,
                500: errorSchema
            }
        },
        preHandler: [app.authenticate],
    }, async (req, reply) => {
        const { id } = req.params as { id: number };
        try {
            const user = await db.query.users.findFirst({
                where: (users, { eq }) => eq(users.id, id)
            });
            if (!user) {
                return reply.code(404).send({ error: 'Not Found', message: `User with ID ${id} not found` });
            }
            return reply.send(user);
        } catch (err) {
            return reply.code(500).send({ error: err });
        }
    });

    app.patch('/users/me', {
        onRequest: [app.authenticate], // Requires Auth
        schema: {
            tags: ['Users'],
            summary: 'Update current user profile',
            security: [{ apiKey: [] }],
            body: {
                type: 'object',
                properties: {
                    username: { type: 'string' },
                    avatarUrl: { type: 'string' },
                    bio: { type: 'string' },
                    bannerGradient: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['linear', 'radial'] },
                            colors: { type: 'array', items: { type: 'string' } },
                            parameter: { type: 'number' }
                        }
                    }
                }
            },
            response: {
                200: userResponseSchema,
                400: errorSchema,
                409: errorSchema,
                500: errorSchema,
            }
        }
    }, async (req, reply) => {
        const parse = updateUserSchema.safeParse(req.body);
        if (!parse.success) return reply.code(400).send({ error: 'Invalid input', details: parse.error });

        const updates = parse.data;
        const userId = req.user.id;

        if (Object.keys(updates).length === 0) {
            return reply.code(400).send({ error: "No fields provided to update" });
        }

        try {
            if (updates.username) {
                const existing = await db.query.users.findFirst({
                    where: eq(users.username, updates.username)
                });
                if (existing && existing.id !== userId) {
                    return reply.code(409).send({ error: "Username already taken" });
                }
            }

            const [updatedUser] = await db.update(users)
                .set(updates)
                .where(eq(users.id, userId))
                .returning();

            return reply.send(updatedUser);

        } catch (err) {
            req.log.error(err);
            return reply.code(500).send({ error: "Failed to update profile" });
        }
    });

    app.get('/users/search', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Users'],
            summary: 'Search users by username',
            security: [{ apiKey: [] }],
            querystring: {
                type: 'object',
                required: ['q'],
                properties: { q: { type: 'string', minLength: 3 } }
            }
        }
    }, async (req, reply) => {
        const { q } = req.query as { q: string };

        try {
            // Case-insensitive search
            const results = await db.query.users.findMany({
                where: ilike(users.username, `%${q}%`),
                columns: {
                    id: true,
                    username: true,
                    avatarUrl: true
                },
                limit: 10
            });
            return reply.send(results);
        } catch (err) {
            return reply.code(500).send({ error: "Search failed" });
        }
    });

}
