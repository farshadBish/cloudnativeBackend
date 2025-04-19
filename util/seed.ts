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



    const artPieces = await prisma.artPiece.createMany({
        data: [
            {
                id: 1,
                title: 'Mona Lisa',
                description: 'A portrait of a woman',
                artist: 'Leonardo da Vinci',
                userId: Leonardo.id,
                price: 1000000,
                tags: ['portrait', 'renaissance'],
                year: 1503,
                url: 'http://cdn.britannica.com/24/189624-050-F3C5BAA9/Mona-Lisa-oil-wood-panel-Leonardo-da.jpg',
            },

            {
                id: 2,
                title: 'The Starry Night',
                description: 'A night sky filled with swirling stars',
                artist: 'Vincent van Gogh',
                userId: Leonardo.id,
                price: 950000,
                tags: ['post-impressionism', 'night'],
                year: 1889,
                url: 'https://www.artble.com/imgs/e/d/4/45975/starry_night.jpg',
            },
            {
                id: 3,
                title: 'The Persistence of Memory',
                description: 'Melting clocks in a dreamlike landscape',
                artist: 'Salvador Dalí',
                userId: Leonardo.id,
                price: 870000,
                tags: ['surrealism', 'time'],
                year: 1931,
                url: 'https://upload.wikimedia.org/wikipedia/en/d/dd/The_Persistence_of_Memory.jpg',
            },
            {
                id: 4,
                title: 'The Scream',
                description: 'An agonized figure against a blood-red sky',
                artist: 'Edvard Munch',
                userId: Leonardo.id,
                price: 820000,
                tags: ['expressionism', 'emotion'],
                year: 1893,
                url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73_cm%2C_National_Gallery_of_Norway.jpg/800px-Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73_cm%2C_National_Gallery_of_Norway.jpg',
            },
            {
                id: 5,
                title: 'Girl with a Pearl Earring',
                description: 'A girl turning toward the viewer with a pearl earring',
                artist: 'Johannes Vermeer',
                userId: Leonardo.id,
                price: 780000,
                tags: ['baroque', 'portrait'],
                year: 1665,
                url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/1665_Girl_with_a_Pearl_Earring.jpg/800px-1665_Girl_with_a_Pearl_Earring.jpg',
            },
            {
                id: 6,
                title: 'Guernica',
                description: 'A mural-sized oil painting on canvas against war',
                artist: 'Pablo Picasso',
                userId: Leonardo.id,
                price: 1200000,
                tags: ['cubism', 'war', 'black and white'],
                year: 1937,
                url: 'https://historiek.net/wp-content/uploads-phistor1/2008/12/guernica-picasso.jpg',
            },
            {
                id: 7,
                title: 'The Birth of Venus',
                description: 'Goddess Venus emerging from the sea',
                artist: 'Sandro Botticelli',
                userId: Leonardo.id,
                price: 1100000,
                tags: ['renaissance', 'mythology'],
                year: 1486,
                url: 'https://moaonline.org/wp-content/uploads/2020/10/birth-of-venus-photo-set_Page_1-1000x614.jpg',
            },
            {
                id: 8,
                title: 'The Kiss',
                description: 'A couple embracing in a golden setting',
                artist: 'Gustav Klimt',
                userId: Leonardo.id,
                price: 890000,
                tags: ['symbolism', 'love'],
                year: 1908,
                url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg/500px-The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg',
            },
            {
                id: 9,
                title: 'American Gothic',
                description: 'A farmer and his daughter standing before a house',
                artist: 'Grant Wood',
                userId: Leonardo.id,
                price: 720000,
                tags: ['realism', 'american'],
                year: 1930,
                url: 'https://upload.wikimedia.org/wikipedia/commons/c/cc/Grant_Wood_-_American_Gothic_-_Google_Art_Project.jpg',
            },
            {
                id: 10,
                title: 'Las Meninas',
                description: 'A group portrait of the Spanish royal family',
                artist: 'Diego Velázquez',
                userId: Leonardo.id,
                price: 1300000,
                tags: ['baroque', 'royalty'],
                year: 1656,
                url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Diego_Vel%C3%A1zquez_Las_Meninas_Die_Hoffr%C3%A4ulein.jpg/960px-Diego_Vel%C3%A1zquez_Las_Meninas_Die_Hoffr%C3%A4ulein.jpg',
            },
            {
                id: 11,
                title: 'Water Lilies',
                description: 'Impressionist depiction of water lilies',
                artist: 'Claude Monet',
                userId: Leonardo.id,
                price: 760000,
                tags: ['impressionism', 'nature'],
                year: 1916,
                url: 'https://www.artic.edu/iiif/2/3c27b499-af56-f0d5-93b5-a7f2f1ad5813/full/1686,/0/default.jpg',
            },
        ],
    });

    const artPiece1 = await prisma.artPiece.findUniqueOrThrow({
        where: { id: 1 },
      });

      
    await prisma.user.update({
        where: { id: admin.id },
        data: {
            likedArtPieces: {
                connect: { id: artPiece1.id },
            },
            cart: {
                connect: { id: artPiece1.id },
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
