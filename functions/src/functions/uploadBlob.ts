import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient, BlockBlobClient } from "@azure/storage-blob";


export async function uploadBlob(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {

    const name = request.query.get('name');
    console.log(name);

    const accountName = "cloudnativeproject";

    const sasToken = "sv=2024-11-04&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2026-06-14T15:39:30Z&st=2025-06-14T07:39:30Z&spr=https,http&sig=3%2FEJ%2B5Nmys4jJSD6Wq13TKpFixf%2BtlLfD1fQK0PCWx8%3D";
    const accountURL = `https://${accountName}.blob.core.windows.net/?${sasToken}`;
    const blobServiceClient =  await new BlobServiceClient(accountURL);

    const containerName = "image";
    let containerClient = blobServiceClient.getContainerClient(containerName);

    const blockBlobClient: BlockBlobClient = containerClient.getBlockBlobClient(name);

    // we convert web stream into a node stream
    const readStream = await require('stream').Readable.fromWeb(request.body);

    await blockBlobClient.uploadStream(readStream);



    return { body: `${blockBlobClient.url}` };
}

app.http('uploadBlob', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: uploadBlob,
});