import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';
import { getRedisClient } from '../../util/redisClient';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';

import * as dotenv from 'dotenv';
dotenv.config();

export async function getAllArtPieces(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const artContainerId = 'ArtPieces';

    // Initialize Cosmos client and container once
    const artContainer = getContainer(artContainerId);

    const cacheKey = 'artPieces:all';
    const cacheTTL = 60;

    try {
        const redis = await getRedisClient();
        let isAdmin = false;

        // Check for admin authorization
        const authHeader = readHeader(request, 'Authorization') || request.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice('Bearer '.length);
            try {
                const payload = verifyJWT(token);
                if (payload.role === 'admin') {
                    isAdmin = true;
                    context.log('Admin access granted');
                }
            } catch (err: any) {
                context.log('JWT verification failed:', err.message);
                // Continue as non-admin if token is invalid
            }
        }

        // 1) Try Redis cache - use different keys for admin and non-admin views
        const cacheKeyWithRole = isAdmin ? `${cacheKey}:admin` : cacheKey;
        const cached = await redis.get(cacheKeyWithRole);
        if (cached) {
            context.log('Cache hit');
            return {
                status: 200,
                body: JSON.stringify({ artPieces: JSON.parse(cached as string) }),
                headers: { 'Content-Type': 'application/json' },
            };
        }

        context.log('Cache miss — querying Cosmos DB');

        // 1) Get all art pieces from Cosmos DB
        let { resources: artPieces } = await artContainer.items.readAll().fetchAll();

        // 2) Only filter for non-admin users
        if (!isAdmin) {
            // Filter out unpublished art pieces for non-admin users
            artPieces = artPieces.filter((artPiece) => artPiece.publishOnMarket);
            context.log('Filtering art pieces for non-admin view');
        }

        if (artPieces.length === 0) {
            context.log(isAdmin ? 'No art pieces found' : 'No art pieces found with publishOnMarket = true');
            return {
                status: 404,
                body: JSON.stringify({ error: 'No art pieces available' }),
            };
        }

        context.log(`Found ${artPieces.length} art pieces${!isAdmin ? ' with publishOnMarket = true' : ''}`);

        // 4) Store in Redis
        await redis.setEx(cacheKeyWithRole, cacheTTL, JSON.stringify(artPieces));
        context.log(`Cached ${artPieces.length} artPieces for ${cacheTTL}s`);

        return {
            status: 200,
            body: JSON.stringify({ artPieces: artPieces }),
        };
    } catch (err) {
        context.log('Error fetching art pieces:', err);
        return {
            status: 500,
            body: JSON.stringify({
                status: 500,
                error: 'Failed to fetch art pieces',
                details: err.message,
            }),
        };
    }
}

app.http('getAllArtPieces', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getAllArtPieces,
});
