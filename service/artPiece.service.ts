import artPieceDb from '../repository/artPiece.db';
import { ArtPieceInput } from '../types';
import { ArtPiece } from '../model/artPiece';
import { User } from '../model/user';
import userDb from '../repository/user.db';

// const registerArtPiece = async (
//     { title, description, price, tags, year }: ArtPieceInput,
//     files: Express.Multer.File[],
//     username: string,
//     role: string
// ) => {
//     if (!username || !role) {
//         throw new Error('Username and role are required.');
//     }

//     const userId = await userDb.getUserByUsername({ username }).then((user: User | null) => {
//         if (!user) {
//             throw new Error('User not found.');
//         }
//         return user.getId();
//     });

//     if (!title || !description || !userId || !tags || !price || !year) {
//         throw new Error('All Art Piece fields are required.');
//     }

//     // Make sure we have a user ID
//     if (!userId) {
//         throw new Error('User ID is required.');
//     }

//     // Convert Prisma user to domain User
//     const user = userDb.getUserById({ id: userId });

//     if (!user) {
//         throw new Error(`User with ID: ${userId} does not exist.`);
//     }

//     const response = await artPieceDb.createArtPiece({
//         title,
//         description,
//         userId,
//         price: parseFloat(price.toString()),
//         year: parseInt(year.toString()),
//         tags: Array.isArray(tags) ? tags : [tags], // Ensure tags is always an array
//     });

//     if (!response) {
//         throw new Error('Error creating art piece. See server log for details.');
//     }

//     if (!response.folderName) {
//         throw new Error('Error creating folder for art piece. See server log for details.');
//     }

//     // return response and getArtPieceImages(response.folderName)
//     return {
//         response,
//         images: await artPieceDb.getArtPieceImages(response.folderName),
//     };
// };

import path from 'path';
import fs from 'fs/promises';

import { BlobServiceClient } from "@azure/storage-blob";

import dotenv from 'dotenv';
dotenv.config();

const accountName = process.env.AZURE_ACCOUNT_NAME!;
const sasToken = process.env.AZURE_SAS_TOKEN!;
const accountURL = `https://${accountName}.blob.core.windows.net/?${sasToken}`;

const blobServiceClient = new BlobServiceClient(
    accountURL
);
const containerName = "image";
let containerClient = blobServiceClient.getContainerClient(containerName);

const registerArtPiece = async (
    { title, description, price, artist, tags, year }: ArtPieceInput,
    files: Express.Multer.File[],
    username: string,
    role: string
) => {
    // Validate and get user ID
    const user = await userDb.getUserByUsername({ username });
    if (!user) throw new Error('User not found.');

    if (!title || !description || !user.getId() || !tags || !artist || !price || !year ) {
        throw new Error('All Art Piece fields are required.');
    }
    const userId = user.getId();

    if (!userId) {
        throw new Error('User ID is required.');
    }

    

    // Ensure folder exists (based on artPiece.id or similar logic)
    const folderName = userId; // Assuming folderName is generated from artPiece ID or similar
    const folderPath = path.resolve(__dirname, '../artPieces', folderName);
    await fs.mkdir(folderPath, { recursive: true });

    // Move files into the folder
    const movedImages: string[] = [];
    let blobUrl ;
    for (const file of files) {
        const newFilePath = path.join(folderPath, file.originalname);
        await fs.rename(file.path, newFilePath); // move temp upload
        movedImages.push(file.originalname);
        const blockBlobClient = containerClient.getBlockBlobClient(file.originalname);
        await blockBlobClient.uploadFile(newFilePath);

        const tempBlockBlobClient = containerClient.getBlockBlobClient(file.originalname);
        blobUrl = tempBlockBlobClient.url
    }

  
    

    
    const artPiece = await artPieceDb.createArtPiece({
        title,
        description,
        artist,
        userId,
        price: parseFloat(price.toString()),
        tags: Array.isArray(tags) ? tags : [tags],
        year: parseInt(year.toString()),
        url: blobUrl
    });

    return {
        response: artPiece,
        images: movedImages,
    };
};

const getAllArtPieces = async () => {
    return artPieceDb.getAllArtPieces();
};

const ArtPieceService = {
    registerArtPiece,
    getAllArtPieces,
};

export default ArtPieceService;
