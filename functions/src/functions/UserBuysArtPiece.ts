import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';
import { getRedisClient } from '../../util/redisClient';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Processes a purchase transaction and sends order confirmation email.
 * Expects the front-end to supply all transaction details.
 */
export async function UserBuysArtPiece(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const usersContainer = getContainer('Users');
    const artContainer = getContainer('ArtPieces');

    try {
        // Authenticate
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
        } catch (e: any) {
            context.log('JWT error:', e);
            return { status: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) };
        }
        const callerId = payload.userId || payload.sub;
        if (!callerId) {
            return { status: 401, body: JSON.stringify({ error: 'Token missing userId claim' }) };
        }

        // Parse transaction details from body
        const {
            artPieceId,
            buyerId,
            sellerId,
            subtotal,
            shipping,
            tax,
            total,
            paymentMethod,
            orderDate,
            estimatedDeliveryDate,
        } = (await request.json()) as {
            artPieceId: string;
            buyerId: string;
            sellerId: string;
            subtotal: number;
            shipping: number;
            tax: number;
            total: number;
            paymentMethod: string;
            orderDate: string;
            estimatedDeliveryDate: string;
        };
        // Basic validation
        if (!artPieceId || !buyerId || !sellerId) {
            return {
                status: 400,
                body: JSON.stringify({ error: 'Missing required transaction fields' }),
            };
        }
        if (buyerId !== callerId && payload.role !== 'admin') {
            return { status: 403, body: JSON.stringify({ error: 'Not authorized as buyer' }) };
        }

        // Load art piece metadata
        const querySpec = {
            query: 'SELECT * FROM c WHERE c.id = @id',
            parameters: [{ name: '@id', value: artPieceId }],
        };
        const { resources } = await artContainer.items
            .query(querySpec, { partitionKey: undefined })
            .fetchAll();
        if (!resources.length) {
            return { status: 404, body: JSON.stringify({ error: 'Art piece not found' }) };
        }
        const artPiece = resources[0];

        // Update ownership (same as earlier implementation)
        const [{ resource: seller }, { resource: buyer }] = await Promise.all([
            usersContainer.item(sellerId, sellerId).read(),
            usersContainer.item(buyerId, buyerId).read(),
        ]);
        if (!seller || !buyer) {
            return { status: 404, body: JSON.stringify({ error: 'Seller or buyer not found' }) };
        }
        seller.createdPieces = (seller.createdPieces || []).filter(
            (id: string) => id !== artPieceId
        );
        buyer.createdPieces = Array.from(new Set([...(buyer.createdPieces || []), artPieceId]));

        // remove artpieceid from buyer user's likedArtPieces array of ids and cart array of ids
        buyer.likedArtPieces = (buyer.likedArtPieces || []).filter(
            (id: string) => id !== artPieceId
        );
        buyer.cart = (buyer.cart || []).filter((id: string) => id !== artPieceId);

        artPiece.userId = buyerId;
        artPiece.updatedAt = new Date().toISOString();

        // Persist updates
        await Promise.all([
            usersContainer.item(sellerId, sellerId).replace(seller),
            usersContainer.item(buyerId, buyerId).replace(buyer),
            artContainer.item(artPieceId, sellerId).delete(),
            artContainer.items.create(artPiece),
        ]);
        getRedisClient()
            .then((redis) =>
                Promise.all([
                    redis.del(`userCreatedPieces:${sellerId}`),
                    redis.del(`userCreatedPieces:${buyerId}`),
                ])
            )
            .catch((e) => context.log('Redis error:', e));

        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, artPieceId, buyerId, sellerId, total }),
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
