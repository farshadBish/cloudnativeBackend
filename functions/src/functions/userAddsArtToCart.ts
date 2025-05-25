import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';
import * as dotenv from 'dotenv';
import { getRedisClient } from '../../util/redisClient';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';

dotenv.config();

export async function userAddsArtToCart(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const usersContainerId = 'Users';
    const artPiecesContainerId = 'ArtPieces';

    try {
        // 1) Authenticate: extract & verify JWT
        const authHeader =
            readHeader(request, 'Authorization') || request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                status: 401,
                body: JSON.stringify({ error: 'Missing or malformed Authorization header' }),
            };
        }

        const token = authHeader.slice('Bearer '.length);
        let payload;
        try {
            payload = verifyJWT(token);
        } catch (err: any) {
            context.log('JWT verification failed:', err.message);
            return {
                status: 401,
                body: JSON.stringify({ error: 'Invalid or expired token', details: err.message }),
            };
        }

        // 2) Parse body
        const { userId: requestedUserId, artPieceId } = (await request.json()) as {
            userId: number;
            artPieceId: number;
        };
        if (!artPieceId) {
            return {
                status: 400,
                body: JSON.stringify({ error: 'ArtPieceId are required' }),
            };
        }

        // 3) Authorize: determine effective userId
        const callerRole = payload.role as string;
        const callerUserId = payload.userId || payload.sub;
        if (!callerUserId) {
            return { status: 401, body: JSON.stringify({ error: 'Token missing userId' }) };
        }
        const userId = callerRole === 'admin' ? requestedUserId : callerUserId;
        if (callerRole !== 'admin' && requestedUserId !== callerUserId) {
            context.log(`Non-admin (${callerUserId}) forced to own userId for cart.`);
        }

        context.log(
            `Cart toggle for userId=${userId}, artPieceId=${artPieceId} (role=${callerRole})`
        );

        // 4) Init Cosmos containers
        const usersContainer = getContainer(usersContainerId);
        const artPiecesContainer = getContainer(artPiecesContainerId);

        // 5) Load user
        let user;
        try {
            const { resource } = await usersContainer.item(String(userId), String(userId)).read();
            if (!resource) {
                return {
                    status: 404,
                    body: JSON.stringify({ error: `User ${userId} not found` }),
                };
            }
            user = resource;
        } catch (err: any) {
            context.log('Error fetching user:', err);
            const status = err.code === 404 ? 404 : 500;
            return {
                status,
                body: JSON.stringify({
                    error: status === 404 ? `User ${userId} not found` : 'Error reading user',
                }),
            };
        }

        // 6) Load artPiece (cross-partition query)
        let artPiece;
        try {
            const { resources } = await artPiecesContainer.items
                .query(
                    {
                        query: 'SELECT * FROM c WHERE c.id = @id',
                        parameters: [{ name: '@id', value: artPieceId }],
                    },
                    { partitionKey: undefined, maxItemCount: 1 }
                )
                .fetchAll();
            if (!resources.length) {
                return {
                    status: 404,
                    body: JSON.stringify({ error: `Art piece ${artPieceId} not found` }),
                };
            }
            artPiece = resources[0];
        } catch (err) {
            context.log('Error fetching art piece:', err);
            throw err;
        }

        // 7) Toggle in cart
        user.cart = user.cart || [];
        artPiece.inCart = artPiece.inCart || [];

        const alreadyIn = user.cart.includes(artPieceId);
        let action: 'added' | 'removed';
        if (alreadyIn) {
            user.cart = user.cart.filter((id: number) => id !== artPieceId);
            artPiece.inCart = artPiece.inCart.filter((id: number) => id !== userId);
            action = 'removed';
        } else {
            user.cart.push(artPieceId);
            artPiece.inCart.push(userId);
            action = 'added';
        }

        const now = new Date().toISOString();
        user.updatedAt = now;
        artPiece.updatedAt = now;

        // 8) Persist updates
        await usersContainer.item(String(userId), String(userId)).replace(user);
        await artPiecesContainer
            .item(String(artPiece.id), String(artPiece.userId))
            .replace(artPiece);

        // 9) Refresh Redis cache
        try {
            const redis = await getRedisClient();
            await redis.set(`userCart:${userId}`, JSON.stringify(user.cart));
        } catch (redisErr: any) {
            context.log('Redis update failed:', redisErr.message);
        }

        // 10) Return
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                action,
                userId,
                artPieceId,
                cartSize: user.cart.length,
                inCartCount: artPiece.inCart.length,
            }),
        };
    } catch (err: any) {
        context.log('Unhandled error in cart toggle:', err);
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

app.http('userAddsArtToCart', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: userAddsArtToCart,
});
