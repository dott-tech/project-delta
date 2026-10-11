import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../db.js';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

async function main() {
  if (!email || !name || !password) {
    throw new Error('Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, and BOOTSTRAP_ADMIN_PASSWORD before running this command.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120) {
    throw new Error('Provide a valid admin email and a name up to 120 characters.');
  }
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Admin password must be at least 12 characters and no more than 72 UTF-8 bytes.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    // Serialize bootstrap attempts so two deploy processes cannot create competing first admins.
    await tx.$queryRaw`WITH bootstrap_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(807241936)
    )
    SELECT TRUE AS locked FROM bootstrap_lock`;
    const existingAdmin = await tx.user.findFirst({ where: { role: Role.ADMIN }, select: { id: true } });
    if (existingAdmin) throw new Error('An administrator already exists; bootstrap is disabled.');
    await tx.user.create({ data: { email, name, password: passwordHash, role: Role.ADMIN } });
  }, { maxWait: 30_000, timeout: 30_000 });

  console.log(`Created the first administrator account for ${email}. Remove the bootstrap environment values now.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Failed to create administrator.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
