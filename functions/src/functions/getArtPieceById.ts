// Function: getArtPieceById.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';
import { getRedisClient } from '../../util/redisClient';
import * as dotenv from 'dotenv';

dotenv.config();

export async function getArtPieceById(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const artPieceId = request.query.get('artPieceId');

    if (!artPieceId) {
        return {
            status: 400,
            body: JSON.stringify({
                status: 400,
                error: 'Bad Request',
                message: 'Art piece ID is required',
            }),
        };
    }

    const artContainerId = 'ArtPieces';
    const cacheKey = `artPiece:${artPieceId}`;
    const cacheTTL = 300; // 5 minutes cache for individual items

    try {
        const redis = await getRedisClient();

        // 1) Try Redis cache for the specific art piece
        const cached = await redis.get(cacheKey);
        if (cached) {
            context.log(`Cache hit for art piece ID: ${artPieceId}`);
            const artPiece = JSON.parse(cached as string);

            // Verify the cached item is still published on market
            if (!artPiece.publishOnMarket) {
                context.log(`Cached art piece ${artPieceId} is no longer published on market`);
                // Remove from cache and continue to fetch from DB
                await redis.del(cacheKey);
            } else {
                return {
                    status: 200,
                    body: JSON.stringify({ artPiece }),
                    headers: { 'Content-Type': 'application/json' },
                };
            }
        }

        context.log(`Cache miss for art piece ID: ${artPieceId} — querying Cosmos DB`);

        // 2) Query Cosmos DB directly for the specific art piece
        const artContainer = getContainer(artContainerId);

        try {
            // Direct read by ID (most efficient)
            const { resource: artPiece } = await artContainer.item(artPieceId, artPieceId).read();

            if (!artPiece) {
                return {
                    status: 404,
                    body: JSON.stringify({
                        status: 404,
                        error: 'Not Found',
                        message: `Art piece with ID ${artPieceId} not found`,
                    }),
                };
            }

            // 3) Check if the art piece is published on market
            if (!artPiece.publishOnMarket) {
                return {
                    status: 404,
                    body: JSON.stringify({
                        status: 404,
                        error: 'Not Found',
                        message: `Art piece with ID ${artPieceId} is not available on the market`,
                    }),
                };
            }

            // 4) Cache the individual art piece
            await redis.setEx(cacheKey, cacheTTL, JSON.stringify(artPiece));
            context.log(`Cached art piece ${artPieceId} for ${cacheTTL}s`);

            return {
                status: 200,
                body: JSON.stringify({ artPiece }),
                headers: { 'Content-Type': 'application/json' },
            };
        } catch (cosmosError: any) {
            // If direct read fails (item not found), try querying by ID
            if (cosmosError.code === 404) {
                context.log(`Direct read failed, trying query for ID: ${artPieceId}`);

                const querySpec = {
                    query: 'SELECT * FROM c WHERE c.id = @id',
                    parameters: [{ name: '@id', value: artPieceId }],
                };

                const { resources: artPieces } = await artContainer.items
                    .query(querySpec)
                    .fetchAll();

                if (artPieces.length === 0) {
                    return {
                        status: 404,
                        body: JSON.stringify({
                            status: 404,
                            error: 'Not Found',
                            message: `Art piece with ID ${artPieceId} not found or not available on market`,
                        }),
                    };
                }

                const artPiece = artPieces[0];

                // Cache the found art piece
                await redis.setEx(cacheKey, cacheTTL, JSON.stringify(artPiece));
                context.log(`Cached art piece ${artPieceId} for ${cacheTTL}s`);

                return {
                    status: 200,
                    body: JSON.stringify({ artPiece }),
                    headers: { 'Content-Type': 'application/json' },
                };
            } else {
                throw cosmosError; // Re-throw if it's not a 404 error
            }
        }
    } catch (err: any) {
        context.log('Error fetching art piece:', err);
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

app.http('getArtPieceById', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getArtPieceById,
});
