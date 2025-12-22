import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestContext, TestContext } from './helper';

describe('Social/Friends Module', () => {
    let ctx: TestContext;

    beforeAll(async () => {
        ctx = await setupTestContext();
    }, 60000);

    afterAll(async () => {
        await ctx.app.close();
        await ctx.dbClient.end();
        await ctx.container.stop();
    });

    it('should send and accept friend request', async () => {
        const { user: alice, token: aliceToken } = await ctx.createTestUser('alice');
        const { user: bob, token: bobToken } = await ctx.createTestUser('bob');

        // 1. Alice requests Bob
        const reqRes = await ctx.app.inject({
            method: 'POST',
            url: '/friends/request',
            headers: { Authorization: `Bearer ${aliceToken}` },
            payload: { targetUserId: bob.id }
        });
        expect(reqRes.statusCode).toBe(200);

        // 2. Bob accepts Alice
        const accRes = await ctx.app.inject({
            method: 'POST',
            url: '/friends/accept',
            headers: { Authorization: `Bearer ${bobToken}` },
            payload: { requesterId: alice.id }
        });
        expect(accRes.statusCode).toBe(200);

        // 3. Check Alice's friend list
        const listRes = await ctx.app.inject({
            method: 'GET',
            url: '/friends',
            headers: { Authorization: `Bearer ${aliceToken}` }
        });
        const body = JSON.parse(listRes.body);
        const friendList = body.data || body;

        expect(friendList.some((f: any) => f.id === bob.id)).toBe(true);
    });
});
