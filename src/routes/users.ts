import { FastifyInstance } from "fastify";
import { db } from "../db";

const errorSchema = {
    type: 'object',
    properties: {
        error: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'object', nullable: true }
    }
};

export async function userRoutes(app: FastifyInstance) {

    app.get('/users', {
        schema: {
            description: 'Get all users',
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

}
