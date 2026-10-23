-- Project-level ADMIN duplicated the global system ADMIN concept. Map existing
-- project ADMIN assignments and file visibility rules to MANAGER, then remove
-- the value from the enum while keeping the global User role unchanged.

ALTER TABLE "ProjectMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "ProjectFile" ALTER COLUMN "allowedRoles" DROP DEFAULT;

CREATE TYPE "ProjectRole_next" AS ENUM ('VIEWER', 'EDITOR', 'MANAGER');

-- PostgreSQL disallows a subquery directly in ALTER COLUMN ... USING. Put the
-- array mapping in a function so the enum array can be converted safely.
CREATE FUNCTION "map_project_role_array"("roles" "ProjectRole"[])
RETURNS "ProjectRole_next"[]
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
  SELECT COALESCE(
    array_agg(
      CASE
        WHEN role_value = 'ADMIN'::"ProjectRole" THEN 'MANAGER'::"ProjectRole_next"
        ELSE role_value::text::"ProjectRole_next"
      END
    ),
    ARRAY[]::"ProjectRole_next"[]
  )
  FROM unnest("roles") AS roles(role_value)
$$;

ALTER TABLE "ProjectMember"
  ALTER COLUMN "role" TYPE "ProjectRole_next"
  USING (CASE WHEN "role"::text = 'ADMIN' THEN 'MANAGER' ELSE "role"::text END)::"ProjectRole_next";

ALTER TABLE "ProjectFile"
  ALTER COLUMN "allowedRoles" TYPE "ProjectRole_next"[]
  USING "map_project_role_array"("allowedRoles");

DROP FUNCTION "map_project_role_array"("ProjectRole"[]);

DROP TYPE "ProjectRole";
ALTER TYPE "ProjectRole_next" RENAME TO "ProjectRole";

ALTER TABLE "ProjectMember" ALTER COLUMN "role" SET DEFAULT 'VIEWER';
ALTER TABLE "ProjectFile" ALTER COLUMN "allowedRoles" SET DEFAULT ARRAY['MANAGER']::"ProjectRole"[];
