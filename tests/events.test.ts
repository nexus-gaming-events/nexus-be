import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestContext, TestContext } from './helper';

describe('Events Module', () => {
    let ctx: TestContext;

    beforeAll(async () => {
        ctx = await setupTestContext();
    }, 60000); // 60s timeout for Docker

    afterAll(async () => {
        await ctx.app.close();
        await ctx.dbClient.end();
        await ctx.container.stop();
    });

    it('should create an event successfully', async () => {
        const { user, token } = await ctx.createTestUser('hostuser');

        const payload = {
            title: "Test Tournament",
            game: "Overwatch 2",
            startTime: new Date().toISOString(),
            maxPlayers: 10,
            maxSpectators: 5
        };

        const response = await ctx.app.inject({
            method: 'POST',
            url: '/events',
            headers: { Authorization: `Bearer ${token}` },
            payload
        });

        if (response.statusCode !== 200) {
            console.error("Create Event Failed. Response Body:", response.body);
        }

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.title).toBe(payload.title);
        expect(body.hostId).toBe(user.id);
    });

    it('should list events with pagination', async () => {
        const { token } = await ctx.createTestUser('viewer');

        const response = await ctx.app.inject({
            method: 'GET',
            url: '/events?page=1&limit=5',
            headers: { Authorization: `Bearer ${token}` }
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('data');
        expect(body).toHaveProperty('meta');
    });

    it('should prevent joining if full', async () => {
        // 1. Host creates a 1-player event
        const { token: hostToken } = await ctx.createTestUser('host_full');
        const createRes = await ctx.app.inject({
            method: 'POST',
            url: '/events',
            headers: { Authorization: `Bearer ${hostToken}` },
            payload: {
                title: "Full Game",
                game: "Valorant",
                startTime: new Date().toISOString(),
                maxPlayers: 1 // Host fills this spot immediately
            }
        });
        const eventId = JSON.parse(createRes.body).id;

        // 2. New user tries to join
        const { token: playerToken } = await ctx.createTestUser('player_blocked');
        const joinRes = await ctx.app.inject({
            method: 'POST',
            url: `/events/${eventId}/join`,
            headers: { Authorization: `Bearer ${playerToken}` },
            payload: { role: 'player' }
        });

        expect(joinRes.statusCode).toBe(409);
        expect(JSON.parse(joinRes.body).error).toMatch(/full/i);
    });
});
