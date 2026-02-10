import { FastifyInstance } from 'fastify';
import axios from 'axios';

export async function steamRoutes(app: FastifyInstance) {
    app.get('/steam/games', {
        onRequest: [app.authenticate],
        schema: {
            tags: ['Steam'],
            querystring: {
                type: 'object',
                required: ['q'],
                properties: { q: { type: 'string' } }
            },
            security: [{ apiKey: [] }],
        }
    }, async (req, reply) => {
        const query = (req.query as any).q;

        try {
            const response = await axios.get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=US`);

            if (!response.data || !response.data.items) {
                return reply.send([]);
            }

            const games = response.data.items.map((item: any) => ({
                id: item.id,
                name: item.name,
                imageUrl: item.tiny_image
            }));

            return reply.send(games);
        } catch (err) {
            req.log.error(err);
            return reply.code(500).send({ error: "Failed to fetch from Steam" });
        }
    });
}
