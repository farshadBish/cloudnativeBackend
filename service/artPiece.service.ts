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

const registerArtPiece = async (
    { title, description, price, artist, tags, year }: ArtPieceInput,
    files: Express.Multer.File[],
    username: string,
    role: string
) => {
    // Validate and get user ID
    const user = await userDb.getUserByUsername({ username });
    if (!user) throw new Error('User not found.');

    if (!title || !description || !user.getId() || !tags || !artist || !price || !year) {
        throw new Error('All Art Piece fields are required.');
    }
    const userId = user.getId();

    if (!userId) {
        throw new Error('User ID is required.');
    }

    const artPiece = await artPieceDb.createArtPiece({
        title,
        description,
        artist,
        userId,
        price: parseFloat(price.toString()),
        tags: Array.isArray(tags) ? tags : [tags],
        year: parseInt(year.toString()),
    });

    // Ensure folder exists (based on artPiece.id or similar logic)
    const folderName = `${artPiece.getFolderName()}`; // Assuming folderName is generated from artPiece ID or similar
    const folderPath = path.resolve(__dirname, '../artPieces', folderName);
    await fs.mkdir(folderPath, { recursive: true });

    // Move files into the folder
    const movedImages: string[] = [];
    for (const file of files) {
        const newFilePath = path.join(folderPath, file.originalname);
        await fs.rename(file.path, newFilePath); // move temp upload
        movedImages.push(file.originalname);
    }

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
