import { assertDatasetWrite } from '@/lib/dataset-write';

/** Never logs SQL or parameters. Drizzle calls this immediately before execution. */
export function writeAdmission(authorize?: () => void) {
  const check = (statement: string) => {
    if (authorize) authorize();
    // Only SELECT is presumed read-only. Unknown SQL, WITH and PRAGMA are not
    // a bypass. Our raw connection is guarded before native preparation too.
    else if (!/^\s*select\b/i.test(statement) || statement.includes(';')) assertDatasetWrite();
  };
  return { logQuery: check };
}

/** Required synchronous connection surface; no prepare/$client escape. */
export type SqlConnection = {
  execSync(sql: string): void;
  getAllSync<T>(sql: string): T[];
  getFirstSync<T>(sql: string): T | null;
  withTransactionSync(task: () => void): void;
};

/** Installed Expo Drizzle uses only prepareSync. Guard before preparation as
 * well: SQLite can apply some PRAGMAs while compiling, before the logger runs.
 * No native handles are forwarded through this private driver adapter. */
export function admittedDriver<T extends { prepareSync(statement: string): unknown }>(
  connection: T,
  authorize?: () => void,
): T {
  const admission = writeAdmission(authorize);
  return {
    prepareSync(statement: string) {
      admission.logQuery(statement);
      return connection.prepareSync(statement);
    },
  } as T;
}

export function admittedConnection<T extends SqlConnection>(connection: T, authorize?: () => void): T {
  const admission = writeAdmission(authorize);
  const facade: SqlConnection = {
    execSync(statement) {
      // execSync accepts a batch; a SELECT prefix cannot establish read-only.
      if (authorize) authorize();
      else assertDatasetWrite();
      connection.execSync(statement);
    },
    getAllSync<R>(statement: string): R[] {
      admission.logQuery(statement);
      return connection.getAllSync<R>(statement);
    },
    getFirstSync<R>(statement: string): R | null {
      admission.logQuery(statement);
      return connection.getFirstSync<R>(statement);
    },
    withTransactionSync(task) {
      admission.logQuery('BEGIN');
      connection.withTransactionSync(task);
    },
  };
  if ('databasePath' in connection) {
    Object.defineProperty(facade, 'databasePath', { get: () => connection.databasePath });
  }
  return facade as T;
}

/** Drizzle's public native client must not reopen an unrestricted write path. */
export function restrictDatabaseClient<T extends object, C extends SqlConnection>(database: T, connection: C) {
  Object.defineProperty(database, '$client', { value: connection });
  return database;
}
