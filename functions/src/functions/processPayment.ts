import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as dotenv from 'dotenv';
import { getCosmosClient } from '../../util/cosmosDBClient';
import { verifyJWT } from '../../util/verifyJWT';
import { readHeader } from '../../util/readHeader';
import { CosmosClient } from '@azure/cosmos';

type PaymentRequest = {
    artPieceIds: string[];
    buyerId: number;
};

dotenv.config();

export async function processPayment(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    try {
        // 1) Authenticate: extract & verify JWT
        const authHeader =
            readHeader(request, 'Authorization') || request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                status: 401,
                body: JSON.stringify({ error: 'Missing or malformed Authorization header' }),
            };
        }

        const token = authHeader.slice('Bearer '.length);
        let payload: any;
        try {
            payload = verifyJWT(token);
        } catch (err: any) {
            context.log('JWT verification failed:', err.message);
            return {
                status: 401,
                body: JSON.stringify({ error: 'Invalid token' }),
            };
        }        // 2) Get request body
        const body = await request.json() as PaymentRequest;
        const { artPieceIds, buyerId } = body;

        if (!Array.isArray(artPieceIds) || typeof buyerId !== 'number') {
            return {
                status: 400,
                body: JSON.stringify({ error: 'Invalid request. Requires artPieceIds array and buyerId as number' })
            };
        }

        // 3) Process the payment by updating art pieces ownership
        const client: CosmosClient = await getCosmosClient();
        const container = client.database('art-marketplace').container('art-pieces');

        // Update each art piece's userId to the new owner (buyer)
        const updatePromises = artPieceIds.map(async (artPieceId) => {
            try {
                const { resource: artPiece } = await container.item(artPieceId, artPieceId).read();
                if (!artPiece) {
                    throw new Error(`Art piece with id ${artPieceId} not found`);
                }

                // Update the ownership
                artPiece.userId = buyerId;
                
                // Update the document in Cosmos DB
                await container.item(artPieceId, artPieceId).replace(artPiece);
                return artPiece;
            } catch (error) {
                context.log(`Error updating art piece ${artPieceId}:`, error);
                throw error;
            }
        });

        // Wait for all updates to complete
        const updatedArtPieces = await Promise.all(updatePromises);

        return {
            status: 200,
            jsonBody: {
                message: 'Payment processed successfully',
                updatedArtPieces
            }
        };

    } catch (error: any) {
        context.log('Error processing payment:', error);
        return {
            status: 500,
            jsonBody: { error: 'Internal server error' }
        };
    }
}
