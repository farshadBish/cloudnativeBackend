import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';
import { getRedisClient } from '../../util/redisClient';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';
import * as dotenv from 'dotenv';

dotenv.config();

interface ArtPieceUpdate {
    title?: string;
    description?: string;
    price?: number;
    publishOnMarket?: boolean;
    tags?: string[];
    year?: number;
}

export async function editArtPiece(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const artPiecesContainerId = 'ArtPieces';

    try {
        context.log('Received edit art piece request');
        context.log('Full request URL:', request.url);
        context.log('Headers:', Object.fromEntries(request.headers));

        // 1) Authenticate: extract & verify JWT
        const authHeader = readHeader(request, 'Authorization') || request.headers.get('authorization');
        if (!authHeader) {
            return { status: 401, body: JSON.stringify({ error: 'Missing Authorization header' }) };
        }
        if (!authHeader.startsWith('Bearer ')) {
            return { status: 401, body: JSON.stringify({ error: 'Malformed Authorization header' }) };
        }

        const token = authHeader.substring('Bearer '.length);
        let payload;
        try {
            payload = verifyJWT(token);
            context.log('JWT verified successfully, role:', payload.role);
        } catch (err: any) {
            context.log('JWT verification failed:', err.message);
            return {
                status: 401,
                body: JSON.stringify({ error: 'Invalid or expired token' }),
            };
        }

        // 2) Verify admin role
        if (payload.role !== 'admin') {
            return {
                status: 403,
                body: JSON.stringify({ error: 'Access forbidden. Admin role required.' }),
            };
        }

        // 3) Get art piece ID from query parameter
        const artPieceId = request.query.get('artPieceId');
        if (!artPieceId) {
            return {
                status: 400,
                body: JSON.stringify({ error: 'Art piece ID is required' }),
            };
        }

        // 4) Get update data
        const updateData = await request.json() as ArtPieceUpdate;
        if (!updateData || Object.keys(updateData).length === 0) {
            return {
                status: 400,
                body: JSON.stringify({ error: 'Update data is required' }),
            };
        }

        // Validate update fields
        const allowedFields = ['title', 'description', 'price', 'publishOnMarket', 'tags', 'year'];
        const invalidFields = Object.keys(updateData).filter(field => !allowedFields.includes(field));
        if (invalidFields.length > 0) {
            return {
                status: 400,
                body: JSON.stringify({ error: `Invalid fields: ${invalidFields.join(', ')}` }),
            };
        }

        // 5) Initialize container and fetch art piece
        const artPiecesContainer = getContainer(artPiecesContainerId);
        
        let artPiece;
        try {
            const querySpec = {
                query: 'SELECT * FROM c WHERE c.id = @id',
                parameters: [{ name: '@id', value: artPieceId }],
            };
            const { resources } = await artPiecesContainer.items
                .query(querySpec, { partitionKey: undefined, maxItemCount: 1 })
                .fetchAll();

            if (!resources.length) {
                return {
                    status: 404,
                    body: JSON.stringify({ error: `ArtPiece ${artPieceId} not found` }),
                };
            }
            artPiece = resources[0];
            context.log('Found art piece:', { id: artPiece.id, title: artPiece.title });
        } catch (err: any) {
            context.log('Error fetching art piece:', err);
            throw err;
        }

        // 6) Update the art piece
        const updatedArtPiece = {
            ...artPiece,
            ...updateData,
            updatedAt: new Date().toISOString()
        };

        // 7) Save to Cosmos DB
        await artPiecesContainer
            .item(String(artPiece.id), String(artPiece.userId))
            .replace(updatedArtPiece);
        
        context.log(`Art piece ${artPieceId} updated successfully`);

        // 8) Clear Redis cache
        const redis = await getRedisClient();
        await redis.flushAll();
        context.log('Cache cleared after updating art piece');

        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                message: 'Art piece updated successfully',
                artPiece: updatedArtPiece
            }),
        };

    } catch (err: any) {
        context.log('Error in editArtPiece:', err);
        const status = err.code === 429 ? 429 : 500;
        const message = err.code === 429 ? 'Too many requests' : 'Internal Server Error';
        return {
            status,
            headers: {
                'Content-Type': 'application/json',
                ...(status === 429 ? { 'Retry-After': '10' } : {}),
            },
            body: JSON.stringify({ error: message, details: err.message }),
        };
    }
}

app.http('editArtPiece', {
    methods: ['PUT'],
    authLevel: 'anonymous',
    handler: editArtPiece,
});
