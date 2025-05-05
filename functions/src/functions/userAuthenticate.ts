import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getContainer } from '../../util/cosmosDBClient';

export async function userAuthenticate(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');

    const containerId = 'Users';

    const jwtSecret = process.env.JWT_SECRET;
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';

    try {
        // Initialize container if not already done
        const container = getContainer(containerId);

        const { username, password } = (await request.json()) as {
            username: string;
            password: string;
        };

        // Validate input
        if (!username || !password) {
            return {
                status: 400,
                body: JSON.stringify({
                    error: 'Missing required parameters: username and password',
                }),
            };
        }

        // Query for user with this username
        const querySpec = {
            query: 'SELECT * FROM c WHERE c.username = @username',
            parameters: [{ name: '@username', value: username }],
        };

        const { resources: users } = await container.items.query(querySpec).fetchAll();

        if (!users || users.length === 0) {
            return {
                status: 401,
                body: JSON.stringify({
                    error: 'Incorrect username or password',
                }),
            };
        }

        const user = users[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) {
            return {
                status: 401,
                body: JSON.stringify({
                    error: 'Incorrect username or password',
                }),
            };
        }

        // Generate JWT token
        let token;
        try {
            token = jwt.sign(
                {
                    username: user.username,
                    role: user.role,
                    userId: user.id,
                },
                jwtSecret,
                { expiresIn: jwtExpiresIn }
            );
        } catch (jwtError) {
            context.log('Error generating JWT:', jwtError);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Failed to generate authentication token',
                }),
            };
        }

        // Log the token and response body for debugging
        context.log('Generated token:', token);

        // Return successful response
        const responseBody = {
            token,
            username: user.username,
            role: user.role,
        };

        context.log('Response body:', responseBody);

        return {
            status: 200,
            body: JSON.stringify(responseBody),
            headers: { 'Content-Type': 'application/json' },
        };
    } catch (error) {
        context.log('Error during authentication:', error);

        // Determine appropriate error status
        let status = 500;
        let message = 'Internal server error';

        if (error.code === 403) {
            status = 403;
            message = 'Authorization failed';
        } else if (error.code === 429) {
            status = 429;
            message = 'Too many requests';
        }

        return {
            status: status,
            body: JSON.stringify({ error: message }),
        };
    }
}

app.http('userAuthenticate', {
    methods: ['POST'],
    authLevel: 'function',
    handler: userAuthenticate,
});
