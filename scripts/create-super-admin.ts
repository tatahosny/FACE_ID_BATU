import { db } from "../src/db";
import { users } from "../src/db/schema";
import { hashPassword } from "../src/lib/security/auth";
import { eq } from "drizzle-orm";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const email = process.argv[2] || process.env.SUPER_ADMIN_INITIAL_EMAIL || "admin@batu.edu.eg";
  const password = process.argv[3] || process.env.SUPER_ADMIN_INITIAL_PASSWORD || "BatuAdmin@2026#Secure";
  const fullName = process.argv[4] || "مدير النظام العام";

  if (!email || !password) {
    console.error("Usage: tsx scripts/create-super-admin.ts <email> <password> [fullName]");
    process.exit(1);
  }

  console.log(`🔒 Bootstrapping Super Admin for: ${email}`);

  const [existing] = await db.select().from(users).where(eq(users.email, email));

  if (existing) {
    const passwordHash = await hashPassword(password);
    await db
      .update(users)
      .set({
        passwordHash,
        role: "SUPER_ADMIN",
        fullName,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    console.log(`✅ Super Admin account updated: ${email}`);
  } else {
    const passwordHash = await hashPassword(password);
    await db.insert(users).values({
      email,
      passwordHash,
      fullName,
      role: "SUPER_ADMIN",
      isActive: true,
    });
    console.log(`✅ Super Admin created successfully: ${email}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Failed to create super admin:", err);
  process.exit(1);
});
