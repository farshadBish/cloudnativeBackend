// functions/getAllUsers.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getRedisClient } from '../../util/redisClient';
import { getContainer } from '../../util/cosmosDBClient';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';

import * as dotenv from 'dotenv';
dotenv.config();

export async function getAllUsers(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    try {
        // Check if function key is present in URL
        const hasCodeParam = request.query.get('code') !== null;
        
        // If no function key, require JWT admin token
        if (!hasCodeParam) {
            const authHeader = readHeader(request, 'Authorization') || request.headers.get('authorization');
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return {
                    status: 401,
                    body: JSON.stringify({ error: 'Authentication required' }),
                };
            }
            
            // Verify JWT and check admin role
            const token = authHeader.slice('Bearer '.length);
            try {
                const payload = verifyJWT(token);
                if (payload.role !== 'admin') {
                    return {
                        status: 403,
                        body: JSON.stringify({ error: 'Access forbidden. Admin role required.' }),
                    };
                }
            } catch (err: any) {
                context.log('JWT verification failed:', err.message);
                return {
                    status: 401,
                    body: JSON.stringify({ error: 'Invalid token' }),
                };
            }
        }
        // If function key is present, allow access without JWT check
        
        // Get users from database with caching
        const containerId = 'Users';
        const container = getContainer(containerId);
        const cacheKey = 'users:all';
        const cacheTTL = 60;

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
        context.log(`Cached ${safeUsers.length} users for ${cacheTTL}s`);        // 5) Return
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
        };    }
}

app.http('getAllUsers', {
    methods: ['GET'],
    authLevel: 'anonymous',  // Allow calls without function key
    handler: getAllUsers,
});
