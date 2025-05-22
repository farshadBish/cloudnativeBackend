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
            url: 'http://cdn.britannica.com/24/189624-050-F3C5BAA9/Mona-Lisa-oil-wood-panel-Leonardo-da.jpg',
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
            url: 'https://www.artble.com/imgs/e/d/4/45975/starry_night.jpg',
        },
        {
            id: uuidv4(),
            title: 'The Persistence of Memory',
            description: 'Melting clocks in a dreamlike landscape',
            artist: 'Salvador Dalí',
            price: 870000,
            tags: ['surrealism', 'time'],
            year: 1931,
            url: 'https://upload.wikimedia.org/wikipedia/en/d/dd/The_Persistence_of_Memory.jpg',
        },
        {
            id: uuidv4(),
            title: 'The Scream',
            description: 'An agonized figure against a blood-red sky',
            artist: 'Edvard Munch',
            price: 820000,
            tags: ['expressionism', 'emotion'],
            year: 1893,
            url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73_cm%2C_National_Gallery_of_Norway.jpg/800px-Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73_cm%2C_National_Gallery_of_Norway.jpg',
        },
        {
            id: uuidv4(),
            title: 'Girl with a Pearl Earring',
            description: 'A girl turning toward the viewer with a pearl earring',
            artist: 'Johannes Vermeer',
            price: 780000,
            tags: ['baroque', 'portrait'],
            year: 1665,
            url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/1665_Girl_with_a_Pearl_Earring.jpg/800px-1665_Girl_with_a_Pearl_Earring.jpg',
        },
        {
            id: uuidv4(),
            title: 'Guernica',
            description: 'A mural-sized oil painting on canvas against war',
            artist: 'Pablo Picasso',
            price: 1200000,
            tags: ['cubism', 'war', 'black and white'],
            year: 1937,
            url: 'https://historiek.net/wp-content/uploads-phistor1/2008/12/guernica-picasso.jpg',
        },
        {
            id: uuidv4(),
            title: 'The Birth of Venus',
            description: 'Goddess Venus emerging from the sea',
            artist: 'Sandro Botticelli',
            price: 1100000,
            tags: ['renaissance', 'mythology'],
            year: 1486,
            url: 'https://moaonline.org/wp-content/uploads/2020/10/birth-of-venus-photo-set_Page_1-1000x614.jpg',
        },
        {
            id: uuidv4(),
            title: 'The Kiss',
            description: 'A couple embracing in a golden setting',
            artist: 'Gustav Klimt',
            price: 890000,
            tags: ['symbolism', 'love'],
            year: 1908,
            url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg/500px-The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg',
        },
        {
            id: uuidv4(),
            title: 'American Gothic',
            description: 'A farmer and his daughter standing before a house',
            artist: 'Grant Wood',
            price: 720000,
            tags: ['realism', 'american'],
            year: 1930,
            url: 'https://upload.wikimedia.org/wikipedia/commons/c/cc/Grant_Wood_-_American_Gothic_-_Google_Art_Project.jpg',
        },
        {
            id: uuidv4(),
            title: 'Las Meninas',
            description: 'A group portrait of the Spanish royal family',
            artist: 'Diego Velázquez',
            price: 1300000,
            tags: ['baroque', 'royalty'],
            year: 1656,
            url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Diego_Vel%C3%A1zquez_Las_Meninas_Die_Hoffr%C3%A4ulein.jpg/960px-Diego_Vel%C3%A1zquez_Las_Meninas_Die_Hoffr%C3%A4ulein.jpg',
        },
        {
            id: uuidv4(),
            title: 'Water Lilies',
            description: 'Impressionist depiction of water lilies',
            artist: 'Claude Monet',
            price: 760000,
            tags: ['impressionism', 'nature'],
            year: 1916,
            url: 'https://www.artic.edu/iiif/2/3c27b499-af56-f0d5-93b5-a7f2f1ad5813/full/1686,/0/default.jpg',
        },
    ];

    const adminId = uuidv4();
    const leoId = uuidv4();

    const users = [
        {
            id: adminId,
            username: 'admin',
            password: await bcrypt.hash('admin', 10),
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
            password: await bcrypt.hash('Leonardo', 10),
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
