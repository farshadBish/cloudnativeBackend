import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';
import { getRedisClient } from '../../util/redisClient';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Processes bulk purchase transactions and sends order confirmation email.
 * Accepts arrays of artPieceIds and subtotals (in cents) and corrects to euros.
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

        context.log('Raw request body:', {
            artPieceIds,
            subtotals,
            tax,
            shipping,
            total,
            orderDate,
            deliveryDate,
        });

        // Convert costs from cents to euros (divide by 100)
        const correctedSubtotals = subtotals.map((s) => s / 100);
        const correctedTax = tax / 100;
        const correctedShipping = shipping / 100;
        const correctedTotal = total / 100;

        // Ensure deliveryDate includes year if missing
        let finalDeliveryDate = deliveryDate;
        if (!/\d{4}/.test(deliveryDate)) {
            const currentYear = new Date().getFullYear();
            finalDeliveryDate = `${deliveryDate}, ${currentYear}`;
        }

        context.log('Corrected values:', {
            correctedSubtotals,
            correctedTax,
            correctedShipping,
            correctedTotal,
            finalDeliveryDate,
        });

        if (!Array.isArray(artPieceIds) || artPieceIds.length === 0) {
            return { status: 400, body: JSON.stringify({ error: 'artPieceId array is required' }) };
        }
        if (
            !Array.isArray(correctedSubtotals) ||
            correctedSubtotals.length !== artPieceIds.length
        ) {
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
            sellersMap[sellerId].createdPieces =
                sellersMap[sellerId].createdPieces?.filter((i: string) => i !== id) || [];
            buyer.createdPieces = Array.from(new Set([...(buyer.createdPieces || []), id]));
            buyer.likedArtPieces = buyer.likedArtPieces?.filter((i: string) => i !== id) || [];
            buyer.cart = buyer.cart?.filter((i: string) => i !== id) || [];
            art.userId = callerId;
            art.updatedAt = new Date().toISOString();

            await Promise.all([
                usersContainer.item(sellerId, sellerId).replace(sellersMap[sellerId]),
                artContainer.item(id, sellerId).delete(),
                artContainer.items.create(art),
            ]);
        }
        await usersContainer.item(callerId, callerId).replace(buyer);

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

        // -------------- Email sending with corrected values --------------

        const { EmailClient, KnownEmailSendStatus } = require('@azure/communication-email');

        const connectionString = process.env.EMAIL_SERVICE_CONNECTION_STRING;
        const senderAddress = 'DoNotReply@1eb6d9a4-e40d-4fe7-a440-6b76ada5cd60.azurecomm.net';

        const subject = `Order Confirmation - ${artPieceIds.length} Art Piece(s) Purchased`;
        const plainText = `Thank you for your purchase! You have successfully bought ${artPieceIds.length} art piece(s).`;
        const html = `
        <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Confirmation - NIMAH</title>
    <style>
        body {
            font-family: 'Georgia', serif;
            color: #6d5c44;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            background-color: #faf7f2;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #fff;
            border: 1px solid #e0d5c1;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            padding: 20px 0;
            border-bottom: 1px solid #e0d5c1;
        }
        .logo {
            font-size: 32px;
            color: #b39069;
            letter-spacing: 3px;
            font-weight: normal;
            margin-bottom: 5px;
        }
        .tagline {
            font-size: 14px;
            color: #b39069;
            letter-spacing: 1px;
            margin-top: 5px;
        }
        .content {
            padding: 30px 20px;
        }
        .order-header {
            text-align: center;
            margin-bottom: 30px;
        }
        .order-header h1 {
            color: #967259;
            font-size: 28px;
            font-weight: normal;
            margin-bottom: 10px;
        }
        .order-number {
            background-color: #f5f2ed;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 16px;
            color: #6d5c44;
            margin-bottom: 20px;
        }
        .order-dates {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
            padding: 15px;
            background-color: #f9f6f1;
            border-radius: 5px;
        }
        .date-item {
            text-align: center;
            flex: 1;
        }
        .date-label {
            font-size: 12px;
            color: #a99780;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 5px;
        }
        .date-value {
            font-size: 16px;
            color: #6d5c44;
            font-weight: bold;
        }
        .art-pieces-section {
            margin-bottom: 30px;
        }
        .section-title {
            font-size: 20px;
            color: #967259;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e0d5c1;
        }
        .art-piece {
            display: flex;
            align-items: center;
            padding: 20px;
            margin-bottom: 15px;
            background-color: #fdfcfa;
            border: 1px solid #f0ebe0;
            border-radius: 8px;
        }
        .art-image {
            width: 120px;
            height: 120px;
            object-fit: cover;
            border-radius: 5px;
            margin-right: 20px;
            border: 1px solid #e0d5c1;
        }
        .art-details {
            flex: 1;
        }
        .art-title {
            font-size: 18px;
            color: #6d5c44;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .art-artist {
            font-size: 14px;
            color: #a99780;
            margin-bottom: 5px;
        }
        .art-description {
            font-size: 13px;
            color: #8a7a6b;
            margin-bottom: 10px;
            line-height: 1.4;
        }
        .art-year {
            font-size: 12px;
            color: #b39069;
            font-style: italic;
        }
        .art-price {
            text-align: right;
            font-size: 18px;
            color: #967259;
            font-weight: bold;
        }
        .order-summary {
            background-color: #f5f2ed;
            padding: 25px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        .summary-title {
            font-size: 18px;
            color: #967259;
            margin-bottom: 15px;
            text-align: center;
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e8e2d6;
        }
        .summary-row:last-child {
            border-bottom: none;
            padding-top: 15px;
            margin-top: 10px;
            border-top: 2px solid #d4c7b5;
        }
        .summary-label {
            color: #6d5c44;
            font-size: 14px;
        }
        .summary-value {
            color: #6d5c44;
            font-size: 14px;
            font-weight: bold;
        }
        .total-row .summary-label,
        .total-row .summary-value {
            font-size: 18px;
            color: #967259;
            font-weight: bold;
        }
        .button-container {
            text-align: center;
            margin: 35px 0;
        }
        .button {
            display: inline-block;
            background-color: #c1a178;
            color: white !important;
            text-decoration: none !important;
            padding: 14px 40px;
            font-size: 16px;
            border-radius: 5px;
            transition: background-color 0.3s;
            letter-spacing: 1px;
        }
        .button:hover {
            background-color: #b39069;
        }
        .footer {
            text-align: center;
            padding: 20px;
            font-size: 13px;
            color: #a99780;
            border-top: 1px solid #e0d5c1;
        }
        .social-links {
            margin: 15px 0;
        }
        .social-links a {
            color: #b39069;
            margin: 0 10px;
            text-decoration: none;
        }
        .security-notice {
            background-color: #fef9e7;
            border: 1px solid #f5e6a3;
            padding: 15px;
            border-radius: 5px;
            margin-top: 20px;
            font-size: 13px;
            color: #8a7a00;
        }
        @media (max-width: 600px) {
            .email-container {
                padding: 10px;
            }
            .art-piece {
                flex-direction: column;
                text-align: center;
            }
            .art-image {
                margin-right: 0;
                margin-bottom: 15px;
            }
            .order-dates {
                flex-direction: column;
                gap: 15px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="logo">NIMAH</div>
            <div class="tagline">CURATED EXPERIENCE</div>
        </div>

        <div class="content">
            <div class="order-header">
                <h1>Order Confirmation</h1>
                <div class="order-number">
                    Order #${Math.random().toString(36).substr(2, 9).toUpperCase()}
                </div>
            </div>

            <div class="order-dates">
                <div class="date-item">
                    <div class="date-label">Order Date</div>
                    <div class="date-value">${new Date(orderDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    })}</div>
                </div>
                <div class="date-item">
                    <div class="date-label">Estimated Delivery</div>
                    <div class="date-value">${new Date(deliveryDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    })}</div>
                </div>
            </div>

            <div class="art-pieces-section">
                <h2 class="section-title">Your Art Pieces</h2>
                ${await Promise.all(
                    artPieceIds.map(async (artPieceId, index) => {
                        try {
                            const response = await fetch(
                                `https://art-gallery-04-dzgcgshac3c4erbc.francecentral-01.azurewebsites.net/api/getArtPieceById?artPieceId=${artPieceId}`
                            );
                            const data = await response.json();
                            const artPiece = data.artPiece;

                            return `
                        <div class="art-piece">
                            <img src="${artPiece.url}" alt="${artPiece.title}" class="art-image" />
                            <div class="art-details">
                                <div class="art-title">${artPiece.title}</div>
                                <div class="art-artist">by ${artPiece.artist}</div>
                                <div class="art-description">${artPiece.description}</div>
                                <div class="art-year">${artPiece.year}</div>
                            </div>
                            <div class="art-price">€${(subtotals[index] / 100).toLocaleString(
                                'en-US',
                                { minimumFractionDigits: 2 }
                            )}</div>
                        </div>
                        `;
                        } catch (error) {
                            return `
                        <div class="art-piece">
                            <div class="art-image" style="background-color: #f0f0f0; display: flex; align-items: center; justify-content: center; color: #999;">
                                Image unavailable
                            </div>
                            <div class="art-details">
                                <div class="art-title">Art Piece</div>
                                <div class="art-artist">Artist Unknown</div>
                                <div class="art-description">Details unavailable</div>
                            </div>
                            <div class="art-price">€${(subtotals[index] / 100).toLocaleString(
                                'en-US',
                                { minimumFractionDigits: 2 }
                            )}</div>
                        </div>
                        `;
                        }
                    })
                ).then((pieces) => pieces.join(''))}
            </div>

            <div class="order-summary">
                <h3 class="summary-title">Order Summary</h3>
                ${subtotals
                    .map(
                        (subtotal, index) => `
                    <div class="summary-row">
                        <p class="summary-label">Art Piece ${index + 1}</p>
                        <p class="summary-value">€${(subtotal / 100).toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                        })}</p>
                    </div>
                `
                    )
                    .join('')}
                <div class="summary-row">
                    <p class="summary-label">Tax</p>
                    <p class="summary-value">€${(tax / 100).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                    })}</p>
                </div>
                <div class="summary-row">
                    <p class="summary-label">Shipping</p>
                    <p class="summary-value">€${(shipping / 100).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                    })}</p>
                </div>
                <div class="summary-row total-row">
                    <span class="summary-label">Total:</span>
                    <span class="summary-value"> €${(total / 100).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                    })}</span>
                </div>
            </div>

            <div class="button-container">
                <a href="https://front-end-cloud-native-dueuf4arfsfkgebe.westeurope-01.azurewebsites.net/users-art" class="button">View Your Collection</a>
            </div>

            <div class="security-notice">
                <strong>Security Notice:</strong> If you didn't make this order, please change your password immediately and contact your bank. Your account security is important to us.
            </div>
        </div>

        <div class="footer">
            <p>© 2025 Nimah Art Boutique. All rights reserved.</p>
            <div class="social-links">
                <a href="#">Instagram</a> | <a href="#">Facebook</a> | <a href="#">Twitter</a>
            </div>
            <p>You received this email because you made a purchase with us.<br>
            Questions? Reply to this email or contact our support team.</p>
        </div>
    </div>
</body>
</html> 
        `;

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
