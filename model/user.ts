// src/model/user.ts
import { Role } from '../types';
import { ArtPiece } from './artPiece';

/**
 * Raw shape of a Cosmos DB user document
 */
export interface RawUser {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role?: Role;
    likedArtPieces?: string[]; // array of ArtPiece IDs
    cart?: string[]; // array of ArtPiece IDs
    createdPieces?: string[]; // array of ArtPiece IDs
    createdAt: string; // ISO timestamp
    updatedAt: string; // ISO timestamp
}

export class User {
    readonly id: string;
    readonly username: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly password: string;
    readonly role: Role;
    readonly likedArtPieces: string[];
    readonly cart: string[];
    readonly createdPieces: string[];
    readonly createdAt: Date;
    readonly updatedAt: Date;

    constructor(props: {
        id: string;
        username: string;
        firstName: string;
        lastName: string;
        email: string;
        password: string;
        role?: Role;
        likedArtPieces?: string[];
        cart?: string[];
        createdPieces?: string[];
        createdAt?: Date;
        updatedAt?: Date;
    }) {
        this.id = props.id;
        this.username = props.username;
        this.firstName = props.firstName;
        this.lastName = props.lastName;
        this.email = props.email;
        this.password = props.password;
        this.role = props.role || 'user';
        this.likedArtPieces = props.likedArtPieces || [];
        this.cart = props.cart || [];
        this.createdPieces = props.createdPieces || [];
        this.createdAt = props.createdAt || new Date();
        this.updatedAt = props.updatedAt || new Date();
    }

    /**
     * Factory method to create a User from a raw Cosmos DB document
     */
    static from(raw: RawUser): User {
        return new User({
            id: raw.id,
            username: raw.username,
            firstName: raw.firstName,
            lastName: raw.lastName,
            email: raw.email,
            password: raw.password,
            role: raw.role,
            likedArtPieces: raw.likedArtPieces,
            cart: raw.cart,
            createdPieces: raw.createdPieces,
            createdAt: new Date(raw.createdAt),
            updatedAt: new Date(raw.updatedAt),
        });
    }

    getId(): string {
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

    getRole(): Role {
        return this.role;
    }

    getLikedArtPieceIds(): string[] {
        return [...this.likedArtPieces];
    }

    getCartIds(): string[] {
        return [...this.cart];
    }

    getCreatedPieceIds(): string[] {
        return [...this.createdPieces];
    }

    getCreatedAt(): Date {
        return this.createdAt;
    }

    getUpdatedAt(): Date {
        return this.updatedAt;
    }

    validate(): void {
        if (!this.username.trim()) throw new Error('Username is required');
        if (!this.firstName.trim()) throw new Error('First name is required');
        if (!this.lastName.trim()) throw new Error('Last name is required');
        if (!this.email.trim()) throw new Error('Email is required');
        if (!this.password.trim()) throw new Error('Password is required');
    }
}
