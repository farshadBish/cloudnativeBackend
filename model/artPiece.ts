import { ArtPiece as ArtPiecePrisma } from '@prisma/client';
import { User } from './user';

export class ArtPiece {
    readonly id?: number;
    readonly title: string;
    readonly description: string;
    readonly user?: User;
    readonly userId: number;
    readonly artist?: string;
    readonly price: number;
    readonly tags: string[];
    readonly year: number;
    readonly folderName?: string;
    readonly url?: string;
    readonly likedBy?: User[];
    readonly inCart?: User[];
    readonly updatedAt?: Date;
    readonly createdAt?: Date;

    constructor(artPiece: {
        id?: number;
        title: string;
        description: string;
        artist?: string;
        user?: User;
        userId: number;
        price: number;
        tags: string[];
        year: number;
        folderName?: string;
        url?: string;
        likedBy?: User[];
        inCart?: User[];
        updatedAt?: Date;
        createdAt?: Date;
    }) {
        this.id = artPiece.id;
        this.title = artPiece.title;
        this.description = artPiece.description;
        this.artist = artPiece.artist;
        this.user = artPiece.user;
        this.userId = artPiece.userId;
        this.price = artPiece.price;
        this.tags = artPiece.tags;
        this.year = artPiece.year;
        this.folderName = artPiece.folderName;
        this.url = artPiece.url;
        this.likedBy = artPiece.likedBy;
        this.inCart = artPiece.inCart;
        this.updatedAt = artPiece.updatedAt;
        this.createdAt = artPiece.createdAt;
    }

    getId(): number | undefined {
        return this.id;
    }

    getTitle(): string {
        return this.title;
    }

    getDescription(): string {
        return this.description;
    }

    getUser(): User | undefined {
        return this.user;
    }

    getUserId(): number {
        return this.userId;
    }

    getPrice(): number {
        return this.price;
    }

    getTags(): string[] {
        return this.tags;
    }

    getYear(): number {
        return this.year;
    }

    getUpdatedAt(): Date | undefined {
        return this.updatedAt;
    }

    getCreatedAt(): Date | undefined {
        return this.createdAt;
    }

    getLikedBy(): User[] | undefined {
        return this.likedBy;
    }

    getInCart(): User[] | undefined {
        return this.inCart;
    }

    getFolderName(): string | undefined {
        return this.folderName;
    }

    getArtist(): string | undefined {
        return this.artist;
    }

    static from(artPiecePrisma: ArtPiecePrisma): ArtPiece {
        return new ArtPiece({
            id: artPiecePrisma.id,
            title: artPiecePrisma.title,
            description: artPiecePrisma.description,
            artist: artPiecePrisma.artist,
            userId: artPiecePrisma.userId,
            price: artPiecePrisma.price,
            tags: artPiecePrisma.tags,
            year: artPiecePrisma.year,
            folderName: `artPieces/${artPiecePrisma.folderName}`,
            url: artPiecePrisma.url,
            updatedAt: artPiecePrisma.updatedAt,
            createdAt: artPiecePrisma.createdAt,
        });
    }
}
