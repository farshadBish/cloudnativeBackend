import { User as UserPrisma } from '@prisma/client';
import { ArtPiece as ArtPiecePrisma } from '@prisma/client';
import { ArtPiece } from './artPiece';
import { Role } from '../types';

export class User {
    readonly id?: number;
    readonly username: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly password: string;
    readonly role?: Role;
    readonly likedArtPieces?: ArtPiece[];
    readonly cart?: ArtPiece[];
    readonly createdPieces?: ArtPiece[];
    readonly updatedAt?: Date;
    readonly createdAt?: Date;

    constructor(user: {
        id?: number;
        username: string;
        firstName: string;
        lastName: string;
        email: string;
        password: string;
        role?: Role;
        likedArtPieces?: ArtPiece[];
        cart?: ArtPiece[];
        createdPieces?: ArtPiece[];
        updatedAt?: Date;
        createdAt?: Date;
    }) {
        this.validate(user);
        this.id = user.id;
        this.username = user.username;
        this.firstName = user.firstName;
        this.lastName = user.lastName;
        this.email = user.email;
        this.password = user.password;
        this.role = user.role || 'user';
        this.likedArtPieces = user.likedArtPieces;
        this.cart = user.cart;
        this.createdPieces = user.createdPieces;
        this.updatedAt = user.updatedAt;
        this.createdAt = user.createdAt;
    }

    getId(): number | undefined {
        return this.id;
    }

    getUsername(): string {
        return this.username;
    }

    getFirstName(): string {
        return this.firstName;
    }

    getLastName(): string {
        return this.lastName;
    }

    getEmail(): string {
        return this.email;
    }

    getPassword(): string {
        return this.password;
    }

    getUpdatedAt(): Date | undefined {
        return this.updatedAt;
    }

    getCreatedAt(): Date | undefined {
        return this.createdAt;
    }

    getLikedArtPieces(): ArtPiece[] | undefined {
        return this.likedArtPieces ?? [];
    }

    getCart(): ArtPiece[] | undefined {
        return this.cart;
    }

    getCreatedPieces(): ArtPiece[] | undefined {
        return this.createdPieces;
    }

    getRole(): Role {
        return this.role || 'user';
    }

    addLikedArtPiece(artPiece: ArtPiece): ArtPiece[] {
        if (artPiece.getUser()?.getId() === this.id) {
            throw new Error('Cannot like your own art piece');
        }

        if (this.likedArtPieces?.some((piece) => piece.getId() === artPiece.getId())) {
            throw new Error('Art piece is already liked');
        }

        this.likedArtPieces?.push(artPiece);
        return this.likedArtPieces || [];
    }

    addArtPieceToCart(artPiece: ArtPiece): ArtPiece[] {
        if (artPiece.getUser()?.getId() === this.id) {
            throw new Error('Cannot add your own art piece to cart');
        }

        if (this.cart?.some((piece) => piece.getId() === artPiece.getId())) {
            throw new Error('Art piece is already in cart');
        }

        this.cart?.push(artPiece);
        return this.cart || [];
    }

    validate(user: {
        username: string;
        firstName: string;
        lastName: string;
        email: string;
        password: string;
    }) {
        if (!user.username?.trim()) {
            throw new Error('Username is required');
        }
        if (!user.firstName?.trim()) {
            throw new Error('First name is required');
        }
        if (!user.lastName?.trim()) {
            throw new Error('Last name is required');
        }
        if (!user.email?.trim()) {
            throw new Error('Email is required');
        }
        if (!user.password?.trim()) {
            throw new Error('Password is required');
        }
    }

    equals(user: User): boolean {
        return (
            this.username === user.getUsername() &&
            this.firstName === user.getFirstName() &&
            this.lastName === user.getLastName() &&
            this.email === user.getEmail() &&
            this.password === user.getPassword()
        );
    }

    static from({
        id,
        username,
        firstName,
        lastName,
        email,
        password,
        role,
        likedArtPieces,
        cart,
        createdPieces,
        updatedAt,
        createdAt,
    }: UserPrisma & {
        likedArtPieces?: ArtPiecePrisma[];
        cart?: ArtPiecePrisma[];
        createdPieces?: ArtPiecePrisma[];
    }): User {
        return new User({
            id,
            username,
            firstName,
            lastName,
            email,
            password,
            role: role as Role,
            likedArtPieces: likedArtPieces?.map((artPiece) => ArtPiece.from(artPiece)),
            cart: cart?.map((artPiece) => ArtPiece.from(artPiece)),
            createdPieces: createdPieces?.map((artPiece) => ArtPiece.from(artPiece)),
            updatedAt,
            createdAt,
        });
    }
}
