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
        // 1) Authenticate: extract and verify the JWT
        const authHeader =
            readHeader(request, 'Authorization') || request.headers.get('authorization');
        if (!authHeader) {
            return { status: 401, body: `Missing Authorization header ${authHeader}` };
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
                body: `Invalid or expired token ${authHeader}: ${
                    err.message
                } currentTime=${new Date().toISOString()}`,
            };
        }

        // 2) Parse request body
        const { artPieceId } = (await request.json()) as { artPieceId: string };
        if (!artPieceId) {
            return { status: 400, body: 'Missing artPieceId in request body' };
        }

        // 3) Authorize: determine the effective userId
        const callerRole = payload.role;
        const callerId = payload.userId || payload.sub;
        if (!callerId) {
            return { status: 401, body: 'Token missing' };
        }

        const userId = callerRole === 'admin' ? callerId : payload.userId;

        if (callerRole !== 'admin' && userId === payload.userId) {
            return { status: 403, body: 'You cannot buy your own art piece' };
        }

        // 4) Check if the art piece exists and is available for purchase
        const artPiece = await artContainer.item(artPieceId).read();
        if (!artPiece.resource) {
            return { status: 404, body: `Art piece with ID ${artPieceId} not found` };
        }

        // 5) Perform the transfer
        const sellerId = artPiece.resource.userId;
        if (!sellerId) {
            return { status: 404, body: `Seller not found for art piece ID ${artPieceId}` };
        }
        if (sellerId === userId) {
            return { status: 403, body: 'You cannot buy your own art piece' };
        }

        // Add artpieceid to buyer's collection in "createdPieces" array and remove from seller
        const buyerUpdate = await usersContainer.item(userId).patch([
            {
                op: 'add',
                path: '/createdPieces',
                value: [artPieceId],
            },
        ]);

        const sellerUpdate = await usersContainer.item(sellerId).patch([
            {
                op: 'remove',
                path: '/createdPieces',
                value: [artPieceId],
            },
        ]);

        // Update artPiece's userId to the buyer
        const artUpdate = await artContainer.item(artPieceId).replace({
            ...artPiece.resource,
            userId: userId,
        });

        context.log(
            `Successfully transferred art piece ${artPieceId} from user ${sellerId} to user ${userId}`
        );

        // try {
        //     const redis = await getRedisClient();
        //     const cacheKey = `userLikedItems:${userId}`;
        //     await redis.set(cacheKey, JSON.stringify(user.likedArtPieces));
        //     context.log(`Redis cache updated (${cacheKey})`);
        // } catch (redisErr: any) {
        //     context.log(`Redis update failed: ${redisErr.message}`);
        // }
        // Optionally update Redis cache
        try {
            const redis = await getRedisClient();
            const cacheKey = `userCreatedPieces:${userId}`;
            await redis.set(cacheKey, JSON.stringify(buyerUpdate.resource.createdPieces));
            context.log(`Redis cache updated (${cacheKey})`);
        } catch (redisErr: any) {
            context.log(`Redis update failed: ${redisErr.message}`);
        }

        // 6) Return success response
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                message: `${sellerId}'s Art piece ${artPieceId} was successfully purchased by user ${userId}`,
                artPieceId,
                buyerId: userId,
                sellerId,
            }),
        };
    } catch (error) {
        context.log('Error during authentication:', error);
        return { status: 500, body: error };
    }
}

app.http('UserBuysArtPiece', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: UserBuysArtPiece,
});

// Security: Only the authenticated buyer (token.userId) or an admin role may call this. Do NOT expose to anonymous users.
