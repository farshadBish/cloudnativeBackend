const redis = require('redis');

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

// Environment variables for cache
const cacheHostName = "artgallery.redis.cache.windows.net";
const cachePassword = "9XoFDFgeOz5TBfI6FgwkiONJzKfhOy0cEAzCaHzt36o="

if (!cacheHostName) throw Error('AZURE_CACHE_FOR_REDIS_HOST_NAME is empty');
if (!cachePassword) throw Error('AZURE_CACHE_FOR_REDIS_ACCESS_KEY is empty');

async function testCache() {
    // Connection configuration
    const cacheConnection = redis.createClient({
        // redis for TLS
        url: `rediss://${cacheHostName}:6380`,
        password: cachePassword,
    });
    

    // Connect to Redis
    await cacheConnection.connect();

    // PING command
    console.log('\nCache command: PING');
    console.log('Cache response : ' + (await cacheConnection.ping()));

    // GET
    console.log('\nCache command: GET Message');
    console.log('Cache response : ' + (await cacheConnection.get('Message')));

    // SET
    console.log('\nCache command: SET Message');
    console.log(
        'Cache response : ' +
            (await cacheConnection.set('Message', 'Hello! The cache is working from Node.js!'))
    );

    // GET again
    console.log('\nCache command: GET Message');
    console.log('Cache response : ' + (await cacheConnection.get('Message')));

    // Client list, useful to see if connection list is growing...
    console.log('\nCache command: CLIENT LIST');
    console.log('Cache response : ' + (await cacheConnection.sendCommand(['CLIENT', 'LIST'])));

    // Disconnect
    cacheConnection.disconnect();

    return 'Done';
}

testCache()
    .then((result) => console.log(result))
    .catch((ex) => console.log(ex));
