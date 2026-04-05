/*
  Warnings:

  - You are about to drop the column `allergies` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `bloodGroup` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `individualId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `latitude` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."User_individualId_key";

-- AlterTable
ALTER TABLE "public"."Family" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "allergies",
DROP COLUMN "bloodGroup",
DROP COLUMN "individualId",
DROP COLUMN "latitude",
DROP COLUMN "longitude",
DROP COLUMN "notes",
ADD COLUMN     "lastLocation" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "peopleCount" SET DEFAULT 1;

-- AddForeignKey
ALTER TABLE "public"."Family" ADD CONSTRAINT "Family_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
