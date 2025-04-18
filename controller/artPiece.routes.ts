import express, { NextFunction, Request, Response } from 'express';
import ArtPieceService from '../service/artPiece.service';
import { Role } from '../types';

const artPieceRouter = express.Router();

artPieceRouter.post('/create', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as Request & { auth: { username: string; role: Role } };
        const { username, role } = auth;
        const artPieceInput = req.body;
        const response = await ArtPieceService.registerArtPiece(artPieceInput);
        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
});

artPieceRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as Request & { auth: { username: string; role: Role } };
        const { username, role } = auth;
        const response = await ArtPieceService.getAllArtPieces();
        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
});

export { artPieceRouter };
