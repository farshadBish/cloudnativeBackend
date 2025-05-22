// util/verifyJWT.ts
import * as dotenv from 'dotenv';
dotenv.config();

import { JwtPayload } from 'jsonwebtoken';
const jwt = require('jsonwebtoken');

const JWT_SECRET = (process.env.JWT_SECRET || '').trim();
if (!JWT_SECRET) {
    throw new Error('Missing JWT_SECRET env var in verifyJWT');
}

export function verifyJWT(token: string): JwtPayload {
    try {
        return jwt.verify(token, JWT_SECRET, {
            algorithms: ['HS256'],
            clockTolerance: 2 * 60 * 60,
            // // clockTolerance: 24 * 60 * 60,
        }) as JwtPayload;
    } catch (err: any) {
        // Let the caller see exactly which error happened
        throw new Error(`${err.name}: ${err.message}`);
    }
}
