import express, { NextFunction, Request, Response } from 'express';
import ArtPieceService from '../service/artPiece.service';
import { Role } from '../types';
import multer from 'multer';
import path from 'path';

const artPieceRouter = express.Router();

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Files will be temporarily stored here, then moved to the art piece folder
        cb(null, path.join(__dirname, '../artPieces'));
    },
    filename: function (req, file, cb) {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    },
});

// Create multer instance with file filters
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max file size
    fileFilter: (req, file, cb) => {
        // Accept only image files
        const filetypes = /jpeg|jpg|webp|png|gif/;
        const mimetypes = /^image\/(jpeg|jpg|webp|png|gif)$/;

        // Check mimetype (e.g., "image/jpeg")
        const mimetype = mimetypes.test(file.mimetype);

        // Check file extension (e.g., ".jpg")
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed!'));
    },
});

artPieceRouter.post(
    '/create',
    upload.array('images', 8),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { auth } = req as Request & { auth: { username: string; role: Role } };
            const { username, role } = auth;

            // Get text data from request body
            const artPieceInput = req.body;

            // Get uploaded files
            const files = req.files as Express.Multer.File[];

            // Pass both the art piece data and files to the service
            const response = await ArtPieceService.registerArtPiece(
                artPieceInput,
                files,
                username,
                role
            );

            res.status(200).json(response);
        } catch (error) {
            // Clean up any uploaded files if there's an error
            next(error);
        }
    }
);

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
