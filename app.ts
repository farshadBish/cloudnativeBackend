import * as bodyParser from 'body-parser';
import cors from 'cors';
import * as dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import { expressjwt } from 'express-jwt';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { userRouter } from './controller/user.routes';
import { artPieceRouter } from './controller/artPiece.routes';

const app = express();
dotenv.config();
const port = process.env.APP_PORT || 3000;

// app.use(cors({ origin: 'http://localhost:8080' }));
app.use(cors({}));
app.use(bodyParser.json());

app.use(
    expressjwt({
        secret: process.env.JWT_SECRET || 'default_secret',
        algorithms: ['HS256'],
    }).unless({
        path: [
            // '/user',
            // '/item',
            '/api-docs',
            /^\/api-docs\/.*/,
            '/user/login',
            '/user/register',
            '/status',
        ],
    })
);

app.use('/user', userRouter);
app.use('/item', artPieceRouter);

app.get('/status', (req, res) => {
    res.json({ message: 'Art Galley Backend is running...' });
});

const swaggerOpts = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Art Galley Backend',
            version: '1.0.0',
        },
    },
    apis: ['./controller/*.routes.ts'],
};
const swaggerSpec = swaggerJSDoc(swaggerOpts);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err.name === 'UnauthorizedError') {
        res.status(401).json({ status: 'unauthorized', message: err.message });
    } else if (err.name === 'CoursesError') {
        res.status(400).json({ status: 'domain error', message: err.message });
    } else {
        res.status(400).json({ status: 'application error', message: err.message });
    }
});

app.listen(port || 3000, () => {
    console.log(`Art Galley Backend is running on port ${port}.`);
});
