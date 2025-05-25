// src/functions/addArtPiece/index.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';
import { getRedisClient } from '../../util/redisClient';
import { BlobServiceClient } from '@azure/storage-blob';
import Busboy from 'busboy';
import { Readable } from 'stream';
import * as dotenv from 'dotenv';
dotenv.config();

const accountName = process.env.AZURE_ACCOUNT_NAME!;
const sasToken = process.env.AZURE_SAS_TOKEN!;
const blobUrlBase = `https://${accountName}.blob.core.windows.net`;
const containerName = 'image';

export async function addArtPiece(
    req: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    // Ensure we handle multipart
    const contentType = req.headers['content-type'] || req.headers['Content-Type'];
    if (!contentType?.startsWith('multipart/form-data')) {
        return { status: 400, body: 'Content-Type must be multipart/form-data' };
    }

    const artContainer = getContainer('ArtPieces');
    const userContainer = getContainer('Users');
    const blobService = new BlobServiceClient(`${blobUrlBase}/?${sasToken}`);
    const containerClient = blobService.getContainerClient(containerName);

    return new Promise((resolve) => {
        const fields: Record<string, string> = {};
        const fileUploads: Promise<string>[] = [];
        const busboy = new Busboy({ headers: { 'content-type': contentType } });

        // Collect text fields
        busboy.on('field', (name, val) => {
            fields[name] = val;
        });

        // Handle each file stream
        busboy.on('file', (_fieldname, fileStream, info) => {
            const blobName = `${Date.now()}-${info.filename}`;
            const blockClient = containerClient.getBlockBlobClient(blobName);

            // uploadStream returns a promise we can await later
            const uploadPromise = blockClient
                .uploadStream(fileStream)
                .then(() => `${blobUrlBase}/${containerName}/${blobName}`)
                .catch((err) => {
                    context.error('Blob upload error:', err);
                    throw err;
                });

            fileUploads.push(uploadPromise);
        });

        busboy.on('finish', async () => {
            try {
                // 1) Wait for all blobs to be uploaded & get URLs
                const urls = await Promise.all(fileUploads);
                if (urls.length === 0) {
                    return resolve({ status: 400, body: 'At least one image file is required.' });
                }

                // 2) Validate metadata fields
                const { title, description, artist, userId, price, tags, year } = fields;
                if (![title, description, artist, userId, price, year].every(Boolean)) {
                    return resolve({
                        status: 400,
                        body: 'Missing one of title/description/artist/userId/price/year.',
                    });
                }

                // 3) Build the new art piece
                const { v4: uuidv4 } = await import('uuid');
                const id = uuidv4();
                const timestamp = new Date().toISOString();
                const newArtPiece = {
                    id,
                    title,
                    description,
                    artist,
                    userId,
                    price: parseFloat(price),
                    tags: JSON.parse(tags || '[]'),
                    year: parseInt(year, 10),
                    url: urls[0], // main URL
                    imageGallery: urls, // all URLs if you want
                    folderName: uuidv4(), // as before
                    likedBy: [],
                    inCart: [],
                    createdAt: timestamp,
                    updatedAt: timestamp,
                };

                // 4) Insert into Cosmos
                await artContainer.items.create(newArtPiece);

                // 5) Update user's createdPieces
                const { resource: user } = await userContainer.item(userId, userId).read();
                if (!user) {
                    return resolve({ status: 404, body: `User ${userId} not found` });
                }
                user.createdPieces = user.createdPieces || [];
                user.createdPieces.push(id);
                await userContainer.items.upsert(user);

                // 6) Refresh Redis cache
                const redis = await getRedisClient();
                const { resources: allArt } = await artContainer.items.readAll().fetchAll();
                await redis.set('artPieces:all', JSON.stringify(allArt), { EX: 60 });
                context.log(`ArtPiece ${id} created and cache updated`);

                // 7) Return success
                resolve({
                    status: 201,
                    body: JSON.stringify({
                        id: newArtPiece.id,
                        title: newArtPiece.title,
                        artist: newArtPiece.artist,
                        year: newArtPiece.year,
                        price: newArtPiece.price,
                        images: urls,
                        createdAt: newArtPiece.createdAt,
                    }),
                });
            } catch (err: any) {
                context.error('Error in multipart handler:', err);
                resolve({ status: 500, body: 'Internal Server Error' });
            }
        });

        // Kick off parsing
        // Convert req.body (Buffer or string) to a readable stream for Busboy

        const stream =
            typeof req.body === 'string'
                ? Readable.from([Buffer.from(req.body)])
                : Readable.from([req.body]);
        stream.pipe(busboy);
    });
}

app.http('addArtPiece', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: addArtPiece,
});
