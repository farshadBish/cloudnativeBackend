import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';
import { getRedisClient } from '../../util/redisClient';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';
import * as dotenv from 'dotenv';
import axios from 'axios';

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
        const buyersMap: any = {};

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

        // Send summary email
        // // 6) Send summary email using axios instead of fetch
        // try {
        //     const url = process.env.SEND_EMAIL_ENDPOINT;
        //     // post request to url
        //     const response = await fetch(url, {
        //         method: 'POST',
        //         headers: {
        //             'Content-Type': 'application/json',
        //         },
        //         body: JSON.stringify({
        //             to: buyer.email,
        //             subject: 'NIMAH - Order Confirmation',
        //             plainText: `Thank you for your order! Your order details are as follows: ABCDEFG`,
        //             html: `<!DOCTYPE html>
        // <html lang="en">
        // <head>
        //     <meta charset="UTF-8">
        //     <meta name="viewport" content="width=device-width, initial-scale=1.0">
        //     <title>Welcome to Our Community</title>
        //     <style>
        //         body {
        //             font-family: 'Georgia', serif;
        //             color: #6d5c44;
        //             line-height: 1.6;
        //             margin: 0;
        //             padding: 0;
        //             background-color: #faf7f2;
        //         }
        //         .email-container {
        //             max-width: 600px;
        //             margin: 0 auto;
        //             padding: 20px;
        //             background-color: #fff;
        //             border: 1px solid #e0d5c1;
        //         }
        //         .header {
        //             text-align: center;
        //             padding: 20px 0;
        //             border-bottom: 1px solid #e0d5c1;
        //         }
        //         .logo {
        //             font-size: 28px;
        //             color: #b39069;
        //             letter-spacing: 2px;
        //             font-weight: normal;
        //         }
        //         .tagline {
        //             font-size: 14px;
        //             color: #b39069;
        //             letter-spacing: 1px;
        //             margin-top: 5px;
        //         }
        //         .content {
        //             padding: 30px 20px;
        //             text-align: center;
        //         }
        //         h1 {
        //             color: #967259;
        //             font-size: 28px;
        //             font-weight: normal;
        //             margin-bottom: 20px;
        //         }
        //         p {
        //             color: #6d5c44;
        //             font-size: 16px;
        //             margin-bottom: 20px;
        //         }
        //         .button-container {
        //             text-align: center;
        //             margin: 35px 0;
        //         }
        //         /* Override default link styling for the button */
        //         a.button, .button {
        //             display: inline-block;
        //             background-color: #c1a178;
        //             color: white !important;
        //             text-decoration: none !important;
        //             padding: 14px 40px;
        //             font-size: 16px;
        //             border-radius: 3px;
        //             transition: background-color 0.3s;
        //         }
        //         a.button:hover, .button:hover {
        //             background-color: #b39069;
        //         }
        //         .footer {
        //             text-align: center;
        //             padding: 20px;
        //             font-size: 13px;
        //             color: #a99780;
        //             border-top: 1px solid #e0d5c1;
        //         }
        //         .social-links {
        //             margin: 15px 0;
        //         }
        //         .social-links a {
        //             color: #b39069;
        //             margin: 0 10px;
        //             text-decoration: none;
        //         }
        //     </style>
        // </head>
        // <body>
        //     <div class="email-container">
        //         <div class="header">
        //             <div class="logo">NIMAH</div>
        //             <div class="tagline">CURATED EXPERIENCE</div>
        //         </div>

        //         <div class="content">
        //             <h1>Thank you for your order!</h1>
        //             <p>Your order details are as follows:</p>
        //             <p><strong>Art Piece IDs:</strong> ${artPieceIds.join(', ')}</p>
        //             <p><strong>Subtotals:</strong> ${subtotals.join(', ')}</p>
        //             <p><strong>Tax:</strong> ${tax}</p>
        //             <p><strong>Shipping:</strong> ${shipping}</p>
        //             <p><strong>Total:</strong> ${total}</p>
        //             <p><strong>Order Date:</strong> ${new Date(orderDate).toLocaleDateString()}</p>
        //             <p><strong>Estimated Delivery Date:</strong> ${new Date(
        //                 deliveryDate
        //             ).toLocaleDateString()}</p>
        //             <p>We appreciate your support and hope you enjoy your new art pieces!</p>

        //             <div class="button-container">
        //                 <a href="https://front-end-cloud-native-dueuf4arfsfkgebe.westeurope-01.azurewebsites.net/users-art" class="button">View your owned art pieces</a>
        //             </div>

        //             <p>If you didn't make an order, change your password immediately and contact your bank!</p>
        //         </div>

        //         <div class="footer">
        //             <p>© 2025 Nimah Art Boutique. All rights reserved.</p>
        //             <div class="social-links">
        //                 <a href="#">Instagram</a> | <a href="#">Facebook</a> | <a href="#">Twitter</a>
        //             </div>
        //             <p>You received this email because you signed up for our services.<br></p>
        //         </div>
        //     </div>
        // </body>
        // </html>`,
        //         }),
        //     });
        //     const data = await response.json();
        //     return data;
        // } catch (emailErr: any) {
        //     context.log('Error sending email:', emailErr);
        // }

        const url = process.env.SEND_EMAIL_ENDPOINT;

        // const response = await fetch(url, {
        // anonymous async function
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to: buyer.email,
                subject: 'NIMAH - Order Confirmation',
                plainText: '',
                html: `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to Our Community</title>
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
                }
                .header {
                    text-align: center;
                    padding: 20px 0;
                    border-bottom: 1px solid #e0d5c1;
                }
                .logo {
                    font-size: 28px;
                    color: #b39069;
                    letter-spacing: 2px;
                    font-weight: normal;
                }
                .tagline {
                    font-size: 14px;
                    color: #b39069;
                    letter-spacing: 1px;
                    margin-top: 5px;
                }
                .content {
                    padding: 30px 20px;
                    text-align: center;
                }
                h1 {
                    color: #967259;
                    font-size: 28px;
                    font-weight: normal;
                    margin-bottom: 20px;
                }
                p {
                    color: #6d5c44;
                    font-size: 16px;
                    margin-bottom: 20px;
                }
                .button-container {
                    text-align: center;
                    margin: 35px 0;
                }
                /* Override default link styling for the button */
                a.button, .button {
                    display: inline-block;
                    background-color: #c1a178;
                    color: white !important;
                    text-decoration: none !important;
                    padding: 14px 40px;
                    font-size: 16px;
                    border-radius: 3px;
                    transition: background-color 0.3s;
                }
                a.button:hover, .button:hover {
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
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <div class="logo">NIMAH</div>
                    <div class="tagline">CURATED EXPERIENCE</div>
                </div>
                
                <div class="content">
                    <h1>We're working on your order!</h1>
                    <p>Thanks for palcing your order</p>
                    
                    <div class="button-container">
                        <a href="https://front-end-cloud-native-dueuf4arfsfkgebe.westeurope-01.azurewebsites.net/users-art" class="button">View my Art</a>
                    </div>
                    
                </div>
                
                <div class="footer">
                    <p>© 2025 Nimah Art Boutique. All rights reserved.</p>
                    <div class="social-links">
                        <a href="#">Instagram</a> | <a href="#">Facebook</a> | <a href="#">Twitter</a>
                    </div>
                    <p>You received this email because you signed up for our services.<br></p>
                </div>
            </div>
        </body>
        </html>`,
            }),
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Email service returned ${response.status}`);
                }
            })
            .then(() => context.log('Email sent successfully'))
            .catch((emailErr) => context.log('Error sending email:', emailErr));

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
