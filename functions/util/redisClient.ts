// util/redisClient.ts
import { createClient, RedisClientType } from 'redis';

import * as dotenv from 'dotenv';
dotenv.config();

const cacheHostName = process.env.AZURE_CACHE_FOR_REDIS_HOST_NAME || "artgallery.redis.cache.windows.net";
const cachePassword = process.env.AZURE_CACHE_FOR_REDIS_ACCESS_KEY || "9XoFDFgeOz5TBfI6FgwkiONJzKfhOy0cEAzCaHzt36o=";

console.log('Redis Config:', {
    hostName: cacheHostName,
    passwordLength: cachePassword?.length,
    envHostName: process.env.AZURE_CACHE_FOR_REDIS_HOST_NAME,
    envPasswordLength: process.env.AZURE_CACHE_FOR_REDIS_ACCESS_KEY?.length
});

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
        const connectionUrl = `rediss://:${cachePassword}@${cacheHostName}:6380`;
        console.log('Attempting Redis connection with URL:', connectionUrl.replace(cachePassword, '***'));
        
        client = createClient({
            url: connectionUrl,
        });
        
        client.on('error', (err) => {
            console.error('Redis Client Error:', err);
            console.error('Error details:', {
                message: err.message,
                code: err.code,
                stack: err.stack
            });
        });
        client.on('connect', () => console.log('Redis client connected successfully'));
        client.on('ready', () => console.log('Redis client ready'));
        client.on('disconnect', () => console.log('Redis client disconnected'));
        
        connecting = client.connect().then(() => {
            console.log('Connected to Azure Redis Cache successfully');
        }).catch((err) => {
            console.error('Failed to connect to Redis:', err);
            throw err;
        });
        client.on('error', (err) => console.error('Redis Client Error', err));
        connecting = client.connect().then(() => {
            console.log('Connected to Azure Redis Cache');
        });
    }
    // await the in-flight connection if it’s still pending
    await connecting;
    return client!;
}
