import { User } from '@prisma/client';

export type UserInput = {
    id?: number;
    username?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: string;
};

export interface RegisterUserInput {
    username: string;
    password: string;
    email: string;
    lastName: string;
    firstName: string;
}

export type UserLoginInput = {
    username: string;
    password: string;
};

export type ArtPieceInput = {
    id?: number;
    title?: string;
    description?: string;
    artist?: string;
    userId?: number;
    price?: number;
    tags?: string[] | string;
    year?: number;
    url?: string;
};

export type AuthenticationResponse = {
    token: string;
    username: string;
    role: string;
};

export type Role = 'admin' | 'user';
