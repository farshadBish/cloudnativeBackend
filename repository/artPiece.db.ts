import { User } from '@prisma/client';
import { ArtPiece } from '../model/artPiece';
import { User as UserModel } from '../model/user';
import database from '../util/database';
import { promises as fs } from 'fs';
import path from 'path';

// const createArtPiece = async ({
//     title,
//     description,
//     userId,
//     price,
//     tags,
//     year,
// }: {
//     title: string;
//     description: string;
//     userId: number;
//     price: number;
//     tags: string[];
//     year: number;
// }): Promise<ArtPiece> => {
//     try {
//         const newArtPiece = await database.artPiece.create({
//             data: {
//                 title,
//                 description,
//                 userId: userId, // Connect using userId instead of nested connect
//                 price,
//                 tags,
//                 year,
//             },
//             include: {
//                 User: true, // Changed to match your Prisma schema (capital U)
//             },
//         });

//         // Create a User model instance from the Prisma User result
//         const userModel = UserModel.from(newArtPiece.User);

//         if (newArtPiece.folderName) {
//             try {
//                 const folderPath = path.resolve(__dirname, '../artPieces', newArtPiece.folderName);

//                 // Check if folder already exists
//                 try {
//                     await fs.access(folderPath);
//                     console.log(`Folder already exists for art piece: ${folderPath}`);
//                 } catch (accessError) {
//                     // Folder doesn't exist, so create it
//                     await fs.mkdir(folderPath, { recursive: true });
//                     console.log(`Created folder for art piece: ${folderPath}`);
//                 }
//             } catch (error) {
//                 console.error('Error handling art piece folder:', error);
//                 // Don't throw here - we can continue even if folder creation fails
//             }
//         }

//         const folderImages: string[] = [];

//         if (newArtPiece.folderName) {
//             const folderPath = path.resolve(__dirname, '../artPieces', newArtPiece.folderName);
//             try {
//                 const files = await fs.readdir(folderPath);
//                 for (const file of files) {
//                     const filePath = path.join(folderPath, file);
//                     const stats = await fs.stat(filePath);
//                     if (stats.isFile()) {
//                         folderImages.push(file); // Collect the image names
//                     }
//                 }
//             } catch (error) {
//                 console.error('Error reading art piece folder:', error);
//             }
//         }

//         // Create and return the ArtPiece using the from method and manually add the user
//         return new ArtPiece({
//             id: newArtPiece.id,
//             title: newArtPiece.title,
//             description: newArtPiece.description,
//             user: userModel,
//             userId: newArtPiece.userId,
//             price: newArtPiece.price,
//             folderName: newArtPiece.folderName,
//             tags: newArtPiece.tags,
//             year: newArtPiece.year,
//             updatedAt: newArtPiece.updatedAt,
//             createdAt: newArtPiece.createdAt,
//         });
//     } catch (error) {
//         console.error(error);
//         throw new Error('Database error. See server log for details.');
//     }
// };

const createArtPiece = async ({
    title,
    description,
    artist,
    userId,
    price,
    tags,
    year,
    url
}: {
    title: string;
    description: string;
    artist: string;
    userId: number;
    price: number;
    tags: string[];
    year: number;
    url: string;
}): Promise<ArtPiece> => {
    try {
        const newArtPiece = await database.artPiece.create({
            data: {
                title,
                description,
                artist,
                userId,
                price,
                tags,
                year,
                url
            },
            include: { User: true },
        });

        return new ArtPiece({
            id: newArtPiece.id,
            title: newArtPiece.title,
            description: newArtPiece.description,
            artist: newArtPiece.artist,
            user: UserModel.from(newArtPiece.User),
            userId: newArtPiece.userId,
            price: newArtPiece.price,
            folderName: newArtPiece.folderName,
            tags: newArtPiece.tags,
            year: newArtPiece.year,
            updatedAt: newArtPiece.updatedAt,
            createdAt: newArtPiece.createdAt,
        });
    } catch (error) {
        console.error(error);
        throw new Error('Database error. See server log for details.');
    }
};

const getArtPieceImages = async (folderName: string): Promise<string[]> => {
    try {
        const folderPath = path.resolve(__dirname, '../artPieces', folderName);
        const files = await fs.readdir(folderPath);
        const images: string[] = [];

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
                images.push(file); // Collect the image names
            }
        }

        return images;
    } catch (error) {
        console.error('Error reading art piece folder:', error);
        throw new Error('Error reading art piece images. See server log for details.');
    }
};

const getAllArtPieces = async (): Promise<ArtPiece[]> => {
    try {
        const artPiecesPrisma = await database.artPiece.findMany({});

        return artPiecesPrisma.map((artPiecePrisma) => ArtPiece.from(artPiecePrisma));
    } catch (error) {
        console.error(error);
        throw new Error('Database error. See server log for details.');
    }
};

const getArtPieceById = async ({ id }: { id: number }): Promise<ArtPiece | null> => {
    try {
        const artPiecePrisma = await database.artPiece.findUnique({
            where: { id },
            include: {
                User: true, // Changed to match your Prisma schema (capital U)
            },
        });

        if (!artPiecePrisma) return null;

        const userModel = UserModel.from(artPiecePrisma.User);

        return new ArtPiece({
            id: artPiecePrisma.id,
            title: artPiecePrisma.title,
            description: artPiecePrisma.description,
            user: userModel,
            userId: artPiecePrisma.userId,
            price: artPiecePrisma.price,
            tags: artPiecePrisma.tags,
            year: artPiecePrisma.year,
            updatedAt: artPiecePrisma.updatedAt,
            createdAt: artPiecePrisma.createdAt,
        });
    } catch (error) {
        console.error(error);
        throw new Error('Database error. See server log for details.');
    }
};

const ArtPieceDb = {
    createArtPiece,
    getAllArtPieces,
    getArtPieceById,
    getArtPieceImages,
};

export default ArtPieceDb;
