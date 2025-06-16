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

        // 3) Get art piece ID from query parameter
        const artPieceId = request.query.get('artPieceId');
        if (!artPieceId) {
            return {
                status: 400,
                body: JSON.stringify({ error: 'Art piece ID is required' }),
            };
        }

        // 4) Get and validate update data
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

        // 5) Get art piece from Cosmos DB
        const artContainer = getContainer('ArtPieces');
        
        try {
            const { resource: existingArtPiece } = await artContainer.item(artPieceId, artPieceId).read();
            if (!existingArtPiece) {
                return {
                    status: 404,
                    body: JSON.stringify({ error: 'Art piece not found' }),
                };
            }

            // 6) Update the art piece
            const updatedArtPiece = {
                ...existingArtPiece,
                ...updateData,
                updatedAt: new Date().toISOString()
            };

            // 7) Save to Cosmos DB
            await artContainer.item(artPieceId, artPieceId).replace(updatedArtPiece);

            // 8) Clear Redis cache for both admin and non-admin views
            const redis = await getRedisClient();
            await redis.del('artPieces:all');
            await redis.del('artPieces:all:admin');

            context.log(`Art piece ${artPieceId} updated successfully`);

            return {
                status: 200,
                body: JSON.stringify({
                    message: 'Art piece updated successfully',
                    artPiece: updatedArtPiece
                }),
            };

        } catch (error) {
            context.log('Error updating art piece:', error);
            return {
                status: 404,
                body: JSON.stringify({ error: 'Art piece not found' }),
            };
        }

    } catch (err: any) {
        context.log('Error in editArtPiece:', err);
        return {
            status: 500,
            body: JSON.stringify({
                error: 'Internal server error',
                details: err.message
            }),
        };
    }
}

app.http('editArtPiece', {
    methods: ['PUT'],
    authLevel: 'anonymous',
    handler: editArtPiece,
});
