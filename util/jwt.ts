import jwt from 'jsonwebtoken';
import { UserInput } from '../types';

const generateJwtToken = ({ username, role }: UserInput): string => {
    const options = { expiresIn: `${process.env.JWT_EXPIRES_HOURS}h`, issuer: 'team_app' };

    try {
        return jwt.sign({ username, role }, process.env.JWT_SECRET!, options);
    } catch (error) {
        console.log(error);
        throw new Error('Error generating JWT token, see server log for details.');
    }
};

export { generateJwtToken };
