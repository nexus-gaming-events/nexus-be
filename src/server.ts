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
import { userRoutes } from "./routes/users";
import { legalRoutes } from "./routes/legal";

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
    app.register(userRoutes);
    app.register(legalRoutes);

    // 4. HOME PAGE (Landing Page)
    app.get('/', async (req, reply) => {
        const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nexus API</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f4f4f9;
            color: #333;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 400px;
            width: 90%;
          }
          h1 { margin-bottom: 10px; color: #2c3e50; }
          p { color: #666; margin-bottom: 30px; }
          .links { display: flex; flex-direction: column; gap: 15px; }
          a {
            text-decoration: none;
            color: white;
            background-color: #007bff;
            padding: 12px;
            border-radius: 6px;
            font-weight: 500;
            transition: background-color 0.2s;
          }
          a:hover { background-color: #0056b3; }
          a.secondary {
            background-color: transparent;
            color: #007bff;
            border: 1px solid #007bff;
          }
          a.secondary:hover { background-color: #ebf5ff; }
          .footer { margin-top: 30px; font-size: 0.85em; color: #888; border-top: 1px solid #eee; padding-top: 20px; }
          .footer a { background: none; color: #666; padding: 0 5px; font-size: 1em; }
          .footer a:hover { text-decoration: underline; background: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Nexus Gaming Events</h1>
          <p>Backend services for the Nexus Gaming Platform.</p>
          
          <div class="links">
            <a href="/docs">📄 API Documentation</a>
            <a href="/health" class="secondary">💚 System Health</a>
          </div>

          <div class="footer">
            <a href="/privacy">Privacy Policy</a> • 
            <a href="/terms">Terms of Service</a>
          </div>
        </div>
      </body>
      </html>
    `;
        return reply.type('text/html').send(html);
    });

    // 5. Health Check
    app.get('/health', async () => {
        return { status: 'ok', timestamp: new Date().toISOString() };
    });

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
