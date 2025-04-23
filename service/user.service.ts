import bcrypt from 'bcrypt';
import { AuthenticationResponse, RegisterUserInput, UserInput, UserLoginInput } from '../types';
import { generateJwtToken } from '../util/jwt';
import { User } from '../model/user';
import userDb from '../repository/user.db';

const getAllUsers = async ({
    username,
    role,
}: {
    username: string;
    role: string;
}): Promise<User[]> => {
    try {
        if (role == 'admin') {
            return await userDb.getAllUsers();
        } else if (role == 'user') {
            const user = await userDb.getUserByUsername({ username });
            return user ? [user] : [];
        } else {
            throw new Error('Unauthorized access. Try signing in again.');
        }
    } catch (error) {
        console.error(error);
        throw new Error('Database error. See server log for details.');
    }
};

const getUserByUsername = async ({ username }: { username: string }): Promise<User> => {
    const user = await userDb.getUserByUsername({ username });
    if (!user) {
        throw new Error(`User with username: ${username} does not exist.`);
    }
    return user;
};

const registerUser = async (input: UserInput): Promise<User> => {
    const { username, password, firstName, lastName, email } = input;

    // 1) basic validation
    if (!username || !password) {
        throw new Error('Username and password are required.');
    }
    if (!firstName || !lastName || !email) {
        throw new Error('First name, last name, and email are required.');
    }

    // 2) check for existing
    const existing = await userDb.getUserByUsername({ username });
    if (existing) {
        throw new Error(`User with username: ${username} already exists.`);
    }

    // 3) hash & forward DTO to repo
    const hashedPassword = await bcrypt.hash(password, 10);
    const dto: RegisterUserInput = {
        username,
        password: hashedPassword,
        firstName,
        lastName,
        email,
    };
    return userDb.registerUser(dto);
};

const authenticate = async ({
    username,
    password,
}: UserLoginInput): Promise<AuthenticationResponse> => {
    if (!username || !password) {
        throw new Error('Username and password are required.');
    }
    const user = await getUserByUsername({ username });
    const isValidPassword = await bcrypt.compare(password, user.getPassword());

    if (!isValidPassword) {
        throw new Error('Incorrect username or password.');
    }

    const role = user.getRole();

    return {
        token: generateJwtToken({ username, role }),
        username: username,
        role: role,
    };
};

export default { getUserByUsername, authenticate, registerUser, getAllUsers };
