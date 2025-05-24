import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getRedisClient } from '../../util/redisClient';
import { getContainer } from '../../util/cosmosDBClient';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

export async function addUser(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    // Parse request body
    const { username, password, email, firstName, lastName } = (await request.json()) as {
        username: string;
        password: string;
        email: string;
        firstName: string;
        lastName: string;
    };

    /*
    JSON Body
    {
        "username": "newuser",
        "password": "securepassword",
        "email": "danieljaurell@gmail.com",
        "firstName": "Daniel",
        "lastName": "Jaurell"
    }
    */

    // Basic validation
    if (!username || !password || !email || !firstName || !lastName) {
        return { status: 400, body: 'All fields are required' };
    }
    if (password.length < 8) {
        return { status: 400, body: 'Password must be at least 8 characters long' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { status: 400, body: 'Invalid email format' };
    }

    const cacheKey = 'users:all';
    // const cacheTTL = 24 * 60 * 60; // 24 hours (high TTL)

    const cacheTTL = 60; // 1 minute (low TTL for testing)

    try {
        const redis = await getRedisClient();
        let usersList: any[];

        // 1) Try Redis cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            context.log('Cache hit for users:all');
            usersList = JSON.parse(cached as string);
        } else {
            context.log('Cache miss — fetching users');
            const url = process.env.GET_ALL_USERS_URL!;
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) {
                context.log(`Failed to fetch users: ${res.status}`);
                return {
                    status: 502,
                    body: JSON.stringify({
                        status: 502,
                        error: 'Upstream fetch error',
                        details: `Status ${res.status}`,
                    }),
                };
            }
            const payload = await res.json();
            if (!payload.users || !Array.isArray(payload.users)) {
                throw new Error('Unexpected users payload shape');
            }
            usersList = payload.users;
            // prime cache
            await redis.set(cacheKey, JSON.stringify(usersList), { EX: cacheTTL });
            context.log('Cached users:all list');
        }

        // 2) Ensure uniqueness
        if (usersList.some((u) => u.username === username)) {
            return { status: 409, body: `Username "${username}" is already taken.` };
        }
        if (usersList.some((u) => u.email === email)) {
            return { status: 409, body: `Email "${email}" is already registered.` };
        }

        // 3) Create new user
        const bcrypt = require('bcryptjs');
        const crypto = require('crypto');

        const passwordHash = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h
        const now = new Date().toISOString();

        const newUser = {
            id: uuidv4(),
            username,
            passwordHash,
            email,
            firstName,
            lastName,
            role: 'user',
            likedArtPieces: [],
            cart: [],
            createdPieces: [],
            isVerified: false,
            verificationToken,
            verificationTokenExpires: expires,
            createdAt: now,
            updatedAt: now,
        };

        // 4) Persist to CosmosDB
        const container = getContainer('Users');
        await container.items.create(newUser);

        // 5) Send verification email
        const verifyEmailEndpoint = process.env.VERIFY_EMAIL_URL!;
        const verifyUserEndpoint = process.env.VERIFY_USER_ACCOUNT_URL!;
        const link = verifyUserEndpoint.includes('?')
            ? `${verifyUserEndpoint}&token=${verificationToken}`
            : `${verifyUserEndpoint}?token=${verificationToken}`;

        axios
            .post(verifyEmailEndpoint, { recipient: email, verificationLink: link })
            .then(() => context.log(`Verification email sent to ${email}`))
            .catch((err) => context.log('Error sending verification email:', err));

        // 6) Update cache: append newUser without sensitive fields
        const publicFields = (({
            id,
            username,
            email,
            firstName,
            lastName,
            role,
            verificationToken,
            verificationTokenExpires,
            isVerified,
            createdAt,
            updatedAt,
        }) => ({
            id,
            username,
            email,
            firstName,
            lastName,
            role,
            verificationToken,
            verificationTokenExpires,
            isVerified,
            createdAt,
            updatedAt,
        }))(newUser);
        usersList.push(publicFields);
        await redis.set(cacheKey, JSON.stringify(usersList), { EX: cacheTTL });
        context.log('Updated users:all cache with new user');

        // 7) Return success
        return {
            status: 201,
            body: JSON.stringify({
                ...publicFields,
                message: 'Account created; check your email to verify.',
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    } catch (err: any) {
        context.log('Error registering user:', err);
        return { status: 500, body: 'Internal server error' };
    }
}

app.http('addUser', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: addUser,
});
