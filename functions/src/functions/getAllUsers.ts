// functions/getAllUsers.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getRedisClient } from '../../util/redisClient';
import { getContainer } from '../../util/cosmosDBClient';

import * as dotenv from 'dotenv';
dotenv.config();

export async function getAllUsers(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    // Cosmos setup (you could extract this similarly if you like)
    const containerId = 'Users';
    const container = getContainer(containerId);

    const cacheKey = 'users:all';
    const cacheTTL = 60;

    try {
        const redis = await getRedisClient();

        // 1) Try Redis cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            context.log('Cache hit');
            return {
                status: 200,
                body: JSON.stringify({ users: JSON.parse(cached as string) }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        context.log('Cache miss — querying Cosmos DB');

        // 2) Query Cosmos
        const { resources: users } = await container.items
            .query({
                query: 'SELECT c.id, c.username, c.email, c.firstName, c.lastName, c.role, c.likedArtPieces, c.cart, c.createdPieces, c.verificationToken, c.verificationTokenExpires, c.createdAt, c.updatedAt, c.isVerified FROM c',
            })
            .fetchAll();

        // 3) Shape your data
        const safeUsers = users.map((u) => ({
            id: u.id,
            username: u.username,
            email: u.email,
            firstName: u.firstName,
            lastName: u.lastName,
            role: u.role,
            likedArtPieces: u.likedArtPieces,
            cart: u.cart,
            createdPieces: u.createdPieces,
            verificationToken: u.verificationToken,
            verificationTokenExpires: u.verificationTokenExpires,
            isVerified: u.isVerified,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
        }));

        // 4) Store in Redis
        await redis.setEx(cacheKey, cacheTTL, JSON.stringify(safeUsers));
        context.log(`Cached ${safeUsers.length} users for ${cacheTTL}s`);

        // 5) Return
        return {
            status: 200,
            body: JSON.stringify({ users: safeUsers }),
            headers: { 'Content-Type': 'application/json' },
        };
    } catch (err: any) {
        context.log('Error retrieving users:', err);
        return {
            status: err.code === 429 ? 429 : 500,
            body: JSON.stringify({
                error:
                    err.code === 429
                        ? 'Too many requests. Please try again later.'
                        : 'Internal Server Error',
            }),
        };
    }
}

app.http('getAllUsers', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getAllUsers,
});
