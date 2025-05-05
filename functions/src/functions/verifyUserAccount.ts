// Function: verifyUserAccount.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getRedisClient } from '../../util/redisClient';
import { getContainer } from '../../util/cosmosDBClient';
import * as dotenv from 'dotenv';

dotenv.config();

export async function verifyUserAccount(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const verificationToken = (request.query.get('token') || '').trim();
    if (!verificationToken) {
        return {
            status: 400,
            body: JSON.stringify({ error: 'Verification token is required' }),
        };
    }

    const cacheKey = 'users:all';
    const cacheTTL = 24 * 60 * 60; // 24h

    try {
        // Fetch users list from Redis or remote
        const redis = await getRedisClient();
        let usersList: any[];
        const cached = await redis.get(cacheKey);
        if (cached) {
            context.log('Cache hit for users:all');
            usersList = JSON.parse(cached as string);
        } else {
            context.log('Cache miss — fetching users');
            const url = process.env.GET_ALL_USERS_URL!;
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) {
                context.log(`Failed to fetch users: ${res.status}`);
                return { status: 502, body: JSON.stringify({ error: 'Upstream fetch error' }) };
            }
            const payload = await res.json();
            if (!payload.users || !Array.isArray(payload.users)) {
                throw new Error('Unexpected users payload shape');
            }
            usersList = payload.users;
            await redis.set(cacheKey, JSON.stringify(usersList), { EX: cacheTTL });
            context.log('Cached users:all list');
        }

        // Find user by token
        const user = usersList.find((u) => u.verificationToken === verificationToken);
        if (!user) {
            return {
                status: 404,
                body: JSON.stringify({
                    error: 'No user found with the provided verification token',
                }),
            };
        }

        // Check token expiration
        const tokenExpiration = new Date(user.verificationTokenExpires);
        if (tokenExpiration < new Date()) {
            return {
                status: 400,
                body: JSON.stringify({
                    error: 'Verification link has expired. Please request a new one.',
                }),
            };
        }

        // Already verified?
        if (user.isVerified) {
            return {
                status: 200,
                body: JSON.stringify({
                    message: 'Your account is already verified. You can log in now.',
                }),
            };
        }

        // Update in CosmosDB
        const container = getContainer('Users');
        const updatedUser = {
            ...user,
            isVerified: true,
            verificationToken: null,
            verificationTokenExpires: null,
            updatedAt: new Date().toISOString(),
        };
        await container.item(user.id, user.id).replace(updatedUser);
        context.log(`User ${user.id} verified in DB`);

        // Update cache: replace the user in usersList and reset TTL
        const publicFields = usersList.map((u) => (u.id === user.id ? updatedUser : u));
        await redis.set(cacheKey, JSON.stringify(publicFields), { EX: cacheTTL });
        context.log('Updated users:all cache after verification');

        return {
            status: 200,
            body: JSON.stringify({
                message: 'Your account has been successfully verified! You can now log in.',
            }),
        };
    } catch (err: any) {
        context.log('Error verifying user:', err);
        return {
            status: 500,
            body: JSON.stringify({
                error: 'An error occurred while verifying your account. Please try again later.',
            }),
        };
    }
}

app.http('verifyUserAccount', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: verifyUserAccount,
});
