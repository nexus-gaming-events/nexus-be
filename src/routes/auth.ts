import { FastifyInstance } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import { db } from '../db';
import { users } from '../db/schema';
import { eq, or } from 'drizzle-orm';
import { z } from 'zod';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const BASE_URL = process.env.BASE_URL || 'http://10.0.2.2:3000';
const MOBILE_REDIRECT_SCHEME = 'nexusapp://auth';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

type AuthUserData = {
    providerId: string;
    username: string;
    email?: string;
    avatarUrl?: string;
};

type AuthResult =
    | { success: true; data: AuthUserData }
    | { success: false; error: string };

async function verifyGoogleToken(token: string): Promise<AuthResult> {
    try {
        const ticket = await googleClient.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        if (!payload) return { success: false, error: "Google token payload is empty" };
        return {
            success: true,
            data: {
                providerId: payload.sub,
                email: payload.email,
                username: payload.name || 'Google User',
                avatarUrl: payload.picture,
            }
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown Google Auth Error";
        return { success: false, error: msg };
    }
}

async function verifyDiscordToken(token: string): Promise<AuthResult> {
    try {
        const { data, status } = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${token}` },
            validateStatus: () => true
        });
        if (status !== 200) return { success: false, error: `Discord API returned status ${status}` };
        const avatarUrl = data.avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png` : undefined;
        return {
            success: true,
            data: { providerId: data.id, email: data.email, username: data.username, avatarUrl }
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown Discord Auth Error";
        return { success: false, error: msg };
    }
}

async function verifySteamAssertion(params: URLSearchParams): Promise<AuthResult> {
    try {
        const validationParams = new URLSearchParams(params);
        validationParams.set('openid.mode', 'check_authentication');
        const { data } = await axios.post('https://steamcommunity.com/openid/login', validationParams.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (!data.includes('is_valid:true')) return { success: false, error: "Steam OpenID signature invalid" };
        const claimedId = params.get('openid.claimed_id');
        if (!claimedId) return { success: false, error: "No claimed_id" };
        const steamId = claimedId.split('/').pop();
        if (!steamId) return { success: false, error: "No Steam ID parsed" };
        if (!STEAM_API_KEY) return { success: false, error: "Server missing STEAM_API_KEY" };
        const { data: summaryData } = await axios.get(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${steamId}`);
        const players = summaryData?.response?.players;
        if (!players || players.length === 0) return { success: false, error: "Steam profile not found" };
        return { success: true, data: { providerId: steamId, username: players[0].personaname, avatarUrl: players[0].avatarfull } };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown Steam Auth Error";
        return { success: false, error: msg };
    }
}

const errorSchema = {
    type: 'object',
    properties: {
        error: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'object', nullable: true }
    }
};

export async function authRoutes(app: FastifyInstance) {

    const apiLoginSchema = z.object({
        provider: z.enum(['google', 'discord']),
        token: z.string().min(1),
    });

    // DEV LOGIN
    app.post('/auth/dev-login', {
        schema: {
            tags: ['Auth'],
            summary: 'Dev: Generate Test Token',
            body: {
                type: 'object',
                required: ['username'],
                properties: { username: { type: 'string', default: 'testuser' } }
            },
            response: {
                200: {
                    type: 'object',
                    properties: { token: { type: 'string' }, message: { type: 'string' } }
                },
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const { username } = req.body as { username: string };
        let user = await db.query.users.findFirst({ where: eq(users.username, username) });
        if (!user) {
            const [newUser] = await db.insert(users).values({ username, email: `${username}@dev.local` }).returning();
            user = newUser;
        }
        const token = app.jwt.sign({ id: user.id, email: user.email!, username: user.username });
        return reply.send({ token, message: "Use this token in the 'Authorize' button at the top right!" });
    });

    // API LOGIN
    app.post('/auth/login', {
        schema: {
            tags: ['Auth'],
            summary: 'Exchange Provider Token for App JWT',
            body: {
                type: 'object',
                required: ['provider', 'token'],
                properties: {
                    provider: { type: 'string', enum: ['google', 'discord'] },
                    token: { type: 'string', description: 'Google ID Token or Discord Access Token' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        token: { type: 'string' },
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'integer' },
                                username: { type: 'string' },
                                email: { type: 'string', nullable: true },
                                avatarUrl: { type: 'string', nullable: true }
                            }
                        }
                    }
                },
                400: errorSchema,
                401: errorSchema,
                500: errorSchema
            }
        }
    }, async (req, reply) => {
        const parse = apiLoginSchema.safeParse(req.body);
        if (!parse.success) return reply.code(400).send({ error: "Invalid input", details: parse.error });

        const { provider, token } = parse.data;
        let result: AuthResult;

        if (provider === 'google') result = await verifyGoogleToken(token);
        else result = await verifyDiscordToken(token);

        if (!result.success) return reply.code(401).send({ error: "Authentication failed", details: result.error });

        const userData = result.data;

        try {
            const existingUser = await db.query.users.findFirst({
                where: or(
                    provider === 'google' ? eq(users.googleId, userData.providerId) : undefined,
                    provider === 'discord' ? eq(users.discordId, userData.providerId) : undefined,
                    userData.email ? eq(users.email, userData.email) : undefined
                )
            });

            let userId: number;

            if (existingUser) {
                userId = existingUser.id;
                const updateData: any = { username: userData.username };
                if (userData.avatarUrl) updateData.avatarUrl = userData.avatarUrl;
                if (provider === 'google' && !existingUser.googleId) updateData.googleId = userData.providerId;
                if (provider === 'discord' && !existingUser.discordId) updateData.discordId = userData.providerId;
                await db.update(users).set(updateData).where(eq(users.id, userId));
            } else {
                const [newUser] = await db.insert(users).values({
                    username: userData.username,
                    email: userData.email,
                    avatarUrl: userData.avatarUrl,
                    googleId: provider === 'google' ? userData.providerId : null,
                    discordId: provider === 'discord' ? userData.providerId : null,
                }).returning();
                userId = newUser.id;
            }

            const jwt = app.jwt.sign({ id: userId, email: userData.email, username: userData.username });
            return reply.send({ token: jwt, user: { id: userId, ...userData } });
        } catch (dbError) {
            app.log.error(dbError);
            return reply.code(500).send({ error: "Database error" });
        }
    });

    // STEAM LOGIN (GET)
    app.get('/auth/steam/login', {
        schema: {
            tags: ['Auth'],
            summary: 'Initiate Steam OpenID Redirect'
        }
    }, async (req, reply) => {
        const returnUrl = `${BASE_URL}/auth/steam/return`;
        const steamUrl = new URL('https://steamcommunity.com/openid/login');
        const params = {
            'openid.ns': 'http://specs.openid.net/auth/2.0',
            'openid.mode': 'checkid_setup',
            'openid.return_to': returnUrl,
            'openid.realm': BASE_URL,
            'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
            'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
        };
        Object.entries(params).forEach(([k, v]) => steamUrl.searchParams.append(k, v));
        return reply.redirect(steamUrl.toString());
    });

    // STEAM RETURN
    app.get('/auth/steam/return', {
        schema: {
            tags: ['Auth'],
            summary: 'Steam OpenID Callback',
            // FIX: Removed 'querystring' validation entirely to allow dynamic Steam params
            // and prevent Swagger crash.
        }
    }, async (req, reply) => {
        const params = new URLSearchParams(req.query as Record<string, string>);
        const result = await verifySteamAssertion(params);
        if (!result.success) return reply.type('text/html').send(`<h1>Login Failed</h1><p>${result.error}</p>`);

        const userData = result.data;
        try {
            const existingUser = await db.query.users.findFirst({ where: eq(users.steamId, userData.providerId) });
            let userId: number;
            if (existingUser) {
                userId = existingUser.id;
                await db.update(users).set({ avatarUrl: userData.avatarUrl, username: userData.username }).where(eq(users.id, userId));
            } else {
                const [newUser] = await db.insert(users).values({
                    username: userData.username,
                    steamId: userData.providerId,
                    avatarUrl: userData.avatarUrl,
                }).returning();
                userId = newUser.id;
            }
            const token = app.jwt.sign({ id: userId, username: userData.username, steamId: userData.providerId });
            return reply.redirect(`${MOBILE_REDIRECT_SCHEME}?token=${token}`);
        } catch (dbError) {
            return reply.type('text/html').send(`<h1>System Error</h1>`);
        }
    });

    app.get("/me", {
        schema: {
            tags: ['Auth'],
            security: [{ apiKey: [] }],
            summary: 'Get Current User Info',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        username: { type: 'string' },
                        email: { type: 'string', nullable: true },
                        avatarUrl: { type: 'string', nullable: true },
                        bannerGradient: { type: 'object', nullable: true },
                    }
                },
                401: errorSchema,
                500: errorSchema
            }
        },
        preHandler: [app.authenticate]
    }, async (req, reply) => {
        const userId = (req.user as any).id;
        try {
            const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
            if (!user) return reply.code(401).send({ error: "User not found" });
            return reply.send({
                id: user.id,
                username: user.username,
                email: user.email,
                avatarUrl: user.avatarUrl,
                bannerGradient: user.bannerGradient,
            });
        } catch (dbError) {
            return reply.code(500).send({ error: "Database error" });
        }
    });
}
