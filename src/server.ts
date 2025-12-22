import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyWebsocket from '@fastify/websocket';

// Plugins & Routes
import authPlugin from './plugins/auth';
import { authRoutes } from './routes/auth';
import { eventRoutes } from './routes/events';
import { friendRoutes } from './routes/friends';
import { groupRoutes } from './routes/groups';
import { chatRoutes } from './routes/chat';

export function buildApp(): FastifyInstance {
    const app = Fastify({
        logger: process.env.NODE_ENV !== 'test', // Keep logs off during tests
    });

    // 1. Core Plugins
    app.register(cors, { origin: '*' });
    app.register(authPlugin);
    app.register(fastifyWebsocket);

    // 2. Swagger Configuration (Restored)
    app.register(swagger, {
        swagger: {
            info: {
                title: 'Nexus API',
                description: 'Gaming Organization Backend',
                version: '1.0.0'
            },
            consumes: ['application/json'],
            produces: ['application/json'],
            securityDefinitions: {
                apiKey: {
                    type: 'apiKey',
                    name: 'Authorization',
                    in: 'header'
                }
            }
        }
    });

    app.register(swaggerUi, {
        routePrefix: '/docs',
        staticCSP: true,
        transformStaticCSP: (header) => header,
    });

    // 3. Register Business Routes
    app.register(authRoutes);
    app.register(eventRoutes);
    app.register(friendRoutes);
    app.register(groupRoutes);
    app.register(chatRoutes);

    return app;
}

if (require.main === module) {
    const app = buildApp();
    const port = parseInt(process.env.PORT || '3000');

    app.listen({ port, host: '0.0.0.0' }).then(() => {
        console.log(`Server running at http://localhost:${port}`);
        console.log(`Swagger docs available at http://localhost:${port}/docs`);
    }).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
