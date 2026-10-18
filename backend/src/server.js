/**
 * PPSD 后端服务入口。
 *
 * 启动：npm start        （开发时用 npm run dev，改代码自动重启）
 * 默认监听 3000 端口，前端 Vite 跑在 5173，通过 CORS 直连。
 *
 * 已实现的接口一览（全部以 /api 开头）：
 *   GET /api/health                              健康检查 + 数据库版本
 *   GET /api/species                             8 个物种及数据量
 *   GET /api/stats                               首页统计数字与各物种分布
 *   GET /api/loci?species=&q=&sort=&order=&page=&pageSize=
 *   GET /api/loci/:id                            单 locus 详情（含序列）
 *   GET /api/loci/:id/phasi-rna                  该 locus 的 phasiRNA 列表
 *   GET /api/loci/:id/initiators                 该 locus 的 phase initiator
 *   GET /api/phasi-rna/:id                       单条 phasiRNA + 靶基因
 *   GET /api/search?type=&q=&species=            综合搜索
 *   GET /api/search/region?species=&chrom=&start=&end=   基因组区间搜索
 */
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from './config.js';
import { getDriverName, getServerVersion, query } from './db/index.js';
import { speciesRouter } from './routes/species.js';
import { lociRouter } from './routes/loci.js';
import { phasiRnaRouter } from './routes/phasi-rna.js';
import { searchRouter } from './routes/search.js';
import { downloadsRouter } from './routes/downloads.js';
import { blastRouter } from './routes/blast.js';
import { treeRouter } from './routes/tree.js';
import { atlasRouter } from './routes/atlas.js';

const app = express();
app.use(cors());
app.use(express.json());

/* 静态托管前端构建产物（dist/ 存在时）—— 分享包/服务器部署都是单进程：
   node src/server.js 同时提供 API 和页面。

   前端是按 base=/PPSD_new/ 构建的（服务器子路径部署），页面里的资源引用
   都带这个前缀。这里把 dist 挂两遍，两套访问方式共用一份产物：
     · /PPSD_new/...  直连端口时用（内网直接访问 :3618、ssh 隧道转发到本地）
     · /...           Apache 反代时用 —— ProxyPass 会把 /PPSD_new 前缀剥掉再转过来 */
const distDir = path.resolve(paths.backendDir, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use('/PPSD_new', express.static(distDir));
  app.use(express.static(distDir));
}

/* API 路由挂两组前缀，配合上面静态托管的两种路径，同一份代码两种部署都能跑：
     · /api/...            Apache 反代部署（ProxyPass 已把 /PPSD_new 剥掉）
     · /PPSD_new/api/...   直连端口部署（前端 base=/PPSD_new/，请求自带前缀） */
const API_PREFIXES = ['/api', '/PPSD_new/api'];

async function healthHandler(_req, res, next) {
  try {
    const version = await getServerVersion();
    const { rows } = await query('SELECT count(*)::int AS n FROM clusters');
    res.json({
      ok: true,
      driver: await getDriverName(),
      database: version,
      clusters: rows[0].n,
    });
  } catch (e) {
    next(e);
  }
}

for (const prefix of API_PREFIXES) {
  app.get(`${prefix}/health`, healthHandler);
  app.use(prefix, speciesRouter);
  app.use(prefix, atlasRouter);
  app.use(prefix, lociRouter);
  app.use(prefix, phasiRnaRouter);
  app.use(prefix, searchRouter);
  app.use(prefix, downloadsRouter);
  app.use(prefix, blastRouter);
  app.use(prefix, treeRouter);
}

// 统一的错误处理：把 SQL 报错原样返回，方便调试（上线前应该收敛）
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

// SPA 兜底：非 API 的路径全部回 index.html（vue-router history 模式）
app.get(/^\/(?!api|PPSD_new\/api).*/, (_req, res) => {
  const index = path.join(distDir, 'index.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.status(404).send('dist/ not built — run `npm run build` first');
});

app.listen(config.port, async () => {
  console.log(`PPSD backend 已启动: http://localhost:${config.port}`);
  try {
    console.log(`  数据库驱动: ${await getDriverName()}`);
    console.log(`  数据库版本: ${await getServerVersion()}`);
  } catch (e) {
    console.warn(`  ⚠ 数据库未就绪: ${e.message}`);
    console.warn(`    先执行 npm run db:load 灌数据`);
  }
});
