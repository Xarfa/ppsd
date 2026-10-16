/**
 * 数据库连接层 —— 对上层（routes/）只暴露一个统一的 query() 接口。
 *
 * 支持的两种驱动：
 *
 *   1. pglite —— PostgreSQL 编译成 WebAssembly 的版本，npm 装完即用，零安装。
 *      适合本机没装 PostgreSQL 的情况（当前就是这种）。
 *      注意：它是个真 PostgreSQL（18.x），不是模拟器，SQL 语义完全一致。
 *
 *   2. pg    —— 标准的 node-postgres 驱动，连真正的 PostgreSQL 服务器。
 *      学校那台 Linux 服务器上就是这种，将来部署时把 PPSD_DB_DRIVER 改成 pg、
 *      填好 DATABASE_URL 就行 —— routes/ 里的代码一行都不用动。
 *
 * 之所以要做这层抽象：本地开发和服务器部署用的是不同的数据库接入方式，
 * 但业务 SQL 是一样的。把差异关在这一个文件里，将来换环境只改配置。
 */
import { config } from '../config.js';
import fs from 'node:fs';
import path from 'node:path';

let handle = null; // 底层驱动实例
let driverName = null;

/** 第一次调用时建立连接，之后复用 */
async function getHandle() {
  if (handle) return handle;

  if (config.dbDriver === 'pg') {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: config.databaseUrl });
    handle = {
      kind: 'pg',
      query: (sql, params) => pool.query(sql, params),
      exec: (sql) => pool.query(sql),
      close: () => pool.end(),
    };
    driverName = 'pg (node-postgres)';
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    // PGlite 不会自动创建多级父目录，父目录不存在会直接 ENOENT
    fs.mkdirSync(path.dirname(config.pgliteDir), { recursive: true });
    const db = await PGlite.create({ dataDir: config.pgliteDir });
    handle = {
      kind: 'pglite',
      query: (sql, params) => db.query(sql, params),
      exec: (sql) => db.exec(sql),
      close: () => db.close(),
    };
    driverName = 'pglite (PostgreSQL/WASM)';
  }
  return handle;
}

/** 统一查询入口：返回 { rows } */
export async function query(sql, params = []) {
  const h = await getHandle();
  const res = await h.query(sql, params);
  return { rows: res.rows ?? [] };
}

/** 执行多语句 SQL（建表脚本用） */
export async function exec(sql) {
  const h = await getHandle();
  await h.exec(sql);
}

export async function closeDb() {
  if (handle) {
    await handle.close();
    handle = null;
  }
}

export async function getDriverName() {
  await getHandle();
  return driverName;
}

/** 实际连的数据库版本号，健康检查用 */
export async function getServerVersion() {
  const { rows } = await query('select version() as v');
  return rows[0]?.v || 'unknown';
}
