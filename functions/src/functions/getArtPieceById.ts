// Function: getArtPieceById.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
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

    const cacheKey = 'artPieces:all';

    try {
        const redis = await getRedisClient();

        // Try Redis cache for full artPieces list
        const cached = await redis.get(cacheKey);
        let allArtPieces: { artPieces: any[] };

        if (typeof cached === 'string') {
            context.log('Cache hit');
            // Parse cached JSON
            const parsed = JSON.parse(cached);
            // Handle payload that might be an array or wrapped object
            if (Array.isArray(parsed)) {
                allArtPieces = { artPieces: parsed };
            } else if (parsed.artPieces && Array.isArray(parsed.artPieces)) {
                allArtPieces = parsed;
            } else {
                throw new Error('Cached payload has unexpected shape');
            }
        } else {
            context.log('Cache miss — querying source');
            const getAllArtPiecesUrl = process.env.GET_ALL_ART_PIECES_URL!;
            const fetchRes = await fetch(getAllArtPiecesUrl, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!fetchRes.ok) {
                context.log(`Failed to fetch art pieces: ${fetchRes.status}`);
                return {
                    status: 502,
                    body: JSON.stringify({
                        status: 502,
                        error: 'Upstream fetch error',
                        details: `Status ${fetchRes.status}`,
                    }),
                };
            }
            const fetched = await fetchRes.json();
            // Validate fetched payload
            if (!fetched.artPieces || !Array.isArray(fetched.artPieces)) {
                throw new Error('Fetched payload has unexpected shape');
            }
            allArtPieces = fetched;
            // Cache the full payload with TTL (e.g., 1 hour)
            await redis.set(cacheKey, JSON.stringify(allArtPieces), { EX: 3600 });
            context.log('Cached full artPieces list');
        }

        // Now search for the requested art piece
        const artPiece = allArtPieces.artPieces.find((piece) => piece.id === artPieceId);
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

        return {
            status: 200,
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
