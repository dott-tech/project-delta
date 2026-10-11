-- AlterEnum
ALTER TYPE "FileType" ADD VALUE 'OTHER';

-- AlterEnum
ALTER TYPE "ProjectRole" ADD VALUE 'ADMIN';

-- AlterTable
ALTER TABLE "ProjectFile" ADD COLUMN     "allowedRoles" "ProjectRole"[] DEFAULT ARRAY['ADMIN']::"ProjectRole"[],
ALTER COLUMN "fileType" SET DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "ProjectPhase" ADD COLUMN     "progressPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ReplitEmbed" ALTER COLUMN "title" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'TEAM_MEMBER';
