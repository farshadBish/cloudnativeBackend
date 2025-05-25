import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';
import * as dotenv from 'dotenv';
import { getRedisClient } from '../../util/redisClient';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';

dotenv.config();

export async function userLikesArt(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const usersContainerId = 'Users';
    const artPiecesContainerId = 'ArtPieces';

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
        const { userId: requestedUserId, artPieceId } = (await request.json()) as {
            userId: number;
            artPieceId: number;
        };
        context.log(
            `Request body => requestedUserId: ${requestedUserId}, artPieceId: ${artPieceId}`
        );

        // Validate required parameters
        if (!artPieceId) {
            return {
                status: 400,
                body: JSON.stringify({ error: 'ArtPieceId is required' }),
            };
        }

        // 3) Authorize: determine the effective userId
        const callerRole = payload.role;
        const callerUserId = payload.userId || payload.sub;
        if (!callerUserId) {
            return { status: 401, body: 'Token missing userId claim' };
        }

        const userId = callerRole === 'admin' ? requestedUserId : callerUserId;

        if (callerRole !== 'admin' && requestedUserId !== callerUserId) {
            context.log(
                `Non-admin (${callerUserId}) tried to act on another user (${requestedUserId}), forcing to own id.`
            );
        }

        context.log(
            `Processing like/unlike for effective userId: ${userId}, artPieceId: ${artPieceId} (role=${callerRole})`
        );

        // 4) Initialize CosmosDB containers
        const usersContainer = getContainer(usersContainerId);
        const artPiecesContainer = getContainer(artPiecesContainerId);

        // 5) Fetch user document
        let user;
        try {
            const { resource: userResource } = await usersContainer
                .item(String(userId), String(userId))
                .read();
            user = userResource;
            if (!user) {
                return { status: 404, body: JSON.stringify({ error: `User ${userId} not found` }) };
            }
            context.log(`Fetched user ${userId}`);
        } catch (err: any) {
            context.log('Error fetching user:', err);
            if (err.code === 404) {
                return { status: 404, body: JSON.stringify({ error: `User ${userId} not found` }) };
            }
            throw err;
        }

        // 6) Fetch art piece (cross-partition)
        let artPiece;
        try {
            const querySpec = {
                query: 'SELECT * FROM c WHERE c.id = @id',
                parameters: [{ name: '@id', value: artPieceId }],
            };
            const { resources } = await artPiecesContainer.items
                .query(querySpec, { partitionKey: undefined, maxItemCount: 1 })
                .fetchAll();
            if (!resources || resources.length === 0) {
                return {
                    status: 404,
                    body: JSON.stringify({ error: `Art piece ${artPieceId} not found` }),
                };
            }
            artPiece = resources[0];
            context.log(`Fetched artPiece ${artPieceId} (owner ${artPiece.userId})`);
        } catch (err) {
            context.log('Error fetching art piece:', err);
            throw err;
        }

        // 7) Toggle like/unlike
        user.likedArtPieces = user.likedArtPieces || [];
        artPiece.likedBy = artPiece.likedBy || [];

        const alreadyLiked = user.likedArtPieces.includes(artPieceId);
        let action;
        if (alreadyLiked) {
            user.likedArtPieces = user.likedArtPieces.filter((id) => id !== artPieceId);
            artPiece.likedBy = artPiece.likedBy.filter((id) => id !== userId);
            action = 'unliked';
        } else {
            user.likedArtPieces.push(artPieceId);
            artPiece.likedBy.push(userId);
            action = 'liked';
        }

        const timestamp = new Date().toISOString();
        user.updatedAt = timestamp;
        artPiece.updatedAt = timestamp;

        // 8) Persist changes
        await usersContainer.item(String(userId), String(userId)).replace(user);
        await artPiecesContainer
            .item(String(artPiece.id), String(artPiece.userId))
            .replace(artPiece);
        context.log('Persisted user + artPiece updates');

        // 9) Update Redis cache
        try {
            const redis = await getRedisClient();
            const cacheKey = `userLikedItems:${userId}`;
            await redis.set(cacheKey, JSON.stringify(user.likedArtPieces));
            context.log(`Redis cache updated (${cacheKey})`);
        } catch (redisErr: any) {
            context.log(`Redis update failed: ${redisErr.message}`);
        }

        // 10) Return result
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                action,
                userId,
                artPieceId,
                likeCount: artPiece.likedBy.length,
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

app.http('userLikesArt', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: userLikesArt,
});
