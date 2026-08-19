import type Database from 'better-sqlite3';
import { openSqliteConnection } from './db.js';

/** Owns the process-wide SQLite connection and allows it to be replaced in place. */
export class ConnectionHolder {
  private connection: Database.Database | undefined;
  private currentGeneration = 0;

  open(path: string): Database.Database {
    if (this.connection !== undefined) {
      throw new Error('数据库连接已打开；请使用 swap() 切换连接');
    }
    const connection = openSqliteConnection(path);
    this.connection = connection;
    this.currentGeneration += 1;
    return connection;
  }

  current(): Database.Database {
    if (this.connection === undefined) {
      throw new Error('数据库连接尚未打开');
    }
    return this.connection;
  }

  generation(): number {
    return this.currentGeneration;
  }

  close(): void {
    const connection = this.connection;
    if (connection === undefined) return;
    this.connection = undefined;
    connection.close();
  }

  swap(newPath: string): Database.Database {
    this.close();
    return this.open(newPath);
  }
}
