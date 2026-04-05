-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "bloodGroup" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "peopleCount" INTEGER;
