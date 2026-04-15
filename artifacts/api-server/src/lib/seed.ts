import { createHash } from "crypto";
import { db, venues, roles, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const SALT = "enosh2024";
function hashPin(pin: string) {
  return createHash("sha256").update(pin + SALT).digest("hex");
}

export async function seedIfEmpty() {
  try {
    const existing = await db.select().from(venues).where(eq(venues.id, "venue-enosh"));
    if (existing.length > 0) return;

    logger.info("Seeding database with initial data...");

    await db.insert(venues).values({
      id: "venue-enosh",
      name: "ENISH",
      address: "5851 Westheimer Rd, Houston, TX 77057",
      timezone: "America/Chicago",
      subscriptionTier: "pro",
      isActive: true,
    });

    await db.insert(roles).values([
      {
        id: "role-manager",
        venueId: "venue-enosh",
        name: "Manager",
        permissions: { all: true },
        color: "#C9A84B",
      },
      {
        id: "role-server",
        venueId: "venue-enosh",
        name: "Server",
        permissions: { schedule: true, timeclock: true },
        color: "#8BA888",
      },
      {
        id: "role-bartender",
        venueId: "venue-enosh",
        name: "Bartender",
        permissions: { schedule: true, timeclock: true },
        color: "#B5763A",
      },
      {
        id: "role-host",
        venueId: "venue-enosh",
        name: "Host",
        permissions: { reservations: true, timeclock: true },
        color: "#9B7BB5",
      },
    ]);

    await db.insert(users).values([
      {
        id: "user-liffort",
        venueId: "venue-enosh",
        fullName: "Liffort Hobley",
        email: "liffort@enosh.com",
        roleId: "role-manager",
        isAdmin: true,
        isActive: true,
        hireDate: "2022-01-01",
        hourlyRate: "25.00",
        pinHash: hashPin("2445"),
      },
      {
        id: "user-faith",
        venueId: "venue-enosh",
        fullName: "Faith Farrell",
        email: "faith@enosh.com",
        roleId: "role-manager",
        isAdmin: true,
        isActive: true,
        hireDate: "2022-03-15",
        hourlyRate: "22.00",
        pinHash: hashPin("3619"),
      },
    ]);

    logger.info("Database seeded successfully");
  } catch (err) {
    logger.error({ err }, "Seed failed");
  }
}
