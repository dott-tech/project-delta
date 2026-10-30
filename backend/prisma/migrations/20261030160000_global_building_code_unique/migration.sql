UPDATE "Project"
SET "buildingCode" = NULLIF(upper(btrim("buildingCode")), '')
WHERE "buildingCode" IS NOT NULL;

-- Keep the oldest project on a duplicated code and give later projects a
-- deterministic available suffix (for example ST-02-2, then ST-02-3).
DO $$
DECLARE
  duplicate RECORD;
  candidate TEXT;
  suffix INTEGER;
BEGIN
  FOR duplicate IN
    SELECT "id", "buildingCode", "createdAt", occurrence
    FROM (
      SELECT
        "id",
        "buildingCode",
        "createdAt",
        row_number() OVER (PARTITION BY "buildingCode" ORDER BY "createdAt", "id") AS occurrence
      FROM "Project"
      WHERE "buildingCode" IS NOT NULL
    ) AS ranked
    WHERE occurrence > 1
    ORDER BY "createdAt", "id"
  LOOP
    suffix := duplicate.occurrence;
    candidate := duplicate."buildingCode" || '-' || suffix::text;

    WHILE EXISTS (SELECT 1 FROM "Project" WHERE "buildingCode" = candidate) LOOP
      suffix := suffix + 1;
      candidate := duplicate."buildingCode" || '-' || suffix::text;
    END LOOP;

    UPDATE "Project"
    SET "buildingCode" = candidate
    WHERE "id" = duplicate."id";
  END LOOP;
END $$;

CREATE UNIQUE INDEX "Project_buildingCode_key" ON "Project"("buildingCode");
