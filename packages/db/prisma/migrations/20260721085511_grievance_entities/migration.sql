-- AlterTable
ALTER TABLE "grievance_categories" ADD COLUMN     "entitiesRequired" JSONB NOT NULL DEFAULT '[]';
