import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getRedisClient } from '../../util/redisClient';
import { getContainer } from '../../util/cosmosDBClient';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';
import * as dotenv from 'dotenv';

dotenv.config();

export async function deleteUser(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    try {
        // 1) Authenticate: extract & verify JWT
        const authHeader = readHeader(request, 'Authorization') || request.headers.get('authorization');
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
                body: JSON.stringify({ error: 'Invalid token' }),
            };
        }

        // 2) Verify admin role
        if (payload.role !== 'admin') {
            return {
                status: 403,
                body: JSON.stringify({ error: 'Access forbidden. Admin role required.' }),
            };
        }

        // 3) Get user ID from query parameter
        const userId = request.query.get('userId');
        if (!userId) {
            return {
                status: 400,
                body: JSON.stringify({ error: 'User ID is required' }),
            };
        }

        // 4) Delete user from Cosmos DB
        const container = getContainer('Users');
        try {
            await container.item(userId, userId).delete();
        } catch (error: any) {
            if (error.code === 404) {
                return {
                    status: 404,
                    body: JSON.stringify({ error: 'User not found' }),
                };
            }
            throw error;
        }

        // 5) Clear Redis cache
        const redis = await getRedisClient();
        await redis.del('users:all'); // Clear the full users list cache
        await redis.del(`userCart:${userId}`); // Clear user's cart cache if exists
        
        context.log(`User ${userId} deleted successfully`);

        return {
            status: 200,
            body: JSON.stringify({ 
                message: 'User deleted successfully',
                deletedUserId: userId 
            }),
        };

    } catch (err: any) {
        context.log('Error deleting user:', err);
        return {
            status: 500,
            body: JSON.stringify({ 
                error: 'Internal server error',
                details: err.message
            }),
        };
    }
}

app.http('deleteUser', {
    methods: ['DELETE'],
    authLevel: 'anonymous', // We handle authentication via JWT
    handler: deleteUser,
});
