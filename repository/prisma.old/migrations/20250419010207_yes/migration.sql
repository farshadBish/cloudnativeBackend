/*
  Warnings:

  - Added the required column `url` to the `ArtPiece` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ArtPiece" ADD COLUMN     "url" TEXT NOT NULL;
