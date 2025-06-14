import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';
import * as dotenv from 'dotenv';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';

dotenv.config();

export async function userTogglesPublishOfArtPiece(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const artPiecesContainerId = 'ArtPieces';

    try {
        // 1) Authenticate
        const authHeader =
            readHeader(request, 'Authorization') || request.headers.get('authorization');
        if (!authHeader) {
            return { status: 401, body: 'Missing Authorization header' };
        }
        if (!authHeader.startsWith('Bearer ')) {
            return { status: 401, body: `Malformed Authorization header ${authHeader}` };
        }

        const token = authHeader.substring('Bearer '.length);
        let payload;
        try {
            payload = verifyJWT(token);
        } catch (err: any) {
            context.log('JWT verification failed:', err.message);
            return {
                status: 401,
                body: `Invalid or expired token: ${err.message}`,
            };
        }

        // 2) Parse body
        const { artPieceId } = (await request.json()) as { artPieceId: number };
        if (!artPieceId) {
            return { status: 400, body: JSON.stringify({ error: 'ArtPieceId is required' }) };
        }

        // 3) Authorize: ensure user owns the art piece or is admin
        const callerRole = payload.role;
        const callerUserId = payload.userId || payload.sub;
        if (!callerUserId) {
            return { status: 401, body: 'Token missing userId claim' };
        }

        // 4) Initialize container
        const artPiecesContainer = getContainer(artPiecesContainerId);

        // 5) Fetch art piece
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
        } catch (err: any) {
            context.log('Error fetching art piece:', err);
            throw err;
        }

        // Check ownership
        if (callerRole !== 'admin' && artPiece.userId !== callerUserId) {
            return {
                status: 403,
                body: JSON.stringify({ error: 'Not authorized to modify this art piece' }),
            };
        }

        // 6) Toggle publishOnMarket
        const current = artPiece.publishOnMarket === true;
        artPiece.publishOnMarket = !current;
        artPiece.updatedAt = new Date().toISOString();
        const action = artPiece.publishOnMarket ? 'published' : 'unpublished';

        // 7) Persist
        await artPiecesContainer
            .item(String(artPiece.id), String(artPiece.userId))
            .replace(artPiece);
        context.log(`ArtPiece ${artPieceId} ${action} on market by user ${callerUserId}`);

        // 8) Response
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                action,
                artPieceId,
                publishOnMarket: artPiece.publishOnMarket,
            }),
        };
    } catch (err: any) {
        context.log('Unhandled error:', err);
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

app.http('userTogglesPublishOfArtPiece', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: userTogglesPublishOfArtPiece,
});
