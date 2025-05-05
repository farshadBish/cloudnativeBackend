// Function: getUsersCart.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getRedisClient } from '../../util/redisClient';
import * as dotenv from 'dotenv';

dotenv.config();

export async function getUsersCart(
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

    const cacheKey = `userCart:${userId}`;

    try {
        const redis = await getRedisClient();
        const cached = await redis.get(cacheKey);

        let userCart: any;
        if (typeof cached === 'string') {
            context.log('Cache hit for user cart', userId);
            userCart = JSON.parse(cached);
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
            console.log('Fetched users:', payload);
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
            // Assume user object has a 'cart' property
            userCart = user.cart ?? [];
            // Cache the userCart with TTL (e.g., 1 hour)
            await redis.set(cacheKey, JSON.stringify(userCart), { EX: 3600 });
            context.log('Cached user cart for', userId);
        }

        return {
            status: 200,
            body: JSON.stringify({ userCart }),
        };
    } catch (err: any) {
        context.log('Error fetching user cart:', err);
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

app.http('getUsersCart', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getUsersCart,
});
