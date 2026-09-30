-- AlterTable
ALTER TABLE "Phase" ADD COLUMN     "updatedById" TEXT;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
