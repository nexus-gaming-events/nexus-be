import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server';
import pg from 'pg';
import { execSync } from 'child_process';

// Type definition for what our test setup returns
export interface TestContext {
    container: StartedPostgreSqlContainer;
    app: FastifyInstance;
    dbClient: pg.Pool;
    createTestUser: (username: string) => Promise<{ user: any; token: string }>;
}

export async function setupTestContext(): Promise<TestContext> {
    // 1. Start Container
    const container = await new PostgreSqlContainer("postgres:15-alpine")
        .withDatabase("nexus_test_db")
        .withUsername("nexus_test")
        .withPassword("nexus_test")
        .start();

    const databaseUrl = container.getConnectionUri();

    // 2. Set Env & Push Schema
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = "test-secret-key";

    try {
        execSync(`npx drizzle-kit push --config=drizzle.config.ts`, {
            env: { ...process.env, DATABASE_URL: databaseUrl },
            stdio: 'inherit'
        });
    } catch (e) {
        console.error("Failed to push schema");
        throw e;
    }

    // 3. Connect raw DB client (for verification/user creation)
    const dbClient = new pg.Pool({ connectionString: databaseUrl });

    // 4. Build App
    const app = buildApp();
    await app.ready();

    // 5. Helper to create users
    const createTestUser = async (username: string) => {
        const res = await dbClient.query(
            `INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id, username, email`,
            [username, `${username}@test.com`]
        );
        const user = res.rows[0];
        const token = app.jwt.sign({ id: user.id, username: user.username, email: user.email });
        return { user, token };
    };

    return { container, app, dbClient, createTestUser };
}
