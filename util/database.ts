import { Container } from '@azure/cosmos';
import * as dotenv from 'dotenv';
import { getContainer } from '../functions/util/cosmosDBClient';
dotenv.config();

// Containers
export const usersContainer: Container = getContainer('Users');
export const artPiecesContainer: Container = getContainer('ArtPieces');

export default {
    usersContainer,
    artPiecesContainer,
};
