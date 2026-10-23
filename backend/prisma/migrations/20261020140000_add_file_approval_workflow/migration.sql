CREATE TYPE "FileReviewStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- Keep all existing library files visible while new uploads enter review as drafts.
ALTER TABLE "ProjectFile"
  ADD COLUMN "reviewStatus" "FileReviewStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "uploadedByUserId" TEXT,
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewComment" TEXT;

ALTER TABLE "ProjectFile"
  ADD CONSTRAINT "ProjectFile_uploadedByUserId_fkey"
    FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectFile_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProjectFile_projectId_reviewStatus_createdAt_idx"
  ON "ProjectFile"("projectId", "reviewStatus", "createdAt");

-- Existing client memberships are read-only. Keep that invariant in stored data too.
UPDATE "ProjectMember" AS membership
SET "role" = 'VIEWER'
FROM "User" AS account
WHERE membership."userId" = account."id"
  AND account."role" = 'CLIENT'
  AND membership."role" <> 'VIEWER';

ALTER TABLE "ProjectFile" ALTER COLUMN "reviewStatus" SET DEFAULT 'DRAFT';
