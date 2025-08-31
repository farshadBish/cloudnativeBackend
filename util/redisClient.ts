import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const cacheHostName = "artgallery.redis.cache.windows.net";
const cachePassword = "9XoFDFgeOz5TBfI6FgwkiONJzKfhOy0cEAzCaHzt36o="

if (!cacheHostName) throw Error('AZURE_CACHE_FOR_REDIS_HOST_NAME is empty');
if (!cachePassword) throw Error('AZURE_CACHE_FOR_REDIS_ACCESS_KEY is empty');

// Create a Redis client
const redisClient = createClient({
    url: `rediss://${cacheHostName}:6380`,
    password: cachePassword,
});

// Connect to Redis
redisClient.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
    await redisClient.connect();
    console.log('Connected to Azure Redis Cache');
})();

export default redisClient;
