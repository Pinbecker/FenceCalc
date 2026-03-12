import { randomUUID } from "node:crypto";
import type { CompanyRecord, CompanyUserRecord } from "@fence-estimator/contracts";

import { hashPassword } from "../auth.js";
import { writeAuditLog } from "../auditLogSupport.js";
import type { AppConfig } from "../config.js";
import type { AppRepository } from "../repository.js";

interface BootstrapAccount {
  company: CompanyRecord;
  user: CompanyUserRecord;
}

interface BootstrapOwnerInput {
  companyName: string;
  displayName: string;
  email: string;
  password: string;
}

export type BootstrapOwnerResult =
  | { kind: "success"; account: BootstrapAccount; createdAtIso: string }
  | { kind: "forbidden" }
  | { kind: "conflict" };

export function isBootstrapSecretValid(config: AppConfig, providedSecret: string): boolean {
  if (!config.bootstrapOwnerSecret) {
    return true;
  }

  return providedSecret === config.bootstrapOwnerSecret;
}

export async function bootstrapOwnerAccount(
  repository: AppRepository,
  config: AppConfig,
  input: BootstrapOwnerInput,
  providedSecret: string,
): Promise<BootstrapOwnerResult> {
  if (!isBootstrapSecretValid(config, providedSecret)) {
    return { kind: "forbidden" };
  }

  const createdAtIso = new Date().toISOString();
  const password = hashPassword(input.password);
  const account = await repository.bootstrapOwnerAccount({
    companyId: randomUUID(),
    companyName: input.companyName,
    userId: randomUUID(),
    displayName: input.displayName,
    email: input.email,
    passwordHash: password.hash,
    passwordSalt: password.salt,
    createdAtIso
  });
  if (!account) {
    return { kind: "conflict" };
  }

  await writeAuditLog(repository, {
    companyId: account.company.id,
    actorUserId: account.user.id,
    entityType: "AUTH",
    entityId: account.user.id,
    action: "OWNER_BOOTSTRAPPED",
    summary: `Bootstrapped owner ${account.user.displayName}`,
    createdAtIso,
    metadata: { email: account.user.email }
  });

  return {
    kind: "success",
    account,
    createdAtIso
  };
}
