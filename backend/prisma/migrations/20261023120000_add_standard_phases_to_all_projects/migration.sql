-- Every project and nested building package uses the same four engineering phases.
-- Add only missing phases so existing phase progress and notes remain intact.
INSERT INTO "ProjectPhase" (
  "id",
  "projectId",
  "name",
  "order",
  "status",
  "progressPercent",
  "startDate",
  "endDate",
  "notes",
  "createdAt",
  "updatedAt"
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
    ('Sheeting', 4)
) AS phase("name", "order")
WHERE NOT EXISTS (
  SELECT 1
  FROM "ProjectPhase" AS existing
  WHERE existing."projectId" = project."id"
    AND existing."name" = phase."name"
);
