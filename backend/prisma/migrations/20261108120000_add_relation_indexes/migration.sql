-- CreateIndex
CREATE INDEX "Project_parentProjectId_isArchived_idx" ON "Project"("parentProjectId", "isArchived");

-- CreateIndex
CREATE INDEX "ProjectPhase_projectId_order_idx" ON "ProjectPhase"("projectId", "order");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE INDEX "ProjectFile_projectId_idx" ON "ProjectFile"("projectId");

-- Remove duplicate entries from file role lists saved before the API de-duplicated them.
UPDATE "ProjectFile"
SET "allowedRoles" = ARRAY(SELECT DISTINCT unnest("allowedRoles") ORDER BY 1)
WHERE cardinality("allowedRoles") <> (SELECT count(DISTINCT r) FROM unnest("allowedRoles") AS r);
