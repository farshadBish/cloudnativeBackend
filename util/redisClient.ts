import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const cacheHostName = process.env.AZURE_CACHE_FOR_REDIS_HOST_NAME || "artgallery.redis.cache.windows.net";
const cachePassword = process.env.AZURE_CACHE_FOR_REDIS_ACCESS_KEY || "9XoFDFgeOz5TBfI6FgwkiONJzKfhOy0cEAzCaHzt36o=";

console.log('Main Redis Config:', {
    hostName: cacheHostName,
    passwordLength: cachePassword?.length
});

if (!cacheHostName) throw Error('AZURE_CACHE_FOR_REDIS_HOST_NAME is empty');
if (!cachePassword) throw Error('AZURE_CACHE_FOR_REDIS_ACCESS_KEY is empty');

// Create a Redis client for Azure Cache for Redis v6+
const redisClient = createClient({
    url: `rediss://:${cachePassword}@${cacheHostName}:6380`,
});

// Connect to Redis
redisClient.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
    await redisClient.connect();
    console.log('Connected to Azure Redis Cache');
})();

export default redisClient;
