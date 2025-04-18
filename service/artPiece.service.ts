import artPieceDb from '../repository/artPiece.db';
import { ArtPieceInput } from '../types';
import { ArtPiece } from '../model/artPiece';
import { User } from '../model/user';

const registerArtPiece = async ({ title, description, user, price, tags, year }: ArtPieceInput) => {
    if (!title || !description || !user || !price || !tags || !year) {
        throw new Error('All Art Piece fields are required.');
    }

    // Make sure we have a user ID
    if (!user.id) {
        throw new Error('User ID is required.');
    }

    // Convert Prisma user to domain User
    const userModel = new User({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        password: user.password,
        updatedAt: user.updatedAt,
        createdAt: user.createdAt,
    });

    // Create the ArtPiece object for validation/business logic
    const newArtPiece = new ArtPiece({
        title,
        description,
        user: userModel, // Use the converted User model
        userId: user.id,
        price,
        tags,
        year,
    });

    // Pass the individual properties to the DB layer
    return artPieceDb.createArtPiece({
        title: newArtPiece.getTitle(),
        description: newArtPiece.getDescription(),
        user, // Pass the original Prisma user object
        price: newArtPiece.getPrice(),
        tags: newArtPiece.getTags(),
        year: newArtPiece.getYear(),
    });
};

const getAllArtPieces = async () => {
    return artPieceDb.getAllArtPieces();
};

const ArtPieceService = {
    registerArtPiece,
    getAllArtPieces,
};

export default ArtPieceService;
