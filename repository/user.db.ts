import { User } from '../model/user';
import database from '../util/database';

const getAllUsers = async (): Promise<User[]> => {
    try {
        const usersPrisma = await database.user.findMany({
            include: {
                likedArtPieces: true,
                cart: true,
                createdPieces: true,
            },
        });
        return usersPrisma.map((userPrisma) => User.from(userPrisma));
    } catch (error) {
        console.error(error);
        throw new Error('Database error. See server log for details.');
    }
};

const getUserById = async ({ id }: { id: number }): Promise<User | null> => {
    try {
        const userPrisma = await database.user.findUnique({
            where: { id },
        });

        return userPrisma ? User.from(userPrisma) : null;
    } catch (error) {
        console.error(error);
        throw new Error('Database error. See server log for details.');
    }
};

const getUserByUsername = async ({ username }: { username: string }): Promise<User | null> => {
    try {
        const userPrisma = await database.user.findFirst({
            where: { username },
        });

        return userPrisma ? User.from(userPrisma) : null;
    } catch (error) {
        console.error(error);
        throw new Error('Database error. See server log for details.');
    }
};

const registerUser = async ({
    username,
    password,
    email,
    lastName,
    firstName,
}: {
    username: string;
    password: string;
    email: string;
    lastName: string;
    firstName: string;
}): Promise<User> => {
    try {
        const existingUser = await getUserByUsername({ username });
        if (existingUser) {
            throw new Error(`User with username: ${username} already exists.`);
        }

        const newUser = await database.user.create({
            data: {
                username,
                password,
                email,
                lastName,
                firstName,
            },
        });

        return User.from(newUser);
    } catch (error) {
        console.error(error);
        throw new Error('Database error. See server log for details.');
    }
};

const userDb = {
    getAllUsers,
    getUserById,
    getUserByUsername,
    registerUser,
};

export default userDb;
