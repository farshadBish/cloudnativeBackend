// import { PrismaClient } from '@prisma/client';

// const database = new PrismaClient();

// export default database;

import { CosmosClient, Database, Container } from '@azure/cosmos';
import * as dotenv from 'dotenv';
dotenv.config();

// Load from environment
const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseName = process.env.COSMOS_DATABASE_NAME;

if (!endpoint || !key || !databaseName) {
    throw new Error('Missing Azure Cosmos DB configuration in environment variables.');
}

// Initialize Cosmos client
const client = new CosmosClient({ endpoint, key });
const database: Database = client.database(databaseName);

// Containers
export const usersContainer: Container = database.container('Users');
export const artPiecesContainer: Container = database.container('ArtPieces');

export default {
    usersContainer,
    artPiecesContainer,
};
