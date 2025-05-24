import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

import * as dotenv from 'dotenv';
dotenv.config();

export async function sendEmail(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const { EmailClient, KnownEmailSendStatus } = require('@azure/communication-email');

    const connectionString = process.env.EMAIL_SERVICE_CONNECTION_STRING;
    const senderAddress = 'DoNotReply@1eb6d9a4-e40d-4fe7-a440-6b76ada5cd60.azurecomm.net';

    interface EmailRequest {
        to: string;
        subject: string;
        plainText: string;
        html: string;
    }

    const { to, subject, plainText, html } = (await request.json()) as EmailRequest;

    if (!to || !subject || !plainText || !html) {
        return {
            status: 400,
            body: 'All fields are required',
        };
    }

    const message = {
        senderAddress,
        recipients: {
            to: [{ address: to }],
        },
        content: {
            subject,
            plainText,
            html,
        },
    };

    try {
        const client = new EmailClient(connectionString);
        const poller = await client.beginSend(message);

        const result = await poller.pollUntilDone();
        if (result.status === KnownEmailSendStatus.Succeeded) {
            return {
                status: 202,
                body: JSON.stringify({
                    message: 'Email sent successfully',
                    operationId: result.id,
                    status: result.status,
                }),
            };
        } else {
            throw new Error(`Email sending failed with status: ${result.status}`);
        }
    } catch (error) {
        console.error('Error sending email:', error);
        return {
            status: 500,
            body: JSON.stringify({
                message: 'Error sending email',
                error: error.message,
            }),
        };
    }
}

app.http('sendEmail', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: sendEmail,
});
