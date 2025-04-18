import { ArtPiece as ArtPiecePrisma } from '@prisma/client';
import { User } from './user';

export class ArtPiece {
    readonly id?: number;
    readonly title: string;
    readonly description: string;
    readonly user?: User;
    readonly userId: number;
    readonly price: number;
    readonly tags: string[];
    readonly year: number;
    readonly likedBy?: User[];
    readonly inCart?: User[];
    readonly updatedAt?: Date;
    readonly createdAt?: Date;

    constructor(artPiece: {
        id?: number;
        title: string;
        description: string;
        user?: User;
        userId: number;
        price: number;
        tags: string[];
        year: number;
        likedBy?: User[];
        inCart?: User[];
        updatedAt?: Date;
        createdAt?: Date;
    }) {
        this.id = artPiece.id;
        this.title = artPiece.title;
        this.description = artPiece.description;
        this.user = artPiece.user;
        this.userId = artPiece.userId;
        this.price = artPiece.price;
        this.tags = artPiece.tags;
        this.year = artPiece.year;
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

    static from(artPiecePrisma: ArtPiecePrisma): ArtPiece {
        return new ArtPiece({
            id: artPiecePrisma.id,
            title: artPiecePrisma.title,
            description: artPiecePrisma.description,
            userId: artPiecePrisma.userId,
            price: artPiecePrisma.price,
            tags: artPiecePrisma.tags,
            year: artPiecePrisma.year,
            updatedAt: artPiecePrisma.updatedAt,
            createdAt: artPiecePrisma.createdAt,
        });
    }
}
