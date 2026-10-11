CREATE TABLE "ProjectActivity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectActivity_projectId_createdAt_idx" ON "ProjectActivity"("projectId", "createdAt");

ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ProjectActivity" ("id", "projectId", "userId", "action", "details", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), p."id", p."createdByUserId", 'project.created',
       'Project created', p."createdAt"
FROM "Project" p;

INSERT INTO "ProjectActivity" ("id", "projectId", "userId", "action", "details", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), p."id", p."updatedByUserId", 'project.updated',
       'Project details last updated (historical activity)', p."updatedAt"
FROM "Project" p
WHERE p."updatedByUserId" IS NOT NULL AND p."updatedAt" > p."createdAt";

INSERT INTO "ProjectActivity" ("id", "projectId", "userId", "action", "details", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), f."projectId", NULL, 'file.uploaded',
       'Uploaded “' || f."fileName" || '” (historical activity)', f."createdAt"
FROM "ProjectFile" f;

INSERT INTO "ProjectActivity" ("id", "projectId", "userId", "action", "details", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), ph."projectId", NULL, 'phase.updated',
       'Phase “' || ph."name" || '” last updated (historical activity)', ph."updatedAt"
FROM "ProjectPhase" ph
WHERE ph."updatedAt" > ph."createdAt";
