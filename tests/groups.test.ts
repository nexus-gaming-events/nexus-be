import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestContext, TestContext } from './helper';

describe('Groups Module', () => {
    let ctx: TestContext;

    beforeAll(async () => {
        ctx = await setupTestContext();
    }, 60000);

    afterAll(async () => {
        await ctx.app.close();
        await ctx.dbClient.end();
        await ctx.container.stop();
    });

    it('should create a group and add members', async () => {
        const { token: ownerToken } = await ctx.createTestUser('group_owner');
        const { user: member } = await ctx.createTestUser('group_member');

        // 1. Create Group
        const createRes = await ctx.app.inject({
            method: 'POST',
            url: '/groups',
            headers: { Authorization: `Bearer ${ownerToken}` },
            payload: { name: "Pro Gamers" }
        });
        expect(createRes.statusCode).toBe(200);
        const group = JSON.parse(createRes.body);

        // 2. Add Member
        const addRes = await ctx.app.inject({
            method: 'POST',
            url: `/groups/${group.id}/members`,
            headers: { Authorization: `Bearer ${ownerToken}` },
            payload: { userId: member.id }
        });
        expect(addRes.statusCode).toBe(200);

        // 3. Verify Member List
        const listRes = await ctx.app.inject({
            method: 'GET',
            url: `/groups/${group.id}/members`,
            headers: { Authorization: `Bearer ${ownerToken}` }
        });

        const list = JSON.parse(listRes.body);
        expect(list.data).toHaveLength(2); // Owner + Member
    });

    it('should forbid non-owners from adding members', async () => {
        const { token: hackerToken } = await ctx.createTestUser('hacker');
        const { user: victim } = await ctx.createTestUser('victim');

        // Hacker creates their own group just to exist, but tries to modify group ID 1 (from previous test)
        // Note: Since each test file has a fresh DB, ID 1 is safe if this runs first,
        // but better to create a fresh group here to be safe.

        // Create a group owned by someone else
        const { token: ownerToken } = await ctx.createTestUser('real_owner');
        const createRes = await ctx.app.inject({
            method: 'POST',
            url: '/groups',
            headers: { Authorization: `Bearer ${ownerToken}` },
            payload: { name: "Secure Group" }
        });
        const group = JSON.parse(createRes.body);

        // Hacker tries to add victim
        const failRes = await ctx.app.inject({
            method: 'POST',
            url: `/groups/${group.id}/members`,
            headers: { Authorization: `Bearer ${hackerToken}` },
            payload: { userId: victim.id }
        });

        expect(failRes.statusCode).toBe(403);
    });
});
