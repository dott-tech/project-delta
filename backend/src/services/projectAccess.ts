import { ProjectMember, ProjectRole } from '@prisma/client';
import { prisma } from '../db.js';

// Upper bound on tree depth so a cyclic parent link can never loop forever.
const MAX_TREE_DEPTH = 64;

/**
 * Returns the user's membership on the project or on its nearest ancestor.
 * A membership on a parent project grants the same role to its nested
 * packages unless the user has a direct assignment closer to the package.
 * Runs as a single query instead of two queries per tree level.
 */
export const findEffectiveMembership = async (
  projectId: string,
  userId: string,
): Promise<ProjectMember | null> => {
  if (!projectId || !userId) return null;
  const rows = await prisma.$queryRaw<ProjectMember[]>`
    WITH RECURSIVE chain AS (
      SELECT "id", "parentProjectId", 0 AS depth FROM "Project" WHERE "id" = ${projectId}
      UNION ALL
      SELECT p."id", p."parentProjectId", c.depth + 1
      FROM "Project" p
      JOIN chain c ON p."id" = c."parentProjectId"
      WHERE c.depth < ${MAX_TREE_DEPTH}
    )
    SELECT m."id", m."projectId", m."userId", m."role"::text AS "role", m."createdAt"
    FROM chain c
    JOIN "ProjectMember" m ON m."projectId" = c."id" AND m."userId" = ${userId}
    ORDER BY c.depth ASC
    LIMIT 1
  `;
  return rows[0] ?? null;
};

export const getEffectiveProjectRole = async (
  projectId: string,
  userId: string,
): Promise<ProjectRole | null> => (await findEffectiveMembership(projectId, userId))?.role ?? null;

/** Returns the project's ID plus the IDs of all of its descendants. */
export const getProjectSubtreeIds = async (rootId: string): Promise<string[]> => {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE tree AS (
      SELECT "id", 0 AS depth FROM "Project" WHERE "id" = ${rootId}
      UNION ALL
      SELECT p."id", t.depth + 1
      FROM "Project" p
      JOIN tree t ON p."parentProjectId" = t."id"
      WHERE t.depth < ${MAX_TREE_DEPTH}
    )
    SELECT DISTINCT "id" FROM tree
  `;
  return rows.map((row) => row.id);
};
