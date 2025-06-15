// util/seed.ts
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { Container } from '@azure/cosmos';
import { usersContainer, artPiecesContainer } from './database';

// Purge all documents from the Users container (PK = id)
async function purgeUsers(container: Container) {
    const { resources } = await container.items
        .query<{ id: string }>({ query: 'SELECT c.id FROM c' })
        .fetchAll();
    await Promise.all(resources.map((doc) => container.item(doc.id, doc.id).delete()));
}

// Purge all documents from the ArtPieces container
// Partition key may be /id or /userId; we read both fields to delete correctly
async function purgeArtPieces(container: Container) {
    const { resources } = await container.items
        .query<{ id: string; userId: string }>({
            query: 'SELECT c.id, c.userId FROM c',
        })
        .fetchAll();
    await Promise.all(
        resources.map((doc) =>
            // use userId as the partition key if container is partitioned on userId
            container.item(doc.id, doc.userId).delete()
        )
    );
}

async function main() {
    console.log('Purging existing documents...');
    await purgeArtPieces(artPiecesContainer);
    await purgeUsers(usersContainer);

    console.log('Seeding users...');
    const timestamp = new Date().toISOString();

    const rawArtPieces = [
        {
            id: uuidv4(),
            title: 'Mona Lisa',
            description: 'A portrait of a woman',
            artist: 'Leonardo da Vinci',
            price: 1000000,
            tags: ['portrait', 'renaissance'],
            year: 1503,
            url: 'https://cloudnativeproject.blob.core.windows.net/image/Mona_Lisa.jpg',
            publishOnMarket: true,
        },
        // ... rest of art pieces ... you can keep existing list ...
        {
            id: uuidv4(),
            title: 'The Starry Night',
            description: 'A night sky filled with swirling stars',
            artist: 'Vincent van Gogh',
            price: 950000,
            tags: ['post-impressionism', 'night'],
            year: 1889,
            url: 'https://cloudnativeproject.blob.core.windows.net/image/starry_night.jpg',
            publishOnMarket: true,
        },
        {
            id: uuidv4(),
            title: 'The Persistence of Memory',
            description: 'Melting clocks in a dreamlike landscape',
            artist: 'Salvador Dalí',
            price: 870000,
            tags: ['surrealism', 'time'],
            year: 1931,
            url: 'https://cloudnativeproject.blob.core.windows.net/image/The_Persistence_of_Memory.jpg',
            publishOnMarket: true,
        },
        {
            id: uuidv4(),
            title: 'The Scream',
            description: 'An agonized figure against a blood-red sky',
            artist: 'Edvard Munch',
            price: 820000,
            tags: ['expressionism', 'emotion'],
            year: 1893,
            url: 'https://cloudnativeproject.blob.core.windows.net/image/the_scream.jpg',
            publishOnMarket: true,
        },
        {
            id: uuidv4(),
            title: 'Girl with a Pearl Earring',
            description: 'A girl turning toward the viewer with a pearl earring',
            artist: 'Johannes Vermeer',
            price: 780000,
            tags: ['baroque', 'portrait'],
            year: 1665,
            url: 'https://cloudnativeproject.blob.core.windows.net/image/Girl_with_a_Pearl_Earring.jpg',
            publishOnMarket: true,
        },
        {
            id: uuidv4(),
            title: 'Guernica',
            description: 'A mural-sized oil painting on canvas against war',
            artist: 'Pablo Picasso',
            price: 1200000,
            tags: ['cubism', 'war', 'black and white'],
            year: 1937,
            url: 'https://cloudnativeproject.blob.core.windows.net/image/guernica.jpg',
            publishOnMarket: true,
        },
        {
            id: uuidv4(),
            title: 'The Birth of Venus',
            description: 'Goddess Venus emerging from the sea',
            artist: 'Sandro Botticelli',
            price: 1100000,
            tags: ['renaissance', 'mythology'],
            year: 1486,
            url: 'https://cloudnativeproject.blob.core.windows.net/image/birth-of-venus.jpg',
            publishOnMarket: true,
        },
        {
            id: uuidv4(),
            title: 'The Kiss',
            description: 'A couple embracing in a golden setting',
            artist: 'Gustav Klimt',
            price: 890000,
            tags: ['symbolism', 'love'],
            year: 1908,
            url: 'https://cloudnativeproject.blob.core.windows.net/image/The_Kiss.webp',
            publishOnMarket: true,
        },
        {
            id: uuidv4(),
            title: 'American Gothic',
            description: 'A farmer and his daughter standing before a house',
            artist: 'Grant Wood',
            price: 720000,
            tags: ['realism', 'american'],
            year: 1930,
            url: 'https://cloudnativeproject.blob.core.windows.net/image/american_gothic.jpg',
            publishOnMarket: true,
        },
        {
            id: uuidv4(),
            title: 'Las Meninas',
            description: 'A group portrait of the Spanish royal family',
            artist: 'Diego Velázquez',
            price: 1300000,
            tags: ['baroque', 'royalty'],
            year: 1656,
            url: 'https://cloudnativeproject.blob.core.windows.net/image/Las_Meninas.jpg',
            publishOnMarket: true,
        },
        {
            id: uuidv4(),
            title: 'Water Lilies',
            description: 'Impressionist depiction of water lilies',
            artist: 'Claude Monet',
            price: 760000,
            tags: ['impressionism', 'nature'],
            year: 1916,
            url: 'https://cloudnativeproject.blob.core.windows.net/image/monet.jpg',
            publishOnMarket: true,
        },
    ];

    const adminId = uuidv4();
    const leoId = uuidv4();

    const users = [
        {
            id: adminId,
            username: 'admin',
            passwordHash: await bcrypt.hash('admin', 10),
            firstName: 'admin',
            lastName: 'admin',
            email: 'administration@ucll.be',
            role: 'admin',
            likedArtPieces: [] as string[],
            cart: [] as string[],
            createdPieces: [] as string[],
            createdAt: timestamp,
            updatedAt: timestamp,
        },
        {
            id: leoId,
            username: 'Leonardo',
            passwordHash: await bcrypt.hash('Leonardo', 10),
            firstName: 'Leonardo',
            lastName: 'da Vinci',
            email: 'r0966298@ucll.be',
            role: 'user',
            likedArtPieces: [] as string[],
            cart: [] as string[],
            createdPieces: rawArtPieces.map((piece) => piece.id),
            createdAt: timestamp,
            updatedAt: timestamp,
        },
        {
            id: uuidv4(),
            username: 'zev',
            passwordHash: await bcrypt.hash('zev', 10),
            firstName: 'zev',
            lastName: 'zev',
            email: 'zevniwtit@gmail.com',
            role: 'user',
            likedArtPieces: [] as string[],
            cart: [] as string[],
            createdPieces: [] as string[],
            createdAt: timestamp,
            updatedAt: timestamp,
        },
    ];

    for (const user of users) {
        await usersContainer.items.create(user);
    }

    console.log('Seeding art pieces...');

    const artDocs = rawArtPieces.map((piece) => ({
        ...piece,
        userId: leoId,
        folderName: uuidv4(),
        likedBy: [] as string[],
        inCart: [] as string[],
        createdAt: timestamp,
        updatedAt: timestamp,
    }));

    for (const art of artDocs) {
        await artPiecesContainer.items.create(art);
    }

    console.log('Linking admin likes and cart...');
    const { resource: admin } = await usersContainer.item(adminId, adminId).read<any>();
    admin.likedArtPieces.push(artDocs[0].id);
    admin.cart.push(artDocs[0].id);
    await usersContainer.item(adminId, adminId).replace(admin);

    console.log('Seeding complete.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
