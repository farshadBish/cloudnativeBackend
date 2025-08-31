// util/redisClient.ts
import { createClient, RedisClientType } from 'redis';

import * as dotenv from 'dotenv';
dotenv.config();

const cacheHostName = process.env.AZURE_CACHE_FOR_REDIS_HOST_NAME;
const cachePassword = process.env.AZURE_CACHE_FOR_REDIS_ACCESS_KEY;

if (!cacheHostName) throw new Error('AZURE_CACHE_FOR_REDIS_HOST_NAME is empty');
if (!cachePassword) throw new Error('AZURE_CACHE_FOR_REDIS_ACCESS_KEY is empty');

// these variables live in module scope and survive across function invocations
let client: RedisClientType | null = null;
let connecting: Promise<void> | null = null;

/**
 * Returns a single, shared Redis client, connecting it on first use.
 */
export async function getRedisClient(): Promise<RedisClientType> {
    if (client && client.isOpen) {
        return client;
    }
    if (!connecting) {
        // first time: create and start the connection
        // For Azure Cache for Redis v6+, use username 'default' with access key as password
        client = createClient({
            socket: {
                host: cacheHostName,
                port: 6380,
                tls: true,
            },
            username: 'default',
            password: cachePassword,
        });
        
        client.on('error', (err) => console.error('Redis Client Error', err));
        client.on('connect', () => console.log('Redis client connected'));
        client.on('ready', () => console.log('Redis client ready'));
        
        connecting = client.connect().then(() => {
            console.log('Connected to Azure Redis Cache');
        });
    }
    // await the in-flight connection if it’s still pending
    await connecting;
    return client!;
}
