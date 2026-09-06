import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { writeActivity } from "../src/auth/audit.js";
import { hashPassword } from "../src/auth/password.js";
import { createPrismaClient, validateDatabaseUrl, type HawellyPrismaClient } from "../src/db/prisma.js";
import {
  ActivityOutcome,
  ActivitySource,
  Prisma,
  Role,
  StaffOperationalStatus,
  UserStatus
} from "../src/generated/prisma/client.js";

const bootstrapInputSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  email: z.email().max(320).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12).max(128)
}).strict();

export type BootstrapAdminInput = z.infer<typeof bootstrapInputSchema>;

export class AdminBootstrapRefused extends Error {}

export async function bootstrapFirstAdmin(
  database: HawellyPrismaClient,
  rawInput: BootstrapAdminInput,
  now = new Date()
) {
  const input = bootstrapInputSchema.parse(rawInput);
  const passwordHash = await hashPassword(input.password);
  try {
    return await database.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT 1 AS "acquired"
        FROM pg_advisory_xact_lock(
          hashtextextended(${"hawelly:first-admin-bootstrap"}, 0)
        )
      `;
      if (await transaction.user.count({ where: { role: Role.ADMIN } })) {
        throw new AdminBootstrapRefused(
          "An administrator already exists; use authenticated administration instead"
        );
      }
      const administrator = await transaction.user.create({
        data: {
          fullName: input.fullName,
          email: input.email,
          passwordHash,
          role: Role.ADMIN,
          status: UserStatus.ACTIVE,
          passwordChangedAt: now,
          staffProfile: {
            create: {
              displayName: input.fullName,
              operationalStatus: StaffOperationalStatus.ACTIVE
            }
          }
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          status: true
        }
      });
      await writeActivity(transaction, {
        source: ActivitySource.SYSTEM,
        requestId: randomUUID(),
        actionType: "ADMIN_BOOTSTRAPPED",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "User",
        entityId: administrator.id,
        nextState: {
          role: administrator.role,
          status: administrator.status,
          operationalStatus: StaffOperationalStatus.ACTIVE
        },
        reason: "Initial administrator bootstrap",
        metadata: {}
      });
      return administrator;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 30_000
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AdminBootstrapRefused(
        "The administrator account could not be created"
      );
    }
    throw error;
  }
}

function hiddenQuestion(prompt: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    throw new AdminBootstrapRefused(
      "Administrator bootstrap requires an interactive terminal"
    );
  }
  stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\r" || character === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u0003") {
          cleanup();
          stdout.write("\n");
          reject(new AdminBootstrapRefused("Administrator bootstrap cancelled"));
          return;
        }
        if (character === "\b" || character === "\u007f") {
          value = Array.from(value).slice(0, -1).join("");
        } else if (character >= " ") {
          value += character;
        }
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function promptForAdministrator(): Promise<BootstrapAdminInput> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new AdminBootstrapRefused(
      "Administrator bootstrap requires an interactive terminal"
    );
  }
  const questions = createInterface({ input: stdin, output: stdout });
  const fullName = (await questions.question("Administrator full name: ")).trim();
  const email = (await questions.question("Administrator email: ")).trim();
  questions.close();
  const password = await hiddenQuestion("Password (12–128 characters): ");
  const confirmation = await hiddenQuestion("Confirm password: ");
  if (password !== confirmation) {
    throw new AdminBootstrapRefused("Passwords did not match");
  }
  return bootstrapInputSchema.parse({ fullName, email, password });
}

async function run() {
  if (process.argv.length !== 2) {
    throw new AdminBootstrapRefused(
      "Administrator bootstrap does not accept command-line arguments"
    );
  }
  const database = createPrismaClient(validateDatabaseUrl(process.env.DATABASE_URL));
  try {
    const administrator = await bootstrapFirstAdmin(
      database,
      await promptForAdministrator()
    );
    console.log(`Administrator created for ${administrator.email}.`);
  } finally {
    await database.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    const message =
      error instanceof AdminBootstrapRefused || error instanceof z.ZodError
        ? error.message
        : "Administrator bootstrap failed";
    console.error(`admin-bootstrap: ${message}`);
    process.exitCode = 1;
  });
}
