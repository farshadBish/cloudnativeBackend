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

        // Create email content
        const url = process.env.SEND_EMAIL_ENDPOINT;
        const plainText = `
Order Confirmation

Your order on ${orderDate} is confirmed. Estimated delivery: ${deliveryDate}.

Items:
${artPieces.map((art, idx) => `- ${art.title} (€${subtotals[idx].toFixed(2)})`).join('\n')}

Subtotal: €${subtotals.reduce((a, b) => a + b, 0).toFixed(2)}
Shipping: €${shipping.toFixed(2)}
Tax: €${tax.toFixed(2)}
Total: €${total.toFixed(2)}
        `;

        // Simplified HTML template
        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Confirmation</title>
    <style>
        body { font-family: Georgia, serif; color: #6d5c44; line-height: 1.6; margin: 0; padding: 0; background-color: #faf7f2; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff; border: 1px solid #e0d5c1; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #e0d5c1; }
        .logo { font-size: 28px; color: #b39069; letter-spacing: 2px; }
        .content { padding: 30px 20px; }
        h1 { color: #967259; font-size: 24px; margin-bottom: 20px; }
        .order-details { background: #f9f6f1; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .button { display: inline-block; background-color: #c1a178; color: white; text-decoration: none; padding: 12px 30px; border-radius: 3px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; font-size: 13px; color: #a99780; border-top: 1px solid #e0d5c1; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">NIMAH</div>
            <div style="font-size: 14px; color: #b39069; letter-spacing: 1px;">CURATED EXPERIENCE</div>
        </div>
        
        <div class="content">
            <h1>Order Confirmation</h1>
            <p>Thank you for your order! We're preparing your items for shipment.</p>
            
            <div class="order-details">
                <h3>Order Details</h3>
                <p><strong>Order Date:</strong> ${orderDate}</p>
                <p><strong>Estimated Delivery:</strong> ${deliveryDate}</p>
                
                <h4>Items:</h4>
                ${artPieces
                    .map((art, idx) => `<p>• ${art.title} - €${subtotals[idx].toFixed(2)}</p>`)
                    .join('')}
                
                <hr style="margin: 15px 0; border: none; border-top: 1px solid #e0d5c1;">
                <p><strong>Subtotal:</strong> €${subtotals
                    .reduce((a, b) => a + b, 0)
                    .toFixed(2)}</p>
                <p><strong>Shipping:</strong> €${shipping.toFixed(2)}</p>
                <p><strong>Tax:</strong> €${tax.toFixed(2)}</p>
                <p><strong>Total:</strong> €${total.toFixed(2)}</p>
            </div>
            
            <a href="https://front-end-cloud-native-dueuf4arfsfkgebe.westeurope-01.azurewebsites.net/users-art" class="button">View My Art</a>
        </div>
        
        <div class="footer">
            <p>© 2025 Nimah Art Boutique. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;

        // Log the email payload for debugging
        const emailPayload = {
            to: buyer.email,
            subject: 'NIMAH - Order Confirmation',
            plainText: plainText.trim(),
            html: htmlContent.trim(),
        };

        context.log('Email payload:', {
            to: emailPayload.to,
            subject: emailPayload.subject,
            plainTextLength: emailPayload.plainText.length,
            htmlLength: emailPayload.html.length,
        });

        // Send email with better error handling
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(emailPayload),
            });

            context.log('Email service response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                context.log('Email service error response:', errorText);
                throw new Error(`Email service returned ${response.status}: ${errorText}`);
            }

            const responseData = await response.json();
            context.log('Email sent successfully:', responseData);
        } catch (emailErr: any) {
            context.log('Error sending email:', emailErr.message);
            // Don't fail the entire transaction if email fails
            context.log('Transaction completed but email notification failed');
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
