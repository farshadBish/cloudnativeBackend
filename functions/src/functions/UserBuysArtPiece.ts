import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';
import { getRedisClient } from '../../util/redisClient';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Processes bulk purchase transactions and sends order confirmation email.
 * Accepts arrays of artPieceIds and subtotals.
 */
export async function UserBuysArtPiece(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const usersContainer = getContainer('Users');
    const artContainer = getContainer('ArtPieces');

    try {
        // 1) Authenticate
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

        // 2) Parse and validate body arrays
        const {
            artPieceId: artPieceIds,
            subtotal: subtotals,
            tax,
            shipping,
            total,
            orderDate,
            deliveryDate,
        } = (await request.json()) as {
            artPieceId: string[];
            subtotal: number[];
            tax: number;
            shipping: number;
            total: number;
            orderDate: string;
            deliveryDate: string;
        };

        // log every field for debugging
        context.log('Request body:', {
            artPieceIds,
            subtotals,
            tax,
            shipping,
            total,
            orderDate,
            deliveryDate,
        });

        if (!Array.isArray(artPieceIds) || artPieceIds.length === 0) {
            return { status: 400, body: JSON.stringify({ error: 'artPieceId array is required' }) };
        }
        if (!Array.isArray(subtotals) || subtotals.length !== artPieceIds.length) {
            return {
                status: 400,
                body: JSON.stringify({ error: 'subtotal array must match artPieceId length' }),
            };
        }

        // 3) Bulk load art pieces via cross-partition query
        const querySpec = {
            query: `SELECT * FROM c WHERE ARRAY_CONTAINS(@ids, c.id)`,
            parameters: [{ name: '@ids', value: artPieceIds }],
        };
        const { resources: artPieces } = await artContainer.items
            .query(querySpec, { partitionKey: undefined })
            .fetchAll();
        if (artPieces.length !== artPieceIds.length) {
            return { status: 404, body: JSON.stringify({ error: 'Some art pieces not found' }) };
        }

        // 4) Update each artPiece ownership, collect sellerIds
        const sellersMap: Record<string, any> = {};

        // Load buyer user once
        const buyerRes = await usersContainer.item(callerId, callerId).read();
        const buyer = buyerRes.resource;
        if (!buyer) {
            return { status: 404, body: JSON.stringify({ error: 'Buyer not found' }) };
        }

        // Process each art piece
        for (let idx = 0; idx < artPieceIds.length; idx++) {
            const id = artPieceIds[idx];
            const art = artPieces.find((a) => a.id === id)!;
            const sellerId = art.userId;
            if (!sellerId) {
                return {
                    status: 400,
                    body: JSON.stringify({ error: `Art piece ${id} missing owner` }),
                };
            }
            if (sellerId === callerId && payload.role !== 'admin') {
                return { status: 403, body: JSON.stringify({ error: 'Cannot purchase own art' }) };
            }
            // Load seller if not yet
            if (!sellersMap[sellerId]) {
                const sellerRes = await usersContainer.item(sellerId, sellerId).read();
                sellersMap[sellerId] = sellerRes.resource;
                if (!sellersMap[sellerId]) {
                    return {
                        status: 404,
                        body: JSON.stringify({ error: `Seller ${sellerId} not found` }),
                    };
                }
            }
            // Update arrays in-memory
            sellersMap[sellerId].createdPieces =
                sellersMap[sellerId].createdPieces?.filter((i: string) => i !== id) || [];
            buyer.createdPieces = Array.from(new Set([...(buyer.createdPieces || []), id]));
            buyer.likedArtPieces = buyer.likedArtPieces?.filter((i: string) => i !== id) || [];
            buyer.cart = buyer.cart?.filter((i: string) => i !== id) || [];
            art.userId = callerId;
            art.updatedAt = new Date().toISOString();

            // Persist per art: replace users and move doc
            await Promise.all([
                usersContainer.item(sellerId, sellerId).replace(sellersMap[sellerId]),
                artContainer.item(id, sellerId).delete(),
                artContainer.items.create(art),
            ]);
        }
        // Persist buyer after loop
        await usersContainer.item(callerId, callerId).replace(buyer);

        // Invalidate caches
        getRedisClient()
            .then((redis) =>
                Promise.all([
                    ...Object.keys(sellersMap).map((id) => redis.del(`userArtPieces:${id}`)),
                    redis.del(`userArtPieces:${callerId}`),
                    redis.del(`userCart:${callerId}`),
                    redis.del(`userLikedItems:${callerId}`),
                ])
            )
            .catch((e) => context.log('Redis cache error:', e));

        // -----------------

        const { EmailClient, KnownEmailSendStatus } = require('@azure/communication-email');

        const connectionString = process.env.EMAIL_SERVICE_CONNECTION_STRING;
        const senderAddress = 'DoNotReply@1eb6d9a4-e40d-4fe7-a440-6b76ada5cd60.azurecomm.net';

        const subject = `Order Confirmation - ${artPieceIds.length} Art Piece(s) Purchased`;
        const plainText = `Thank you for your purchase! You have successfully bought ${artPieceIds.length} art piece(s).`;
        const html = `<p>Thank you for your purchase!</p><p>You have successfully bought ${artPieceIds.length} art piece(s).</p>`;

        interface EmailRequest {
            to: string;
            subject: string;
            plainText: string;
            html: string;
        }

        const message = {
            senderAddress,
            recipients: {
                to: [{ address: buyer.email }],
            },
            content: {
                subject,
                plainText,
                html,
            },
        };

        try {
            const client = new EmailClient(connectionString);
            const poller = await client.beginSend(message);

            const result = await poller.pollUntilDone();
            if (result.status === KnownEmailSendStatus.Succeeded) {
                context.log({
                    status: 202,
                    body: JSON.stringify({
                        message: 'Email sent successfully',
                        operationId: result.id,
                        status: result.status,
                    }),
                });
            } else {
                throw new Error(`Email sending failed with status: ${result.status}`);
            }
        } catch (error) {
            console.error('Error sending email:', error);
            return {
                status: 500,
                body: JSON.stringify({
                    message: 'Error sending email',
                    error: error.message,
                }),
            };
        }

        // -----------------

        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true }),
        };
    } catch (err: any) {
        context.log('Error:', err);
        const status = err.code === 429 ? 429 : 500;
        return {
            status,
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
