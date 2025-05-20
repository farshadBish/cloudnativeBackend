// Function: verifyUserAccount.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getRedisClient } from '../../util/redisClient';
import { getContainer } from '../../util/cosmosDBClient';
import * as dotenv from 'dotenv';

dotenv.config();

export async function verifyUserAccount(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const verificationToken = (request.query.get('token') || '').trim();
    if (!verificationToken) {
        return htmlResponse(
            `<h1>Verification Error</h1><p>Verification token is required.</p>`,
            400
        );
    }

    const cacheKey = 'users:all';
    const cacheTTL = 24 * 60 * 60; // 24h
    const redirectUrl = process.env.REDIRECT_URL || 'https://x.com';
    const countdownSeconds = 5;

    try {
        const redis = await getRedisClient();
        let usersList: any[];
        const cached = await redis.get(cacheKey);
        if (cached) {
            context.log('Cache hit for users:all');
            usersList = JSON.parse(cached as string);
        } else {
            context.log('Cache miss — fetching users');
            const url = process.env.GET_ALL_USERS_URL!;
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) {
                return htmlResponse(
                    `<h1>Verification Error</h1><p>Unable to fetch user data.</p>`,
                    502
                );
            }
            const payload = await res.json();
            usersList = payload.users;
            await redis.set(cacheKey, JSON.stringify(usersList), { EX: cacheTTL });
        }

        const user = usersList.find((u) => u.verificationToken === verificationToken);
        if (!user) {
            return htmlResponse(
                `<h1>Verification Error</h1><p>TEST TEST No user found with this token.</p>`,
                404
            );
        }

        const exp = new Date(user.verificationTokenExpires);
        if (exp < new Date()) {
            return htmlResponse(
                `<h1>Verification Expired</h1><p>Your link has expired. Please request a new one.</p>`,
                400
            );
        }

        if (user.isVerified) {
            return htmlRedirect(
                `Your account is already verified. Redirecting in`,
                redirectUrl,
                countdownSeconds
            );
        }

        // Update DB and cache
        const container = getContainer('Users');
        const updated = {
            ...user,
            isVerified: true,
            verificationToken: null,
            verificationTokenExpires: null,
            updatedAt: new Date().toISOString(),
        };
        await container.item(user.id, user.id).replace(updated);
        const updatedList = usersList.map((u) => (u.id === user.id ? updated : u));
        await redis.set(cacheKey, JSON.stringify(updatedList), { EX: cacheTTL });

        return htmlRedirect(
            `Your account has been successfully verified! Redirecting in`,
            redirectUrl,
            countdownSeconds
        );
    } catch (err: any) {
        context.log('Error verifying user:', err);
        return htmlResponse(
            `<h1>Server Error</h1><p>Something went wrong. Please try again later.</p>`,
            500
        );
    }
}

