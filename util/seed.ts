import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const main = async () => {
    await prisma.artPiece.deleteMany();
    await prisma.user.deleteMany();

    const admin = await prisma.user.create({
        data: {
            id: 1,
            username: 'admin',
            password: await bcrypt.hash('admin', 12),
            firstName: 'admin',
            lastName: 'admin',
            email: 'administration@ucll.be',
            role: 'admin',
        },
    });

    const Leonardo = await prisma.user.create({
        data: {
            id: 2,
            username: 'Leonardo',
            password: await bcrypt.hash('Leonardo', 12),
            firstName: 'Leonardo',
            lastName: 'da Vinci',
            email: 'leonardo@gmail.com',
            role: 'user',
        },
    });

    const artPiece = await prisma.artPiece.create({
        data: {
            id: 1,
            title: 'Mona Lisa',
            description: 'A portrait of a woman',
            userId: Leonardo.id,
            price: 1000000,
            tags: ['portrait', 'renaissance'],
            year: 1503,
        },
    });

    await prisma.user.update({
        where: { id: admin.id },
        data: {
            likedArtPieces: {
                connect: { id: artPiece.id },
            },
            // Optionally also add to cart
            cart: {
                connect: { id: artPiece.id },
            },
        },
    });
};

(async () => {
    try {
        await main();
        await prisma.$disconnect();
    } catch (error) {
        console.error(error);
        await prisma.$disconnect();
        process.exit(1);
    }
})();
