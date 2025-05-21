import { JwtPayload } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

const jwt = require('jsonwebtoken');

/**
 * Verifies a JWT token and returns its public payload fields if valid.
 * @param token The JWT token string to verify.
 * @returns The decoded payload if valid, or throws an error if invalid.
 */
export function verifyJWT(token: string): JwtPayload {
    try {
        // jwt.verify throws if invalid or expired
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
        // Remove sensitive fields if needed (e.g., iat, exp can be kept or filtered)
        // Return all public fields
        return decoded;
    } catch (err: any) {
        // You can customize error handling here
        throw new Error('Invalid or expired JWT token.');
    }
}