// Helper to return an HTML page with plain message and countdown redirect
function htmlRedirect(message: string, url: string, seconds: number): HttpResponseInit {
    return {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verification Status</title>
  <style>
    body { font-family: Arial, sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background-color: #f0f2f5; margin: 0; }
    .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
    .countdown { font-size: 2rem; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${message}</h1>
    <div class="countdown">${seconds}</div>
    <p>Redirecting to <a href="${url}">${url}</a> shortly.</p>
  </div>
  <script>
    let counter = ${seconds};
    const countdownEl = document.querySelector('.countdown');
    const interval = setInterval(() => {
      counter -= 1;
      if (countdownEl) countdownEl.textContent = counter;
      if (counter <= 0) {
        clearInterval(interval);
        window.location.href = '${url}';
      }
    }, 1000);
  </script>
</body>
</html>`,
    };
}

// Helper to return simple HTML error page
function htmlResponse(html: string, status: number): HttpResponseInit {
    return {
        status,
        headers: { 'Content-Type': 'text/html' },
        body: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Error</title></head><body style="font-family:Arial,sans-serif;padding:2rem;"><div style="max-width:500px;margin:auto;">${html}</div></body></html>`,
    };
}

app.http('verifyUserAccount', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: verifyUserAccount,
});

// // Function: verifyUserAccount.ts
// import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
// import { getRedisClient } from '../../util/redisClient';
// import { getContainer } from '../../util/cosmosDBClient';
// import * as dotenv from 'dotenv';

// dotenv.config();

// export async function verifyUserAccount(
//     request: HttpRequest,
//     context: InvocationContext
// ): Promise<HttpResponseInit> {
//     const verificationToken = (request.query.get('token') || '').trim();
//     if (!verificationToken) {
//         return {
//             status: 400,
//             body: JSON.stringify({ error: 'Verification token is required' }),
//         };
//     }

//     const cacheKey = 'users:all';
//     const cacheTTL = 24 * 60 * 60; // 24h

//     try {
//         // Fetch users list from Redis or remote
//         const redis = await getRedisClient();
//         let usersList: any[];
//         const cached = await redis.get(cacheKey);
//         if (cached) {
//             context.log('Cache hit for users:all');
//             usersList = JSON.parse(cached as string);
//         } else {
//             context.log('Cache miss — fetching users');
//             const url = process.env.GET_ALL_USERS_URL!;
//             const res = await fetch(url, {
//                 method: 'GET',
//                 headers: { 'Content-Type': 'application/json' },
//             });
//             if (!res.ok) {
//                 context.log(`Failed to fetch users: ${res.status}`);
//                 return { status: 502, body: JSON.stringify({ error: 'Upstream fetch error' }) };
//             }
//             const payload = await res.json();
//             if (!payload.users || !Array.isArray(payload.users)) {
//                 throw new Error('Unexpected users payload shape');
//             }
//             usersList = payload.users;
//             await redis.set(cacheKey, JSON.stringify(usersList), { EX: cacheTTL });
//             context.log('Cached users:all list');
//         }

//         // Find user by token
//         const user = usersList.find((u) => u.verificationToken === verificationToken);
//         if (!user) {
//             return {
//                 status: 404,
//                 body: JSON.stringify({
//                     error: 'No user found with the provided verification token',
//                 }),
//             };
//         }

//         // Check token expiration
//         const tokenExpiration = new Date(user.verificationTokenExpires);
//         if (tokenExpiration < new Date()) {
//             return {
//                 status: 400,
//                 body: JSON.stringify({
//                     error: 'Verification link has expired. Please request a new one.',
//                 }),
//             };
//         }

//         // Already verified?
//         if (user.isVerified) {
//             return {
//                 status: 200,
//                 body: JSON.stringify({
//                     message: 'Your account is already verified. You can log in now.',
//                 }),
//             };
//         }

//         // Update in CosmosDB
//         const container = getContainer('Users');
//         const updatedUser = {
//             ...user,
//             isVerified: true,
//             verificationToken: null,
//             verificationTokenExpires: null,
//             updatedAt: new Date().toISOString(),
//         };
//         await container.item(user.id, user.id).replace(updatedUser);
//         context.log(`User ${user.id} verified in DB`);

//         // Update cache: replace the user in usersList and reset TTL
//         const publicFields = usersList.map((u) => (u.id === user.id ? updatedUser : u));
//         await redis.set(cacheKey, JSON.stringify(publicFields), { EX: cacheTTL });
//         context.log('Updated users:all cache after verification');

//         return {
//             status: 200,
//             body: JSON.stringify({
//                 message: 'Your account has been successfully verified! You can now log in.',
//             }),
//         };
//     } catch (err: any) {
//         context.log('Error verifying user:', err);
//         return {
//             status: 500,
//             body: JSON.stringify({
//                 error: 'An error occurred while verifying your account. Please try again later.',
//             }),
//         };
//     }
// }

// app.http('verifyUserAccount', {
//     methods: ['GET'],
//     authLevel: 'anonymous',
//     handler: verifyUserAccount,
// });
