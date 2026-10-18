/**
 * 全局配置。
 *
 * 所有配置都可以用环境变量覆盖，但默认值保证 `npm start` 在没有任何
 * 额外配置的情况下也能跑起来。
 *
 * 优先级：命令行环境变量 > backend/.env 文件 > 下面的默认值。
 * 这里用 Node 内置的 process.loadEnvFile()，不需要装 dotenv。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const envFile = path.resolve(import.meta.dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* .env 格式有问题就忽略，退回默认值 */
  }
}

export const config = {
  /** HTTP 端口 */
  port: Number(process.env.PORT || 3000),

  /** 数据库驱动：'pg'（连真 PostgreSQL 服务器）或 'pglite'（零安装的 WASM 版） */
  dbDriver: process.env.PPSD_DB_DRIVER || 'pg',

  /**
   * 驱动 = pglite 时数据库文件的存放目录。
   *
   * ⚠️ 默认放用户目录而不是项目目录：PGlite 的 Node 文件系统适配器在本机
   * E: 盘会报 ErrnoError(28)，写 C: 盘正常。这是工具限制，不是配置错误。
   * 数据库内容随时能用 `npm run db:reset` 从 ../data 重新灌出来。
   */
  pgliteDir:
    process.env.PGLITE_DIR ||
    path.join(os.homedir(), 'AppData', 'Local', 'ppsd', 'pgdata'),

  /** 驱动 = pg 时使用的连接串 */
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/ppsd',

  /**
   * BLAST 引擎配置。
   *
   * dir/bin/dbDir 留空时由 blast/ncbi.js 按平台自动探测：
   *   服务器：/home/www/html/PPSD_zby/blast
   *   本地：  data/reference/PPSD_zby/blast
   * engine：auto（有 NCBI 就用 NCBI，否则 JS）/ ncbi / js
   */
  blast: {
    dir: process.env.PPSD_BLAST_DIR || '',
    bin: process.env.PPSD_BLAST_BIN || '',
    dbDir: process.env.PPSD_BLAST_DB_DIR || '',
    engine: (process.env.PPSD_BLAST_ENGINE || 'auto').toLowerCase(),
    timeoutMs: Number(process.env.PPSD_BLAST_TIMEOUT_MS || 30000),
  },

  /**
   * 老站 tplot 图片目录。
   * 不填时自动探测：服务器 /home/www/html/PPSD_zby/tplot，
   * 本地 data/reference/PPSD_zby/tplot。图片不拷进 dist，只做静态托管。
   */
  tplotDir: process.env.PPSD_TPOT_DIR || '',
};

/**
 * 项目里数据文件的位置。
 * 本文件在 backend/src/config.js，所以上两级就是项目根 PPSD/。
 */
export const paths = {
  backendDir: path.resolve(import.meta.dirname, '..'),
  repoRoot: path.resolve(import.meta.dirname, '..', '..'),
  dataDir: path.resolve(import.meta.dirname, '..', '..', 'data'),
  schemaSql: path.resolve(import.meta.dirname, 'db', 'schema.sql'),
};
