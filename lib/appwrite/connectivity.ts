export type ConnectivityCheckMode = "metadata-only" | "disposable-write";

export function parseConnectivityCheckArguments(argumentsList: string[]): ConnectivityCheckMode {
  const allowed = new Set(["--apply", "--confirm-disposable-check"]);
  const unknown = argumentsList.find((argument) => !allowed.has(argument));
  if (unknown) throw new Error(`Unknown connectivity-check argument: ${unknown}`);

  const apply = argumentsList.includes("--apply");
  const confirmed = argumentsList.includes("--confirm-disposable-check");
  if (apply !== confirmed) {
    throw new Error("Disposable mode requires both --apply and --confirm-disposable-check.");
  }
  return apply ? "disposable-write" : "metadata-only";
}

export interface DisposableCategoryRows {
  createRow(input: { rowId: string; data: Record<string, unknown>; permissions: string[] }): Promise<Record<string, unknown>>;
  getRow(input: { rowId: string }): Promise<Record<string, unknown>>;
  updateRow(input: { rowId: string; data: Record<string, unknown>; permissions: string[] }): Promise<Record<string, unknown>>;
  deleteRow(input: { rowId: string }): Promise<unknown>;
}

export async function runDisposableCategoryLifecycle(input: {
  rows: DisposableCategoryRows;
  rowId: string;
  now: () => string;
  isNotFound: (error: unknown) => boolean;
}) {
  let created = false;
  let deleted = false;
  try {
    const createdRow = await input.rows.createRow({
      rowId: input.rowId,
      data: {
        name: "MIGRATION-DISPOSABLE-DO-NOT-USE",
        slug: input.rowId,
        updatedAt: input.now()
      },
      permissions: []
    });
    created = true;
    if (createdRow.$id !== input.rowId) throw new Error("Disposable row creation could not be verified.");

    const readRow = await input.rows.getRow({ rowId: input.rowId });
    if (readRow.$id !== input.rowId || readRow.name !== "MIGRATION-DISPOSABLE-DO-NOT-USE") {
      throw new Error("Disposable row read could not be verified.");
    }

    const updatedRow = await input.rows.updateRow({
      rowId: input.rowId,
      data: { name: "MIGRATION-DISPOSABLE-DO-NOT-USE-UPDATED", updatedAt: input.now() },
      permissions: []
    });
    if (updatedRow.name !== "MIGRATION-DISPOSABLE-DO-NOT-USE-UPDATED") {
      throw new Error("Disposable row update could not be verified.");
    }

    await input.rows.deleteRow({ rowId: input.rowId });
    deleted = true;
    try {
      await input.rows.getRow({ rowId: input.rowId });
      throw new Error("Disposable row still exists after deletion.");
    } catch (error) {
      if (!input.isNotFound(error)) throw error;
    }
    return { created: true, read: true, updated: true, deleted: true, cleanupVerified: true };
  } finally {
    if (created && !deleted) await input.rows.deleteRow({ rowId: input.rowId });
  }
}
