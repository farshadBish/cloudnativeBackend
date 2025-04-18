-- DropForeignKey
ALTER TABLE "ArtPiece" DROP CONSTRAINT "ArtPiece_userId_fkey";

-- AddForeignKey
ALTER TABLE "ArtPiece" ADD CONSTRAINT "ArtPiece_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
