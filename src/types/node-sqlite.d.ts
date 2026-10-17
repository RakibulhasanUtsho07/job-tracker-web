declare module "node:sqlite" {
  type SQLInputValue = string | number | bigint | Uint8Array | null;

  interface StatementResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  interface StatementSync {
    run(...values: SQLInputValue[]): StatementResult;
    get(...values: SQLInputValue[]): Record<string, unknown> | undefined;
    all(...values: SQLInputValue[]): Record<string, unknown>[];
  }

  class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }

  export { DatabaseSync, StatementSync, StatementResult };
}
