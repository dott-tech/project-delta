-- Parent/site progress comes from its child structures; only leaf projects own phases.
DELETE FROM "ProjectPhase" AS phase
WHERE phase."projectId" IN (
  SELECT DISTINCT child."parentProjectId"
  FROM "Project" AS child
  WHERE child."parentProjectId" IS NOT NULL
);

-- Keep phase order and status values aligned with the fixed two-state workflow.
UPDATE "ProjectPhase" AS phase
SET "order" = phase_order."order"
FROM (
  VALUES
    ('Concept Design', 1),
    ('Design Calculation', 2),
    ('Modeling', 3),
    ('Sheeting', 4),
    ('Done', 5)
) AS phase_order("name", "order")
WHERE phase."name" = phase_order."name";

UPDATE "ProjectPhase"
SET "status" = 'NOT_STARTED'::"PhaseStatus",
    "progressPercent" = 0
WHERE "status" IN ('IN_PROGRESS'::"PhaseStatus", 'BLOCKED'::"PhaseStatus");

-- Ensure each leaf project has the four weighted work phases and final Done phase.
INSERT INTO "ProjectPhase" (
  "id", "projectId", "name", "order", "status", "progressPercent",
  "startDate", "endDate", "notes", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  project."id",
  phase."name",
  phase."order",
  'NOT_STARTED'::"PhaseStatus",
  0,
  NULL,
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Project" AS project
CROSS JOIN (
  VALUES
    ('Concept Design', 1),
    ('Design Calculation', 2),
    ('Modeling', 3),
    ('Sheeting', 4),
    ('Done', 5)
) AS phase("name", "order")
WHERE NOT EXISTS (
  SELECT 1
  FROM "Project" AS child
  WHERE child."parentProjectId" = project."id"
)
AND NOT EXISTS (
  SELECT 1
  FROM "ProjectPhase" AS existing
  WHERE existing."projectId" = project."id"
    AND existing."name" = phase."name"
);
