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
 *
 * Only the buyer (or an admin) may invoke this endpoint.
 */
export async function UserBuysArtPiece(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const usersContainer = getContainer('Users');
    const artContainer = getContainer('ArtPieces');

    try {
        // 1) Authenticate & authorize
        const auth = readHeader(request, 'Authorization') || request.headers.get('authorization');
        if (!auth?.startsWith('Bearer ')) {
            return {
                status: 401,
                body: JSON.stringify({ error: 'Missing or malformed Authorization header' }),
            };
        }
        const token = auth.slice(7);
        let payload;
        try {
            payload = verifyJWT(token);
        } catch (err) {
            context.log('JWT error:', err);
            return { status: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) };
        }

        const buyerId = payload.userId || payload.sub;
        if (!buyerId) {
            return { status: 401, body: JSON.stringify({ error: 'Token missing userId claim' }) };
        }
        const { role } = payload;

        // 2) Parse & validate
        // const { artPieceId } = await request.json();

        /*
        correct way:
        const { title, description, artist, userId, price, tags, year, url } =
        (await request.json()) as ArtPiece;
        */

        const { artPieceId } = (await request.json()) as { artPieceId: string };

        if (typeof artPieceId !== 'string') {
            return { status: 400, body: JSON.stringify({ error: 'artPieceId must be a string' }) };
        }

        // 3) Load art piece
        const artQuery = {
            query: 'SELECT * FROM c WHERE c.id = @id',
            parameters: [{ name: '@id', value: artPieceId }],
        };
        const { resources: arts } = await artContainer.items.query(artQuery).fetchAll();
        if (arts.length === 0) {
            return { status: 404, body: JSON.stringify({ error: 'Art piece not found' }) };
        }
        const artPiece = arts[0];
        const sellerId = artPiece.userId;

        // Prevent self-purchase unless admin
        if (sellerId === buyerId && role !== 'admin') {
            return { status: 403, body: JSON.stringify({ error: 'Cannot buy your own art' }) };
        }

        // 4) Parallel fetch buyer & seller
        const [sellerRead, buyerRead] = await Promise.all([
            usersContainer.item(sellerId, sellerId).read(),
            usersContainer.item(buyerId, buyerId).read(),
        ]);
        const seller = sellerRead.resource;
        const buyer = buyerRead.resource;
        if (!seller || !buyer) {
            return { status: 404, body: JSON.stringify({ error: 'User not found' }) };
        }

        // 5) Mutate in-memory
        seller.createdPieces = (seller.createdPieces || []).filter((id) => id !== artPieceId);
        buyer.createdPieces = [...(buyer.createdPieces || []), artPieceId];
        artPiece.userId = buyerId;
        artPiece.updatedAt = new Date().toISOString();

        // 6) Persist all three updates in parallel
        await Promise.all([
            usersContainer.item(sellerId, sellerId).replace(seller),
            usersContainer.item(buyerId, buyerId).replace(buyer),
            artContainer.item(artPieceId, buyerId).replace(artPiece),
        ]);

        // 7) Invalidate caches
        getRedisClient()
            .then((redis) =>
                Promise.all([
                    redis.del(`userArtPieces:${sellerId}`),
                    redis.del(`userArtPieces:${buyerId}`),
                ])
            )
            .catch((e) => context.log('Redis error:', e));

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
    } catch (err) {
        context.log('Unhandled error:', err);
        return {
            status: err.code === 429 ? 429 : 500,
            headers: {
                'Content-Type': 'application/json',
                ...(err.code === 429 ? { 'Retry-After': '10' } : {}),
            },
            body: JSON.stringify({
                error: err.code === 429 ? 'Too many requests' : 'Internal Server Error',
            }),
        };
    }
}

app.http('UserBuysArtPiece', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: UserBuysArtPiece,
});

// Security: Only the authenticated buyer (token.userId) or an admin role may call this. Do NOT expose to anonymous users.
