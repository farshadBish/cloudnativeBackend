import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';
import { getRedisClient } from '../../util/redisClient'; // <-- Add this import

import * as dotenv from 'dotenv';
dotenv.config();

export async function addArtPiece(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const { v4: uuidv4 } = require('uuid');

    const artContainerId = 'ArtPieces';
    const userContainerId = 'Users';

    // Initialize Cosmos client and container once
    const artContainer = getContainer(artContainerId);
    const userContainer = getContainer(userContainerId);

    interface ArtPiece {
        id: string;
        title: string;
        description: string;
        artist: string;
        userId: string;
        price: number;
        tags: string[];
        year: number;
        url: string;
    }

    const { title, description, artist, userId, price, tags, year, url } =
        (await request.json()) as ArtPiece;

    // 1) Basic validation
    if (!title || !description || !artist || !userId || !price || !url || isNaN(year)) {
        return {
            status: 400,
            body: 'title, description, artist, userId, price, year, and url are all required.',
        };
    }

    try {
        // 2) Build the new art piece document
        const id = uuidv4();
        const folderName = uuidv4();
        const timestamp = new Date().toISOString();

        const newArtPiece = {
            id,
            title,
            description,
            artist,
            userId,
            price,
            tags,
            year,
            url,
            folderName,
            likedBy: [],
            inCart: [],
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        // 3) Insert into Cosmos
        await artContainer.items.create(newArtPiece);

        // update user objects createdPieces array
        const { resource: user } = await userContainer.item(userId, userId).read();
        if (!user) {
            return {
                status: 404,
                body: JSON.stringify({
                    error: `User with ID ${userId} not found`,
                }),
            };
        }
        user.createdPieces = user.createdPieces || [];

        user.createdPieces.push(id); // Add the new art piece ID to the user's createdPieces array
        await userContainer.items.upsert(user); // Upsert to ensure the user document is updated

        context.log(`User ${userId} updated with new art piece ID: ${id}`);

        // 4) Update Redis cache for artPieces:all
        const cacheKey = 'artPieces:all';
        const cacheTTL = 60; // 1 minute (adjust as needed)
        try {
            const redis = await getRedisClient();
            // Fetch all art pieces from CosmosDB
            const { resources: allArtPieces } = await artContainer.items.readAll().fetchAll();
            await redis.set(cacheKey, JSON.stringify(allArtPieces), { EX: cacheTTL });
            context.log('Updated artPieces:all cache with new art piece');
        } catch (redisErr) {
            context.log('Error updating artPieces:all cache:', redisErr);
        }

        // 5) Return success response
        return {
            status: 201,
            body: JSON.stringify({
                id: newArtPiece.id,
                title: newArtPiece.title,
                artist: newArtPiece.artist,
                year: newArtPiece.year,
                price: newArtPiece.price,
                createdAt: newArtPiece.createdAt,
            }),
        };
    } catch (err) {
        context.log('Error creating art piece:', err);
        return {
            status: 500,
            body: 'error: Internal Server Error',
        };
    }
}

app.http('addArtPiece', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: addArtPiece,
});
