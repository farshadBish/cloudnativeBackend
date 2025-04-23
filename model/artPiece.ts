import { User } from './user';

/**
 * Shape of a Cosmos DB ArtPiece document
 */
export interface RawArtPiece {
    id: string;
    title: string;
    description: string;
    artist: string;
    userId: string; // reference to User.id
    price: number;
    tags: string[];
    year: number;
    url?: string;
    folderName: string;
    likedBy?: string[]; // array of User IDs
    inCart?: string[]; // array of User IDs
    createdAt: string; // ISO timestamp
    updatedAt: string; // ISO timestamp
}

export class ArtPiece {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly artist: string;
    readonly userId: string;
    readonly price: number;
    readonly tags: string[];
    readonly year: number;
    readonly url?: string;
    readonly folderName: string;
    readonly likedBy: string[];
    readonly inCart: string[];
    readonly createdAt: Date;
    readonly updatedAt: Date;
    user?: User;

    constructor(props: {
        id: string;
        title: string;
        description: string;
        artist: string;
        userId: string;
        price: number;
        tags: string[];
        year: number;
        url?: string;
        folderName: string;
        likedBy?: string[];
        inCart?: string[];
        createdAt?: Date;
        updatedAt?: Date;
        user?: User;
    }) {
        this.id = props.id;
        this.title = props.title;
        this.description = props.description;
        this.artist = props.artist;
        this.userId = props.userId;
        this.price = props.price;
        this.tags = props.tags;
        this.year = props.year;
        this.url = props.url;
        this.folderName = props.folderName;
        this.likedBy = props.likedBy || [];
        this.inCart = props.inCart || [];
        this.createdAt = props.createdAt || new Date();
        this.updatedAt = props.updatedAt || new Date();
        this.user = props.user;
    }

    /**
     * Factory to build an ArtPiece from raw Cosmos data
     */
    static from(raw: RawArtPiece): ArtPiece {
        return new ArtPiece({
            id: raw.id,
            title: raw.title,
            description: raw.description,
            artist: raw.artist,
            userId: raw.userId,
            price: raw.price,
            tags: raw.tags,
            year: raw.year,
            url: raw.url,
            folderName: raw.folderName,
            likedBy: raw.likedBy,
            inCart: raw.inCart,
            createdAt: new Date(raw.createdAt),
            updatedAt: new Date(raw.updatedAt),
        });
    }

    getId(): string {
        return this.id;
    }

    getTitle(): string {
        return this.title;
    }

    getDescription(): string {
        return this.description;
    }

    getArtist(): string {
        return this.artist;
    }

    getUserId(): string {
        return this.userId;
    }

    getPrice(): number {
        return this.price;
    }

    getTags(): string[] {
        return [...this.tags];
    }

    getYear(): number {
        return this.year;
    }

    getUrl(): string | undefined {
        return this.url;
    }

    getFolderName(): string {
        return this.folderName;
    }

    getLikedByIds(): string[] {
        return [...this.likedBy];
    }

    getInCartIds(): string[] {
        return [...this.inCart];
    }

    getCreatedAt(): Date {
        return this.createdAt;
    }

    getUpdatedAt(): Date {
        return this.updatedAt;
    }
}
