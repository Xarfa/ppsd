# PPSD 后端

Node.js + Express + PostgreSQL。给前端提供 REST 风格接口。

## 启动

```bash
npm install
npm run db:load     # 首次：建表 + 灌数据（约 35 秒 / 54 万行）
npm start           # 生产模式 → http://localhost:3000
npm run dev         # 开发模式，改代码自动重启
npm run db:reset    # 清库重灌
```

## 配置

配置优先级：命令行环境变量 > `.env` 文件 > 代码里的默认值。
把 `.env.example` 复制成 `.env` 再改。

| 变量 | 说明 | 默认值 |
|---|---|---|
| `PPSD_DB_DRIVER` | 数据库驱动：`pg` 或 `pglite` | `pg` |
| `DATABASE_URL` | `pg` 驱动的连接串 | `postgres://postgres@127.0.0.1:5432/ppsd` |
| `PGLITE_DIR` | `pglite` 驱动的数据目录 | `%LOCALAPPDATA%\ppsd\pgdata` |
| `PORT` | HTTP 端口 | `3000` |

### 两种驱动

这是这个后端里最值得看的一个设计决策。

| 驱动 | 适用场景 | 说明 |
|---|---|---|
| `pg` | 有 PostgreSQL 服务器时 | 标准的 node-postgres 驱动。**实验室服务器上就用这个** |
| `pglite` | 本机没装 PostgreSQL 时 | 把 PostgreSQL 编译成 WebAssembly（真 PostgreSQL 18，不是模拟器），npm 装完即用 |

两者在 `src/db/index.js` 里被抽象成同一个 `query(sql, params)` 接口，
所以 **`routes/` 里的业务代码完全不关心底层是哪个驱动**。
从本地开发切到服务器部署，只改 `.env` 里一行配置。

> ⚠️ PGlite 的 Node 文件系统适配器在本机 **E: 盘会报 `ErrnoError(28)`**，
> 写 C: 盘正常。所以 `PGLITE_DIR` 默认放在用户目录下，不要指向 E 盘。

## 目录结构

```
backend/
├── .env / .env.example      配置
├── src/
│   ├── server.js            Express 入口，挂载路由 + 统一错误处理
│   ├── config.js            配置读取（用 Node 内置 process.loadEnvFile，不依赖 dotenv）
│   ├── db/
│   │   ├── index.js         ⭐ 数据库驱动抽象层
│   │   ├── schema.sql       建表脚本
│   │   └── load.js          数据导入脚本
│   └── routes/
│       ├── species.js       /api/species、/api/stats
│       ├── loci.js          /api/loci*（浏览 + 详情 + 子表）
│       ├── phasi-rna.js     /api/phasi-rna/:id
│       └── search.js        /api/search、/api/search/region
└── scripts/probe-pglite.mjs 排查 PGlite 磁盘路径问题的小工具
```

## 接口

| 方法 | 路径 | 参数 | 说明 |
|---|---|---|---|
| GET | `/api/health` | — | 返回驱动名、数据库版本、clusters 行数 |
| GET | `/api/species` | — | 8 个物种 + loci / phasiRNA / 验证情况统计 |
| GET | `/api/stats` | — | 首页统计数字 + 各物种分布（给图表用） |
| GET | `/api/loci` | `species` `q` `sort` `order` `page` `pageSize` | PHAS loci 分页列表 |
| GET | `/api/loci/:id` | — | 单 locus 完整信息（含核酸序列） |
| GET | `/api/loci/:id/phasi-rna` | `page` `pageSize` | 该 locus 产生的 phasiRNA |
| GET | `/api/loci/:id/initiators` | — | 该 locus 的 phase initiator |
| GET | `/api/phasi-rna/:id` | — | 单条 phasiRNA + 全部降解组验证靶基因 |
| GET | `/api/search` | `type` `q` `species` `limit` | 综合搜索 |
| GET | `/api/search/region` | `species` `chrom` `start` `end` | 基因组区间搜索 |

`/api/loci` 的 `sort` 只接受白名单里的字段（见 `routes/loci.js` 的 `SORTABLE`）——
`ORDER BY` 不能用参数占位符，只能白名单校验后拼接字符串，这是防 SQL 注入的标准做法。

## 数据模型

6 张表。列定义来自原站官方导出数据的**真实表头**，完整数据字典见
[`../data/README.md`](../data/README.md)。

```
species ──┬─< clusters ──< phas_seq
          │       └────< phasi_rna ──< phasi_rna_target
          └─< phasi_rna
                   initiator (species + phas_gene)
```

| 表 | 行数 | 说明 |
|---|---|---|
| `species` | 8 | 物种维表 |
| `clusters` | 7,760 | PHAS loci（原库 clusters 表） |
| `phas_seq` | 7,760 | PHAS locus 核酸序列（原库 PHAS 表） |
| `phasi_rna` | 104,166 | phasiRNA 主表 |
| `phasi_rna_target` | 465,863 | 降解组验证靶基因（原库 PTI 表拆出的一半） |
| `initiator` | 11,786 | phase initiator（触发 miRNA） |

> **为什么把 PTI 拆成两张表**：原站导出是「一条 phasiRNA × 一条靶基因」拉平成的宽表，
> 水稻 50508 条 phasiRNA 摊成了 41 万行，大量重复。
> 拆开后「一条 phasiRNA 有多个靶基因」这层关系变成显式的，也省了存储。

## 数据导入脚本做了什么

`src/db/load.js`：

1. 读 `../data/derived/pha_loci_all_species.tsv` → `clusters`（8 物种）
2. 读 `../data/derived/phas_locus_seq_all_species.fa` → `phas_seq`
3. 其余 6 个物种从 `../data/derived/phasi_rna_seq_all_species.tsv` → `phasi_rna`
4. 水稻、大豆从 `../data/raw/*_database_phasiRNA.txt` → `phasi_rna` + `phasi_rna_target`
   （这两物种用官方文件，信息最全；官方文件是扁平宽表，导入时按 phasiRNA 去重）
5. `../data/raw/*_database_initiator.txt` → `initiator`
6. 回填 `species` 表的统计数字

**两个容易踩的坑**（脚本里都处理了）：

- **Strand 列的 `-` 表示负链，不是空值。** 通用的空值清洗函数会把它误清成 `NULL`
  （影响 22.6 万行）。所以 strand 用了专门的 `strandOf()` 处理。
- **`species` 维表必须先插入**，因为 `clusters.species` 有外键指向它。
  脚本里先插占位行，最后回填统计数字。

## 待办

- [ ] `initiator` 表目前只有水稻、大豆有数据（官网未发布其他物种）
- [ ] 增加 Blast 接口（需要本地部署 `blast+`）
- [ ] 上线前把错误处理收敛，不要直接把 SQL 报错返回给客户端
- [ ] 上线前把 PostgreSQL 认证从 `trust` 改成 `scram-sha-256`
- [ ] 上线前把监听地址收窄到 127.0.0.1（现在 `app.listen(port)` 默认监听 `0.0.0.0`，
      同一局域网内其他机器也能访问接口。demo 阶段这样反而方便 ——
      可以直接用手机连 `http://<你的IP>:3000` 看效果，正式部署必须改掉）
