import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

export async function verifyEmail(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const { recipient, verificationLink } = (await request.json()) as {
        recipient: string;
        verificationLink: string;
    };

    if (!recipient || !verificationLink) {
        return {
            status: 400,
            body: 'Please pass a recipient and a verificationLink on the query string or in the request body',
        };
    }

    const responseMessage = async () => {
        const url = process.env.SEND_EMAIL_ENDPOINT;
        // post request to url
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to: recipient,
                subject: 'NIMAH - Account Verification',
                plainText: `Welcome to NIMAH! Please verify your email by clicking the link: ${verificationLink}`,
                html: `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to Our Community</title>
            <style>
                body {
                    font-family: 'Georgia', serif;
                    color: #6d5c44;
                    line-height: 1.6;
                    margin: 0;
                    padding: 0;
                    background-color: #faf7f2;
                }
                .email-container {
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #fff;
                    border: 1px solid #e0d5c1;
                }
                .header {
                    text-align: center;
                    padding: 20px 0;
                    border-bottom: 1px solid #e0d5c1;
                }
                .logo {
                    font-size: 28px;
                    color: #b39069;
                    letter-spacing: 2px;
                    font-weight: normal;
                }
                .tagline {
                    font-size: 14px;
                    color: #b39069;
                    letter-spacing: 1px;
                    margin-top: 5px;
                }
                .content {
                    padding: 30px 20px;
                    text-align: center;
                }
                h1 {
                    color: #967259;
                    font-size: 28px;
                    font-weight: normal;
                    margin-bottom: 20px;
                }
                p {
                    color: #6d5c44;
                    font-size: 16px;
                    margin-bottom: 20px;
                }
                .button-container {
                    text-align: center;
                    margin: 35px 0;
                }
                /* Override default link styling for the button */
                a.button, .button {
                    display: inline-block;
                    background-color: #c1a178;
                    color: white !important;
                    text-decoration: none !important;
                    padding: 14px 40px;
                    font-size: 16px;
                    border-radius: 3px;
                    transition: background-color 0.3s;
                }
                a.button:hover, .button:hover {
                    background-color: #b39069;
                }
                .footer {
                    text-align: center;
                    padding: 20px;
                    font-size: 13px;
                    color: #a99780;
                    border-top: 1px solid #e0d5c1;
                }
                .social-links {
                    margin: 15px 0;
                }
                .social-links a {
                    color: #b39069;
                    margin: 0 10px;
                    text-decoration: none;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <div class="logo">NIMAH</div>
                    <div class="tagline">CURATED EXPERIENCE</div>
                </div>
                
                <div class="content">
                    <h1>Welcome to Our Community</h1>
                    <p>Thank you for joining us. We're delighted to have you as part of our growing community of art enthusiasts and creators.</p>
                    <p>To complete your registration and start exploring our curated collection, please verify your email address.</p>
                    
                    <div class="button-container">
                        <a href=${verificationLink} class="button">Verify Now</a>
                    </div>
                    
                    <p>If you didn't create an account, please disregard this email.</p>
                </div>
                
                <div class="footer">
                    <p>© 2025 Nimah Art Boutique. All rights reserved.</p>
                    <div class="social-links">
                        <a href="#">Instagram</a> | <a href="#">Facebook</a> | <a href="#">Twitter</a>
                    </div>
                    <p>You received this email because you signed up for our services.<br></p>
                </div>
            </div>
        </body>
        </html>`,
            }),
        });
        const data = await response.json();
        return data;
    };

    return {
        body: await responseMessage(),
    };
}

app.http('verifyEmail', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: verifyEmail,
});
