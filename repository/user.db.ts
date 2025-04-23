// src/db/user.db.ts
import { v4 as uuidv4 } from 'uuid';
import { usersContainer } from '../util/database';
import { User, RawUser } from '../model/user';
import { RegisterUserInput } from '../types';

/**
 * Fetch all users from Cosmos DB
 */
const getAllUsers = async (): Promise<User[]> => {
    try {
        const querySpec = { query: 'SELECT * FROM c' };
        const { resources } = await usersContainer.items.query<RawUser>(querySpec).fetchAll();
        return resources.map((raw) => User.from(raw));
    } catch (err) {
        console.error('Error fetching all users:', err);
        throw new Error('Database error. See server log for details.');
    }
};

/**
 * Fetch a single user by id (point read)
 */
const getUserById = async ({ id }: { id: string }): Promise<User | null> => {
    try {
        const { resource } = await usersContainer.item(id, id).read<RawUser>();
        return resource ? User.from(resource) : null;
    } catch (err) {
        console.error(`Error fetching user by id ${id}:`, err);
        throw new Error('Database error. See server log for details.');
    }
};

/**
 * Fetch a single user by username via SQL query
 */
const getUserByUsername = async ({ username }: { username: string }): Promise<User | null> => {
    try {
        const querySpec = {
            query: 'SELECT * FROM c WHERE c.username = @username',
            parameters: [{ name: '@username', value: username }],
        };
        const { resources } = await usersContainer.items.query<RawUser>(querySpec).fetchAll();
        return resources.length > 0 ? User.from(resources[0]) : null;
    } catch (err) {
        console.error(`Error fetching user by username ${username}:`, err);
        throw new Error('Database error. See server log for details.');
    }
};

/**
 * Register a new user document in Cosmos DB
 */
const registerUser = async (input: RegisterUserInput): Promise<User> => {
    try {
        const existing = await getUserByUsername({ username: input.username });
        if (existing) {
            throw new Error(`User with username ${input.username} already exists.`);
        }

        const id = uuidv4();
        const timestamp = new Date().toISOString();
        const newDoc: RawUser = {
            id,
            username: input.username,
            password: input.password,
            email: input.email,
            lastName: input.lastName,
            firstName: input.firstName,
            role: 'user',
            likedArtPieces: [],
            cart: [],
            createdPieces: [],
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        const { resource } = await usersContainer.items.create(newDoc);
        return User.from(resource as RawUser);
    } catch (err) {
        console.error('Error registering user:', err);
        throw new Error('Database error. See server log for details.');
    }
};

const UserDb = {
    getAllUsers,
    getUserById,
    getUserByUsername,
    registerUser,
};

export default UserDb;
