import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';

import * as dotenv from 'dotenv';
dotenv.config();

export async function userAddsArtToCart(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    // Configuration from environment variables with proper names from .env

    const usersContainerId = 'Users';
    const artPiecesContainerId = 'ArtPieces';

    let usersContainer;
    let artPiecesContainer;

    try {
        // Initialize containers if not already done
        usersContainer = getContainer(usersContainerId);
        artPiecesContainer = getContainer(artPiecesContainerId);

        const { userId, artPieceId } = (await request.json()) as {
            userId: number;
            artPieceId: number;
        };

        context.log(
            `Processing cart operation for userId: "${userId}", artPieceId: "${artPieceId}"`
        );

        // Validate required parameters
        if (!userId || !artPieceId) {
            return {
                status: 400,
                body: JSON.stringify({
                    error: 'Missing required parameters: userId and artPieceId',
                }),
            };
        }

        // Get user document with proper error handling
        let user;
        try {
            context.log(`Fetching user with ID: "${userId}"`);
            const { resource: userResource } = await usersContainer.item(userId, userId).read();

            if (!userResource) {
                return {
                    status: 404,
                    body: JSON.stringify({ error: `User with ID ${userId} not found` }),
                };
            }

            user = userResource;
            context.log(`User document retrieved successfully: ${userId}`);
        } catch (error) {
            context.log(`Error fetching user: ${JSON.stringify(error)}`);
            if (error.code === 404) {
                return {
                    status: 404,
                    body: JSON.stringify({ error: `User with ID ${userId} not found` }),
                };
            }
            throw error;
        }

        // Get art piece document with cross-partition query
        let artPiece;
        try {
            const querySpec = {
                query: 'SELECT * FROM c WHERE c.id = @id',
                parameters: [{ name: '@id', value: artPieceId }],
            };

            const { resources } = await artPiecesContainer.items
                .query(querySpec, {
                    partitionKey: undefined, // Cross-partition query
                })
                .fetchAll();

            if (!resources || resources.length === 0) {
                return {
                    status: 404,
                    body: JSON.stringify({ error: `Art piece with ID ${artPieceId} not found` }),
                };
            }

            artPiece = resources[0];
            context.log(
                `Art piece retrieved successfully: ${artPiece.id}, userId: ${artPiece.userId}`
            );
        } catch (error) {
            context.log(`Error fetching art piece: ${JSON.stringify(error)}`);
            throw error;
        }

        // Initialize arrays if they don't exist
        if (!user.cart) {
            user.cart = [];
        }

        if (!artPiece.inCart) {
            artPiece.inCart = [];
        }

        // Check if already in cart - toggle add/remove
        const alreadyInCart = user.cart.includes(artPieceId);
        let action;

        if (alreadyInCart) {
            // Remove from cart: Remove from both arrays
            user.cart = user.cart.filter((id) => id !== artPieceId);
            artPiece.inCart = artPiece.inCart.filter((id) => id !== userId);
            action = 'removed';
            context.log(`Art piece ${artPieceId} removed from user ${userId}'s cart`);
        } else {
            // Add to cart: Add to both arrays
            user.cart.push(artPieceId);
            artPiece.inCart.push(userId);
            action = 'added';
            context.log(`Art piece ${artPieceId} added to user ${userId}'s cart`);
        }

        // Update timestamp
        const timestamp = new Date().toISOString();
        user.updatedAt = timestamp;
        artPiece.updatedAt = timestamp;

        // Update documents with proper partition keys
        context.log('Updating user document...');
        await usersContainer.item(String(userId), String(userId)).replace(user);

        // Use the correct partition key (userId) for the art piece
        const artPiecePartitionKey = String(artPiece.userId);
        context.log(
            `Updating art piece with ID: ${artPiece.id}, partition key: ${artPiecePartitionKey}`
        );
        await artPiecesContainer.item(String(artPiece.id), artPiecePartitionKey).replace(artPiece);

        context.log('Both documents updated successfully');

        // Return success response
        return {
            status: 200,
            body: JSON.stringify({
                success: true,
                action: action,
                userId: userId,
                artPieceId: artPieceId,
                cartSize: user.cart.length,
                artPieceInCartCount: artPiece.inCart.length,
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    } catch (err) {
        context.log(`Error processing cart operation: ${err.message}`);
        context.log(err.stack);

        let status = 500;
        let message = 'Internal Server Error';

        if (err.code === 429) {
            status = 429;
            message = 'Too many requests. Please try again later.';
        } else if (err.code === 403) {
            status = 403;
            message = 'Authorization failed';
        }

        return {
            status: status,
            body: JSON.stringify({
                error: message,
                details: err.message,
            }),
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': err.code === 429 ? '10' : undefined,
            },
        };
    }
}

app.http('userAddsArtToCart', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: userAddsArtToCart,
});
