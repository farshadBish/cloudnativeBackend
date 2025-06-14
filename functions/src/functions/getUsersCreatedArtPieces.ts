import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as dotenv from 'dotenv';
import { getRedisClient } from '../../util/redisClient';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';

dotenv.config();

export async function getUsersCreatedArtPieces(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    try {
        // 1) Authenticate: extract & verify JWT
        const authHeader =
            readHeader(request, 'Authorization') || request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                status: 401,
                body: JSON.stringify({ error: 'Missing or malformed Authorization header' }),
            };
        }

        const token = authHeader.slice('Bearer '.length);
        let payload: any;
        try {
            payload = verifyJWT(token);
        } catch (err: any) {
            context.log('JWT verification failed:', err.message);
            return {
                status: 401,
                body: JSON.stringify({ error: 'Invalid or expired token', details: err.message }),
            };
        }

        // 2) Read requested userId from query
        const requestedUserId = request.query.get('userId');
        if (!requestedUserId) {
            return {
                status: 400,
                body: JSON.stringify({ error: 'Query parameter userId is required' }),
            };
        }

        // 3) Authorize: determine effective userId
        const callerRole = payload.role as string;
        const callerUserId = payload.userId || payload.sub;
        if (!callerUserId) {
            return {
                status: 401,
                body: JSON.stringify({ error: 'Token missing userId claim' }),
            };
        }

        const userId = callerRole === 'admin' ? requestedUserId : requestedUserId;
        if (callerRole !== 'admin' && requestedUserId !== callerUserId) {
            context.log(
                `Non-admin (${callerUserId}) tried to fetch art for ${requestedUserId}; using own ID.`
            );
        }

        context.log(
            `Fetching created artPieces for effective userId: ${userId} (role=${callerRole})`
        );

        // 4) Attempt Redis cache lookup
        const redis = await getRedisClient();
        const cacheKey = `userArtPieces:${userId}`;
        const cached = await redis.get(cacheKey);

        let createdPieces: any[];
        if (typeof cached === 'string') {
            context.log(`Cache hit for ${cacheKey}`);
            createdPieces = JSON.parse(cached);
        } else {
            context.log(`Cache miss for ${cacheKey}; fetching full user list`);

            // 5) Fallback: fetch all users
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
                        error: 'Upstream fetch error',
                        details: `Status ${res.status}`,
                    }),
                };
            }

            const payload = await res.json();
            if (!payload.users || !Array.isArray(payload.users)) {
                throw new Error('Unexpected users payload shape');
            }

            const user = payload.users.find((u: any) => String(u.id) === String(userId));
            if (!user) {
                return {
                    status: 404,
                    body: JSON.stringify({ error: `User ${userId} not found` }),
                };
            }

            createdPieces = user.createdPieces ?? [];
            // Cache for 1 min
            await redis.set(cacheKey, JSON.stringify(createdPieces), { EX: 60 });
            context.log(`Cached created art pieces under ${cacheKey}`);
        }

        // 6) Return
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ createdPieces }),
        };
    } catch (err: any) {
        context.log('Error in getUsersCreatedArtPieces:', err);
        return {
            status: 500,
            body: JSON.stringify({ error: 'Internal Server Error', details: err.message }),
        };
    }
}

app.http('getUsersCreatedArtPieces', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getUsersCreatedArtPieces,
});
