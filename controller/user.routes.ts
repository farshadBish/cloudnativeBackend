import express, { NextFunction, Request, Response } from 'express';
import userService from '../service/user.service';
import { Role, UserInput, UserLoginInput } from '../types/index';

const userRouter = express.Router();

userRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { auth } = req as Request & { auth: { username: string; role: Role } };
        const { username, role } = auth;
        // console.log('Auth:', auth);
        const response = await userService.getAllUsers({ username, role });
        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
});

userRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userInput = <UserInput>req.body;
        const response = await userService.registerUser(userInput);
        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
});

userRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userInput = <UserLoginInput>req.body;
        const response = await userService.authenticate(userInput);
        res.status(200).json({ message: 'Authentication succesful', ...response });
    } catch (error) {
        next(error);
    }
});

export { userRouter };
