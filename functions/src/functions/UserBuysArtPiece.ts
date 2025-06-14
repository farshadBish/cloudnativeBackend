import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';
import { getRedisClient } from '../../util/redisClient';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Moves ownership of an art piece from seller to buyer.
 * - Authenticated users may purchase (but cannot buy their own art).
 * - Admins may perform any transfer.
 *
 * Example POST /api/UserBuysArtPiece
 * Headers: Authorization: Bearer <token>
 * Body: { artPieceId: "<uuid>" }
 */
export async function UserBuysArtPiece(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const usersContainer = getContainer('Users');
    const artContainer = getContainer('ArtPieces');

    try {
        // 1) Authenticate
        const authHeader =
            readHeader(request, 'Authorization') || request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return {
                status: 401,
                body: JSON.stringify({ error: 'Missing or malformed Authorization header' }),
            };
        }
        const token = authHeader.substring('Bearer '.length);
        let payload;
        try {
            payload = verifyJWT(token);
        } catch (err: any) {
            context.log('JWT verification failed:', err.message);
            return { status: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) };
        }

        const buyerId = payload.userId || payload.sub;
        if (!buyerId) {
            return { status: 401, body: JSON.stringify({ error: 'Token missing userId claim' }) };
        }
        const isAdmin = payload.role === 'admin';

        // 2) Parse and validate body
        const { artPieceId } = (await request.json()) as { artPieceId: string };
        if (!artPieceId) {
            return { status: 400, body: JSON.stringify({ error: 'artPieceId is required' }) };
        }

        // 3) Load art piece
        const { resource: artPiece } = await artContainer.item(artPieceId, undefined).read();
        if (!artPiece) {
            return { status: 404, body: JSON.stringify({ error: 'Art piece not found' }) };
        }
        const sellerId = artPiece.userId;
        if (!sellerId) {
            return { status: 400, body: JSON.stringify({ error: 'Art piece missing owner' }) };
        }

        // 4) Authorization: prevent self-purchase
        if (!isAdmin && sellerId === buyerId) {
            return {
                status: 403,
                body: JSON.stringify({ error: 'Cannot purchase your own art piece' }),
            };
        }

        // 5) Load seller and buyer
        const [sellerRes, buyerRes] = await Promise.all([
            usersContainer.item(sellerId, sellerId).read(),
            usersContainer.item(buyerId, buyerId).read(),
        ]);
        const seller = sellerRes.resource;
        const buyer = buyerRes.resource;
        if (!seller || !buyer) {
            return { status: 404, body: JSON.stringify({ error: 'Seller or buyer not found' }) };
        }

        // 6) Update in-memory arrays
        seller.createdPieces = (seller.createdPieces || []).filter(
            (id: string) => id !== artPieceId
        );
        buyer.createdPieces = Array.from(new Set([...(buyer.createdPieces || []), artPieceId]));
        artPiece.userId = buyerId;
        artPiece.updatedAt = new Date().toISOString();

        // 7) Persist changes
        // Replace users
        await Promise.all([
            usersContainer.item(sellerId, sellerId).replace(seller),
            usersContainer.item(buyerId, buyerId).replace(buyer),
        ]);
        // Delete old art and recreate under new owner partition key
        await artContainer.item(artPieceId, sellerId).delete();
        await artContainer.items.create(artPiece);

        // 8) Invalidate caches (non-blocking)
        getRedisClient()
            .then((redis) =>
                Promise.all([
                    redis.del(`userCreatedPieces:${sellerId}`),
                    redis.del(`userCreatedPieces:${buyerId}`),
                ])
            )
            .catch((e) => context.log('Redis cache error:', e));

        // 9) Respond
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                artPieceId,
                oldOwner: sellerId,
                newOwner: buyerId,
            }),
        };
    } catch (err: any) {
        context.log('Unhandled error:', err);
        const status = err.code === 429 ? 429 : 500;
        return {
            status,
            headers: {
                'Content-Type': 'application/json',
                ...(status === 429 ? { 'Retry-After': '10' } : {}),
            },
            body: JSON.stringify({
                error: status === 429 ? 'Too many requests' : 'Internal Server Error',
                details: err.message,
            }),
        };
    }
}

app.http('UserBuysArtPiece', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: UserBuysArtPiece,
});
