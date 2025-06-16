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
        context.log('Received edit art piece request');
        context.log('Full request URL:', request.url);
        context.log('Headers:', Object.fromEntries(request.headers));

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
            context.log('JWT verified successfully, role:', payload.role);
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

        // 3) Get art piece ID and update data
        const artPieceId = request.query.get('artPieceId');
        const updateData = await request.json() as ArtPieceUpdate;
        
        context.log('Request parameters:', {
            artPieceId,
            queryParams: Object.fromEntries(request.query),
            updateData
        });
        
        if (!artPieceId) {
            return {
                status: 400,
                body: JSON.stringify({ 
                    error: 'Art piece ID is required',
                    requestUrl: request.url,
                    queryParams: Object.fromEntries(request.query)
                }),
            };
        }

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

        // 4) Get art piece from Cosmos DB
        const artContainer = getContainer('ArtPieces');
        
        try {
            context.log('Attempting to read art piece:', artPieceId);
            const { resource: existingArtPiece } = await artContainer.item(artPieceId, artPieceId).read();
            
            if (!existingArtPiece) {
                context.log('Art piece not found:', artPieceId);
                return {
                    status: 404,
                    body: JSON.stringify({ 
                        error: 'Art piece not found',
                        artPieceId,
                        requestUrl: request.url
                    }),
                };
            }

            context.log('Found existing art piece:', {
                id: existingArtPiece.id,
                title: existingArtPiece.title
            });

            // 5) Update the art piece
            const updatedArtPiece = {
                ...existingArtPiece,
                ...updateData,
                updatedAt: new Date().toISOString()
            };

            context.log('Saving updated art piece');
            await artContainer.item(artPieceId, artPieceId).replace(updatedArtPiece);

            // 6) Clear Redis cache
            const redis = await getRedisClient();
            await redis.del('artPieces:all');
            await redis.del('artPieces:all:admin');

            context.log('Art piece updated successfully:', artPieceId);

            return {
                status: 200,
                body: JSON.stringify({
                    message: 'Art piece updated successfully',
                    artPiece: updatedArtPiece
                }),
            };

        } catch (error: any) {
            context.log('Error during database operation:', {
                artPieceId,
                error: error.message,
                code: error.code,
                stack: error.stack
            });

            if (error.code === 404) {
                return {
                    status: 404,
                    body: JSON.stringify({ 
                        error: 'Art piece not found',
                        details: `No art piece found with ID: ${artPieceId}`,
                        requestUrl: request.url
                    }),
                };
            }

            return {
                status: 500,
                body: JSON.stringify({ 
                    error: 'Failed to update art piece',
                    details: error.message,
                    code: error.code
                }),
            };
        }

    } catch (err: any) {
        context.log('Unexpected error:', err);
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
