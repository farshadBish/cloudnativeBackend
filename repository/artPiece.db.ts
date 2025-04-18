import { User } from '@prisma/client';
import { ArtPiece } from '../model/artPiece';
import { User as UserModel } from '../model/user';
import database from '../util/database';

const createArtPiece = async ({
    title,
    description,
    user,
    price,
    tags,
    year,
}: {
    title: string;
    description: string;
    user: User;
    price: number;
    tags: string[];
    year: number;
}): Promise<ArtPiece> => {
    try {
        const newArtPiece = await database.artPiece.create({
            data: {
                title,
                description,
                userId: user.id, // Connect using userId instead of nested connect
                price,
                tags,
                year,
            },
            include: {
                User: true, // Changed to match your Prisma schema (capital U)
            },
        });

        // Create a User model instance from the Prisma User result
        const userModel = UserModel.from(newArtPiece.User);

        // Create and return the ArtPiece using the from method and manually add the user
        return new ArtPiece({
            id: newArtPiece.id,
            title: newArtPiece.title,
            description: newArtPiece.description,
            user: userModel,
            userId: newArtPiece.userId,
            price: newArtPiece.price,
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
};

export default ArtPieceDb;
