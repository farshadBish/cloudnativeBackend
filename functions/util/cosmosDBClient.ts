// util/cosmosDBClient.ts
import { CosmosClient, Container, Database } from '@azure/cosmos';

require('dotenv').config();

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE_ID;

if (!endpoint) throw new Error('COSMOS_ENDPOINT is empty');
if (!key) throw new Error('COSMOS_KEY is empty');
if (!databaseId) throw new Error('COSMOS_DATABASE_ID is empty');

let client: CosmosClient | null = null;
let database: Database | null = null;

/**
 * Returns a singleton CosmosClient.
 */
export function getCosmosClient(): CosmosClient {
    if (!client) {
        client = new CosmosClient({ endpoint, key });
    }
    return client;
}

/**
 * Returns a singleton Database proxy.
 */
export function getDatabase(): Database {
    if (!database) {
        database = getCosmosClient().database(databaseId ? databaseId : '');
    }
    return database;
}

/**
 * Returns the named Container from our single Database.
 */
export function getContainer(containerId: string): Container {
    return getDatabase().container(containerId);
}
