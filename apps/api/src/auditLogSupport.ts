import { randomUUID } from "node:crypto";

import type { AppRepository, CreateAuditLogInput } from "./repository.js";

export async function writeAuditLog(
  repository: AppRepository,
  input: Omit<CreateAuditLogInput, "id">,
): Promise<void> {
  await repository.addAuditLog({
    id: randomUUID(),
    ...input
  });
}
