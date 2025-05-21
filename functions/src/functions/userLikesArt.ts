import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';

import * as dotenv from 'dotenv';
import { getRedisClient } from '../../util/redisClient';
dotenv.config();

export async function userLikesArt(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const usersContainerId = 'Users';
    const artPiecesContainerId = 'ArtPieces';

    let usersContainer;
    let artPiecesContainer;

    try {
        // Initialize containers if not already done
        usersContainer = getContainer(usersContainerId);
        artPiecesContainer = getContainer(artPiecesContainerId);

        // Get parameters from request
        const { userId, artPieceId } = (await request.json()) as {
            userId: number;
            artPieceId: number;
        };
        // Enhanced debug logging
        context.log(`Processing like/unlike for userId: "${userId}", artPieceId: "${artPieceId}"`);

        // Validate required parameters
        if (!userId || !artPieceId) {
            return {
                status: 400,
                body: JSON.stringify({
                    error: 'Both userId and artPieceId are required',
                }),
            };
        }

        // Get user document
        let user;
        try {
            context.log(`Fetching user with ID: "${userId}"`);
            const { resource: userResource } = await usersContainer.item(userId, userId).read();
            user = userResource;
            context.log(`User document retrieved successfully`);
        } catch (error) {
            context.log(`Error fetching user: ${JSON.stringify(error)}`);
            if (error.code === 404) {
                return {
                    status: 404,
                    body: JSON.stringify({
                        error: `User with ID ${userId} not found`,
                    }),
                };
            }
            throw error;
        }

        // Get art piece document with correct partition key consideration
        let artPiece;
        try {
            context.log(`Fetching art piece with ID: "${artPieceId}"`);

            // Use a query to get the full art piece document including userId (partition key)
            const querySpec = {
                query: 'SELECT * FROM c WHERE c.id = @id',
                parameters: [{ name: '@id', value: artPieceId }],
            };

            const { resources } = await artPiecesContainer.items
                .query(querySpec, {
                    partitionKey: undefined, // Query across all partitions
                    maxItemCount: 1,
                })
                .fetchAll();

            if (!resources || resources.length === 0) {
                context.log(`Art piece with ID ${artPieceId} not found via query`);
                return {
                    status: 404,
                    body: JSON.stringify({
                        error: `Art piece with ID ${artPieceId} not found`,
                    }),
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
        if (!user.likedArtPieces) {
            user.likedArtPieces = [];
        }

        if (!artPiece.likedBy) {
            artPiece.likedBy = [];
        }

        // Check if already liked - toggle like/unlike
        const alreadyLiked = user.likedArtPieces.includes(artPieceId);
        let action;

        if (alreadyLiked) {
            // Unlike: Remove from both arrays
            user.likedArtPieces = user.likedArtPieces.filter((id) => id !== artPieceId);
            artPiece.likedBy = artPiece.likedBy.filter((id) => id !== userId);
            action = 'unliked';
        } else {
            // Like: Add to both arrays
            user.likedArtPieces.push(artPieceId);
            artPiece.likedBy.push(userId);
            action = 'liked';
        }

        // Update timestamp
        const timestamp = new Date().toISOString();
        user.updatedAt = timestamp;
        artPiece.updatedAt = timestamp;

        // Update documents with proper partition keys
        context.log('Updating user document...');
        await usersContainer.item(userId, userId).replace(user);

        // IMPORTANT FIX: Use the correct partition key (userId) for the art piece
        // The artPiece.userId field contains the partition key value
        context.log(
            `Updating art piece with ID: ${artPiece.id}, partition key: ${artPiece.userId}`
        );
        await artPiecesContainer.item(artPiece.id, artPiece.userId).replace(artPiece);

        context.log('Both documents updated successfully');

        // --- REDIS CACHE UPDATE ---
        try {
            const redis = await getRedisClient();
            const cacheKey = `userLikedItems:${userId}`;
            // Update the cache with the latest likedArtPieces array
            await redis.set(cacheKey, JSON.stringify(user.likedArtPieces));
            context.log(`Redis cache updated for key: ${cacheKey}`);
        } catch (redisErr) {
            context.log(`Failed to update Redis cache: ${redisErr.message}`);
        }

        // Return success response
        return {
            status: 200,
            body: JSON.stringify({
                success: true,
                action: action,
                userId: userId,
                artPieceId: artPieceId,
                likeCount: artPiece.likedBy.length,
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    } catch (err) {
        context.log(`Error processing like/unlike: ${err.message}`);
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

app.http('userLikesArt', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: userLikesArt,
});
