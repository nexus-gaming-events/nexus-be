import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestContext, TestContext } from './helper';

describe('API Documentation', () => {
    let ctx: TestContext;

    beforeAll(async () => {
        ctx = await setupTestContext();
    }, 60000);

    afterAll(async () => {
        await ctx.app.close();
        await ctx.dbClient.end();
        await ctx.container.stop();
    });

    it('should serve Swagger UI HTML', async () => {
        const response = await ctx.app.inject({
            method: 'GET',
            url: '/docs/static/index.html'
        });
        const validStatuses = [200, 301, 302];
        expect(validStatuses).toContain(response.statusCode);
    });

    it('should serve Swagger JSON definition', async () => {
        const response = await ctx.app.inject({
            method: 'GET',
            url: '/docs/json'
        });
        expect(response.statusCode).toBe(200);
        const json = JSON.parse(response.body);
        expect(json.info.title).toBe('Nexus API');
    });
});
