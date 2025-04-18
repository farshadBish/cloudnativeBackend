-- CreateTable
CREATE TABLE "_UserLikedArtPieces" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "_UserCartArtPieces" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_UserLikedArtPieces_AB_unique" ON "_UserLikedArtPieces"("A", "B");

-- CreateIndex
CREATE INDEX "_UserLikedArtPieces_B_index" ON "_UserLikedArtPieces"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_UserCartArtPieces_AB_unique" ON "_UserCartArtPieces"("A", "B");

-- CreateIndex
CREATE INDEX "_UserCartArtPieces_B_index" ON "_UserCartArtPieces"("B");

-- AddForeignKey
ALTER TABLE "_UserLikedArtPieces" ADD CONSTRAINT "_UserLikedArtPieces_A_fkey" FOREIGN KEY ("A") REFERENCES "ArtPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserLikedArtPieces" ADD CONSTRAINT "_UserLikedArtPieces_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserCartArtPieces" ADD CONSTRAINT "_UserCartArtPieces_A_fkey" FOREIGN KEY ("A") REFERENCES "ArtPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserCartArtPieces" ADD CONSTRAINT "_UserCartArtPieces_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
