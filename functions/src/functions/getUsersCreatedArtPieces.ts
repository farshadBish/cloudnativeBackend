import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';

import * as dotenv from 'dotenv';
import { getRedisClient } from '../../util/redisClient';
dotenv.config();

export async function getUsersCreatedArtPieces(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const userId = request.query.get('userId');
    if (!userId) {
        return {
            status: 400,
            body: JSON.stringify({
                status: 400,
                error: 'Bad Request',
                message: 'User ID is required',
            }),
        };
    }

    const cacheKey = `userArtPieces:${userId}`;

    try {
        const redis = await getRedisClient();
        const cached = await redis.get(cacheKey);

        let createdPieces: any;
        if (typeof cached === 'string') {
            context.log('Cache hit for users art pieces', userId);
            createdPieces = JSON.parse(cached);
        } else {
            context.log('Cache miss — querying users endpoint');
            const url = process.env.GET_ALL_USERS_URL!;
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) {
                context.log(`Failed to fetch users: ${res.status}`);
                return {
                    status: 502,
                    body: JSON.stringify({
                        status: 502,
                        error: 'Upstream fetch error',
                        details: `Status ${res.status}`,
                    }),
                };
            }
            const payload = await res.json();
            // Expect payload.users to be an array
            if (!payload.users || !Array.isArray(payload.users)) {
                throw new Error('Unexpected users payload shape');
            }
            const user = payload.users.find((u: any) => u.id === userId);
            if (!user) {
                return {
                    status: 404,
                    body: JSON.stringify({
                        status: 404,
                        error: 'Not Found',
                        message: `User with ID ${userId} not found`,
                    }),
                };
            }
            createdPieces = user.createdPieces ?? [];
            await redis.set(cacheKey, JSON.stringify(createdPieces), { EX: 3600 });
            context.log('Cached users art pieces for', userId);
        }

        return {
            status: 200,
            body: JSON.stringify({ createdPieces }),
        };
    } catch (err: any) {
        context.log("Error fetching user's art pieces:", err);
        return {
            status: 500,
            body: JSON.stringify({
                status: 500,
                error: 'Internal Server Error',
                details: err.message,
            }),
        };
    }
}

app.http('getUsersCreatedArtPieces', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getUsersCreatedArtPieces,
});
