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

    const cacheKey = `artPiece:${artPieceId}`;
    const cacheTTL = 60; // seconds

    try {
        const redis = await getRedisClient();

        // 1) Try Redis cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            context.log(`Cache hit for art piece ID: ${artPieceId}`);
            const artPiece = JSON.parse(cached as string);
            return {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ artPiece }),
            };
        }

        context.log(`Cache miss for art piece ID: ${artPieceId} — querying Cosmos DB`);
        const artContainer = getContainer('ArtPieces');

        // 2) Always query by ID (no partition-key direct read)
        const querySpec = {
            query: 'SELECT * FROM c WHERE c.id = @id',
            parameters: [{ name: '@id', value: artPieceId }],
        };

        const { resources: artPieces } = await artContainer.items
            .query(querySpec, { partitionKey: undefined })
            .fetchAll();

        if (!artPieces || artPieces.length === 0) {
            return {
                status: 404,
                body: JSON.stringify({
                    status: 404,
                    error: 'Not Found',
                    message: `Art piece with ID ${artPieceId} not found`,
                }),
            };
        }

        const artPiece = artPieces[0];

        // 3) Cache result
        await redis.setEx(cacheKey, cacheTTL, JSON.stringify(artPiece));
        context.log(`Cached art piece ${artPieceId} for ${cacheTTL}s`);

        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ artPiece }),
        };
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
