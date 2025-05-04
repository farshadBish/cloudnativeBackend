import fs, { promises as fsPromises } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { artPiecesContainer } from '../util/database';
import { ArtPiece, RawArtPiece } from '../model/artPiece';
import userDb from './user.db';

export interface CreateArtPieceInput {
    title: string;
    description: string;
    artist: string;
    userId: string;
    price: number;
    tags: string[];
    year: number;
    url?: string;
}

/**
 * Create a new ArtPiece document
 */
export const createArtPiece = async (input: CreateArtPieceInput): Promise<ArtPiece> => {
    try {
        const id = uuidv4();
        const folderName = uuidv4();
        const timestamp = new Date().toISOString();

        const newDoc: RawArtPiece = {
            id,
            title: input.title,
            description: input.description,
            artist: input.artist,
            userId: input.userId,
            price: input.price,
            tags: input.tags,
            year: input.year,
            url: input.url,
            folderName,
            likedBy: [],
            inCart: [],
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        const { resource } = await artPiecesContainer.items.create(newDoc);
        const art = ArtPiece.from(resource as RawArtPiece);

        // Attach user object
        const user = await userDb.getUserById({ id: art.userId });
        if (user) art.user = user;

        return art;
    } catch (err) {
        console.error('Error creating ArtPiece:', err);
        throw new Error('Database error. See server log for details.');
    }
};

/**
 * Retrieve all ArtPieces
 */
export const getAllArtPieces = async (): Promise<ArtPiece[]> => {
    try {
        const querySpec = { query: 'SELECT * FROM c' };
        const { resources } = await artPiecesContainer.items
            .query<RawArtPiece>(querySpec)
            .fetchAll();

        const pieces = await Promise.all(
            resources.map(async (raw) => {
                const art = ArtPiece.from(raw);
                const user = await userDb.getUserById({ id: raw.userId });
                if (user) art.user = user;
                return art;
            })
        );
        return pieces;
    } catch (err) {
        console.error('Error fetching all ArtPieces:', err);
        throw new Error('Database error. See server log for details.');
    }
};

/**
 * Retrieve a single ArtPiece by its ID
 */
export const getArtPieceById = async (id: string): Promise<ArtPiece | null> => {
  try {
    const { resources } = await artPiecesContainer.items
    .query<RawArtPiece>({
      query: "SELECT * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: id }],
    })
    .fetchAll();
  
  const resource = resources[0];
    if (!resource) return null;

    const art = ArtPiece.from(resource);

    if (resource.userId) {
      const user = await userDb.getUserById({ id: resource.userId });
      if (user) art.user = user;
    }

    return art;
  } catch (err) {
    console.error(`Error fetching ArtPiece by id ${id}:`, err);
    throw new Error('Database error. See server log for details.');
  }
};


/**
 * Retrieve a single ArtPiece by its artist
 */
export const getArtPiecesByArtist = async (artist: string): Promise<ArtPiece[]> => {
    try {
        const querySpec = {
            query: 'SELECT * FROM c WHERE c.artist = @artist',
            parameters: [{ name: '@artist', value: artist }],
        };

        const { resources } = await artPiecesContainer.items
            .query<RawArtPiece>(querySpec)
            .fetchAll();

        const enriched = await Promise.all(
            resources.map(async (resource) => {
                const art = ArtPiece.from(resource);
                const user = await userDb.getUserById({ id: resource.userId });
                if (user) art.user = user;
                return art;
            })
        );

        return enriched;
    } catch (err) {
        console.error(`Error fetching ArtPieces by artist ${artist}:`, err);
        throw new Error('Database error. See server log for details.');
    }
};


/**
 * List image filenames for an ArtPiece
 */
export const getArtPieceImages = async (folderName: string): Promise<string[]> => {
    try {
        const dir = path.resolve(__dirname, '../artPieces', folderName);
        const files = await fsPromises.readdir(dir);
        return files.filter((f) => fs.statSync(path.join(dir, f)).isFile());
    } catch (err) {
        console.error('Error reading art piece folder:', err);
        throw new Error('Error reading art piece images. See server log for details.');
    }
};

const ArtPieceDb = {
    createArtPiece,
    getAllArtPieces,
    getArtPieceById,
    getArtPieceImages,
    getArtPiecesByArtist
};

export default ArtPieceDb;
