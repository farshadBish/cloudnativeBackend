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

export type UserLoginInput = {
    username: string;
    password: string;
};

export type ArtPieceInput = {
    id?: number;
    title?: string;
    description?: string;
    user?: User;
    price?: number;
    tags?: string[];
    year?: number;
};

export type AuthenticationResponse = {
    token: string;
    username: string;
    role: string;
};

export type Role = 'admin' | 'user';
