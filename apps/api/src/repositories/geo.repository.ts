// The only module allowed to run raw SQL (PostGIS). See CLAUDE.md.
import type { PrismaClient } from '../db.js';

/** Returns the installed PostGIS version; throws if the DB is unreachable or PostGIS is missing. */
export async function getPostgisVersion(prisma: PrismaClient): Promise<string> {
  const rows = await prisma.$queryRaw<{ version: string }[]>`SELECT PostGIS_Version() AS version`;
  const version = rows[0]?.version;
  if (!version) throw new Error('PostGIS_Version() returned no rows');
  return version;
}
