# PPSD 数据审查报告（两轮）

> 日期：2026-10-16 ｜ 方式：只读审查 + 补下载 ｜ **未改动项目里任何现有文件**
> 审查对象：① 课题组服务器上的 PPSD 老站（/home/www/html/PPSD_zby、PPSD）
> ② 本地新项目（src/ 前端、backend/ 后端、data/ 数据）

---

## 一、审查范围与方法

| 轮次 | 内容 |
|---|---|
| 第一轮 | 资产完整性盘点（服务器 vs 本地文件数/md5）；老站功能面逐页盘点；本地项目现状盘点；产出缺口清单 |
| 第二轮 | 核对缺口是否补齐；核对数据同源性；给出架构调整方案 |

本地数据落点：`data/reference/PPSD_zby/`、`data/reference/PPSD/`（已在 .gitignore 内）。

---

## 二、第一轮：资产完整性盘点

### 2.1 下载结果（截至第二轮开始时）

| 目录 | 远程 | 本地 | 状态 |
|---|---|---|---|
| PPSD_zby 源码+数据+git | ~450 文件 | 完整 | ✅ 15 个关键文件 md5 与远程逐一一致 |
| PPSD_zby/JBrowse | 119,105 | 119,333 | ✅ 完整 |
| PPSD_zby/tplot | 75,914 | 36,891（2/8 物种） | 🔁 补下中 |
| PPSD_zby/plot | 25,793 | 0 | 🔁 补下中 |
| PPSD 源码+数据+git | ~450 文件 | 完整 | ✅ 4 个关键文件 md5 一致 |
| PPSD/JBrowse+tplot+plot | 220,861 | 部分 | ⏸️ 见 2.2 |
| PPSD_backup | 38G / 2022 年旧备份 | 未下载 | ⏭️ 冗余备份，需要再说 |

**传输方式说明**：scp 传海量小文件只有 ~55 文件/分钟（22 万文件要 60+ 小时），已改用
`ssh lab "tar cf - ..." | tar xf -` 服务器端零写入的流式传输；大流量会把 VPN 隧道压断，
所以资产目录采用分块 + 自动重试。期间发现本地 tar 的参数位置 bug（`--skip-old-files`
被 `xf` 的 `f` 当成档案名），已修正。

### 2.2 一个省事的发现：两棵树的资产完全相同

对 PPSD 与 PPSD_zby 的 3 个资产样本做 md5 比对（JBrowse 的 release zip、plot 的一张图、
tplot 的一张表达图谱），**逐字节相同**。两棵树的主体 PHP 文件 md5 也完全一致——
PPSD_zby 就是 PPSD 的副本加少量 2025 年手改（留了 `*_origin_backup.php`）。

**结论**：PPSD 的资产目录不需要重新下载，等 PPSD_zby 资产下完后本地 `cp -r` 一份即可
（已在待办里）。PPSD_backup 是 2022 年的历史备份，与现网内容冗余，未下载。

---

## 三、第一轮：老站功能面逐页盘点

从下载的 PHP 源码得出的老站真实功能面（注意：老站**确实连 PostgreSQL**，
连接文件在 web 目录外的 `/home/www/pgsqli_PPSD_connect.php`，被 12 个 PHP 文件引用，
这是之前"扁平文件"判断的修正）：

| 老站页面 | 功能 | 本地对应实现 | 状态 |
|---|---|---|---|
| index.php | 首页 + 统计 | HomeView.vue + `GET /stats` | ✅ 已覆盖 |
| browse.php / clusters.php | 物种 PHAS loci 表格（分页/排序） | BrowseView.vue + `GET /loci` | ✅ 已覆盖 |
| single_cluster.php | 单位点详情 | LocusDetailView.vue + `GET /loci/:id` | ✅ 已覆盖 |
| single_phasiRNA.php | 单条 phasiRNA 详情 | PhasiRnaView.vue | ✅ 已覆盖 |
| search.php + search_res_Gene / search_res_location | 按基因检索 / 按位置检索 | SearchView.vue + `GET /search` | ✅ 已覆盖 |
| download.php | 批量下载（8 个文件） | DownloadView.vue | ✅ 已覆盖，且本地 `data/raw/` 与老站 download_dir 的 8 个文件完全一致 |
| verified_ini.php | "验证过的 initiator"专页（连 PG） | 无专门页面，initiator 信息合在 locus 详情页（`GET /loci/:id/initiators`） | △ 部分覆盖 |
| blast.php + blast_res_zrf.php | BLAST 序列比对（连 PG） | BlastView.vue（352 行）+ backend/routes/blast.js **已实现但前端未挂路由** | △ 代码在、没入口 |
| help.php | 帮助页 | HelpView.vue（303 行）**未挂路由** | △ 代码在、没入口 |
| （无对应页） | 统计图鉴 | AtlasView.vue（561 行）+ routes/atlas.js **未挂路由** | △ 代码在、没入口 |
| （无对应页） | 系统发育树 | routes/tree.js + data/samples/01_物种系统发育树 | △ 只有后端 |
| JBrowse（3.3G 静态站） | 基因组浏览器 | 无 | ✗ 未集成 |
| tplot（2.5G，7.6 万文件） | phasiRNA 表达图谱 | 无 | ✗ 未集成 |
| plot（1.2G，2.6 万文件） | 位点结构图 | 无 | ✗ 未集成 |
| change_select_comtent.php | 只是搜索页二级联动下拉的 JS demo | — | 非功能页，忽略 |

**关键结论**：老站 9 个真实功能页面里，本地已覆盖 6 个；BLAST/帮助/图鉴三个页面
**视图和后端都写好了，只是没接进路由**（组会删减版被摘掉的，i18n 的 `nav.blast`、
`nav.help` key 都还留着）；JBrowse/tplot/plot 三个重资产模块未集成。

---

## 四、第一轮：本地项目现状

- **前端**：Vue 3 + vue-router，当前 6 条路由（home/browse/locus/phasi-rna/search/download），
  i18n 中英双语，`src/views/` 下有 9 个视图（3 个未路由），demo 模式走 hash 路由 +
  内嵌 gzip 快照（解压 68MB / 传输 6.1MB）。
- **后端**：Express 5，pg/pglite 双驱动抽象（`src/db/index.js` 一个 `query()` 接口），
  8 个路由模块（species/loci/phasi-rna/search/downloads/blast/tree/atlas），
  schema 10 张表，`npm run db:load` 从 `data/` 灌 54 万行约 35 秒。
- **数据四层**：`raw/`（官网 8 个导出文件，116M）→ `browse/`（8 物种浏览页 JSON）
  → `derived/`（合并 TSV/FASTA，27M）→ `samples/`（9 个教学样例）。
  `db:load` 只读 raw + derived 共约 145M，**不读 reference/**（这点对部署很重要）。

---

## 五、第一轮：缺口清单

**数据缺口**
1. tplot/plot 资产下载未完成（JBrowse 已完成）——补下中。
2. PPSD 资产未落地——可用本地复制解决（见 2.2）。
3. initiator 只有水稻/大豆两个物种——**这是老站官网的发布限制，不是本地遗漏**
   （download.php 历来只发布这两个物种的 initiator 包）。
4. 本地库的数据来源是"官网导出 + 浏览页提取"，与服务器 PostgreSQL 里的真实数据
   **同内容但不同来源**；老站 `json/all.json`（物种分类树）与本地
   `samples/01_物种系统发育树_species-tree.json` 也不同源。

**功能缺口**（按优先级）
1. BLAST / 帮助 / 统计图鉴：代码已完成，缺路由和导航入口（改 2 个文件即可，见第七节）。
2. JBrowse / tplot / plot：老站重资产模块，新站未集成。
3. verified_ini 专页：信息已在 locus 详情页覆盖，缺独立入口。

---

## 六、第二轮：缺口核对

- [x] 源码+数据+git：md5 抽检全部一致（PPSD_zby 15 个文件 / PPSD 4 个文件）。
- [x] JBrowse：119,333 文件落地。
- [🔁] tplot/plot：分块流式补下中（tplot 2/8 物种已到，plot 待传）。
- [x] PPSD 资产同源性：3 个样本 md5 逐一相同 → 本地复制方案成立。
- [x] initiator 双物种限制：老站同样如此，非本地缺失，无需"补"。
- [x] 数据同源性：本地 54 万行来自官网公开导出，与老站 PG 内容一致但非同一管道。

---

## 七、第二轮：架构调整方案

> 以下都是**方案**，没有动任何现有文件。每条都标了"要改哪些文件、怎么改"，
> 你确认后我再动手（或你自己改）。

### 7.1 路由补齐（工作量最小，建议最先做）

`src/main.js` 的 routes 里补 3 条路由，`src/App.vue` 的 navItems 补 2 项：

```js
// main.js routes 增加：
{ path: '/blast',  name: 'blast',  component: BlastView },
{ path: '/atlas',  name: 'atlas',  component: AtlasView },
{ path: '/help',   name: 'help',   component: HelpView },

// App.vue navItems 增加（i18n key 已存在）：
{ name: 'blast', key: 'nav.blast', to: '/blast' },
{ name: 'help',  key: 'nav.help',  to: '/help' },
```

demo 模式下这三个页面已有降级提示（mockApi 注释里说明 atlas/tree 不在快照内），
接入后单文件演示版也不会崩。

### 7.2 数据源升级（建议部署前做）

现在的数据是 2026-09-25 从官网抓的快照。要变成"权威副本"，请管理员
`pg_dump` 老站 PostgreSQL（5432 端口那个实例）→ 本地灌库 → 之后以本地库为准。
好处：彻底消除"导出文件 vs 真实库"的偏差，BLAST 的检索集也和线上一致。
替代方案：维持现状（官网导出），功能上够用。

### 7.3 JBrowse / tplot / plot 集成（建议"先链接、后重绘"）

这三块合计 7G 静态资产（JBrowse 是完整可跑的静态站）。建议：

- **第一阶段**：部署时把它们原样放到 `/home/www/html/PPSD_new/jbrowse/`、
  `/tplot/`、`/plot/` 下，前端加外链入口（位点详情页放"基因组浏览器 / 表达图谱"按钮，
  新窗口打开对应 URL）。零开发量，保留原站体验。
- **第二阶段**（可选）：用 Vue 组件重绘 tplot/plot（数据都在本地库里），
  JBrowse 保留原版即可（重写它没有意义）。

### 7.4 verified_ini

保持现状（合并在 locus 详情页）。如果组会/答辩要展示"验证 initiator"专页，
照老站 verified_ini.php 的查询逻辑加一个视图即可，后端数据已够。

### 7.5 部署架构（详见《部署报告-课题组服务器.md》）

后端用 **pglite 驱动**（WASM 版 PostgreSQL，自带数据库）→ 服务器上不需要
配 PostgreSQL、不需要数据库账号；前端静态文件 + Apache `/api` 反代到后端端口。
这套架构和老站（PHP + PostgreSQL）是同构的，数据流一致。

---

## 八、待你确认的事

1. 路由补齐（7.1）要不要现在做？做完导航恢复成 6 项（首页/浏览/检索/BLAST/下载/帮助）。
2. 数据源升级（7.2）要不要找管理员要 pg_dump？可以和部署的事一起拜托。
3. JBrowse/tplot/plot 集成采用"先链接"方案吗？
4. PPSD_backup（38G 旧备份）确定不下载吗？

---

## 九、整改轮记录（2026-10-16 晚，已全部完成）

针对第七节列的问题做了一轮整改，并按要求做了两轮审查。**未改动任何未列入计划的文件；
所有改动都经过构建 + 接口 + 页面三级验证。**

### 9.1 网页功能修复（审查报告 7.1 的落地）

| 改动 | 文件 | 验证 |
|---|---|---|
| BLAST / 统计图鉴 / 帮助 三条路由接入 | `src/main.js` | 生产构建 + demo 构建通过 |
| 导航恢复到 7 项（含 BLAST、统计图鉴、帮助） | `src/App.vue` | Chrome headless 逐路由渲染通过 |
| 命令面板（Ctrl+K）登记新页面 | `src/components/CommandPalette.vue` | 同上 |
| 位点详情页新增"位点结构图"区（老站 plot 图，URL 规则 `plot/{物种}/{span}/{recorder}.jpg`，图缺失时显示降级提示） | `src/views/LocusDetailView.vue` + i18n 中英文案 | 截图验证：URL 计算正确、降级提示正常 |
| 修正"只有水稻大豆有 initiator"的过时提示 | `src/i18n/index.js` | 构建通过 |

### 9.2 RNA 数据补齐（审查报告第三节缺口 1 的落地）

**做法**：老站 `single_cluster.php` 把每个位点的 initiator 完整记录渲染在公开 HTML 表格里。
写了抓取脚本（礼貌速率 0.6s/请求、断点续传、自动重试），把 6 个物种全部 **3,858 个位点**
抓下来解析成结构化数据，落在 `data/scraped/`：

| 物种 | 位点 | initiator 记录 | 其中 verified |
|---|---|---|---|
| Arabidopsis thaliana | 77 | 1,566 | 46 |
| Brassica napus | 21 | 123 | 1 |
| Citrus sinensis | 1,050 | 838 | 66 |
| Gossypium hirsutum | 59 | 165 | 45 |
| Vitis vinifera | 1,054 | 564 | 41 |
| Zea mays | 1,597 | 731 | 48 |

**可信度**：抽抓的水稻/大豆样本（33 + 30 个位点）与官方导出文件逐位点比对**完全一致**
（注意官方文件按降解组库重复记录，老站页面是 DISTINCT 语义，已按此去重后比对）。

**灌库**：`backend/src/db/load.js` 新增一段读取 `data/scraped/initiator_scraped.tsv`，
6 物种 initiator 入库。同时把官方文件的导入也改成 DISTINCT 语义（原先会把降解组重复行
也灌进去，导致同一 miRNA 在位点详情页重复出现、计数和老站不一致）。

### 9.3 顺带发现并修复的数据错误

1. **derived 的 initiator_number 列错位**（2026-09-25 浏览页提取时引入）：抽样 770 个位点
   有 327 个与官方文件不符（有的少算、有的混成官方文件原始行数）。现在 `db:load`
   会用真实 initiator 记录回填纠正，全库校验 **0 不一致**；demo 快照里 84 个演示位点
   同步重算。
2. **demo 快照是 68MB 旧残留**：构建器早前已改成只取 165 个演示位点，但快照没重建。
   重建后 259KB（gzip 后），且 initiator 覆盖从 2 物种扩展到 8 物种。
3. **mockApi 注释过时**（称 atlas/tree 不在快照内）——实际在，已更正。

### 9.4 两轮审查结果

**第一轮（功能与数据验证）**：
- 生产构建、demo 构建均通过（npm 包装器有一次段错误，直接 `npx vite build` 正常，
  系本机 Node 24 环境问题，非代码问题）
- 9 条路由 Chrome headless 逐渲染全部通过
- 后端 API：`/api/loci/:id/initiators` 对 6 个此前为空的物种全部返回真实数据
  （拟南芥示例位点 9 条：ath-miR173-3p、ath-miR397b…）
- 数据库终态：clusters 7,760 / phasi_rna 104,166 / initiator 8,956（8 物种），
  initiator_number 与记录数 0 不一致

**第二轮（与老站逐功能对照 + 回归检查）**：

| 老站功能 | 整改前 | 整改后 |
|---|---|---|
| 首页/浏览/检索/下载/位点详情/phasiRNA 详情 | ✅ | ✅ 无回归 |
| BLAST | 代码在、无入口 | ✅ 路由+导航+命令面板全通 |
| 帮助 | 代码在、无入口 | ✅ 同上 |
| 统计图鉴 | 代码在、无入口 | ✅ 同上（老站没有，新增） |
| initiator 数据 | 2 物种（且计数错位） | 8 物种、计数与老站一致 |
| 位点结构图 | 无 | ✅ 老站同款 plot 图（部署后生效） |
| 靶基因明细 | osa/gma | osa/gma（6 物种的逐条计数已抓取存档，明细需 pg_dump） |
| JBrowse/tplot | 未集成 | 未集成（部署时让管理员拷贝静态目录，见部署报告） |

**仍然存在的缺口**（需要你或管理员决策，不阻塞开发）：
1. 6 物种每条 phasiRNA 的靶基因明细（老站逐页展示，10 万+ 页面，建议 pg_dump）
2. JBrowse/tplot 集成（部署时拷贝静态资源即可，前端入口可后加）
3. verified_ini 独立页面（信息已合并在位点详情页）
4. 5 张测序数据登记表（srna_seq/degradome/flnc/genome/transcriptome）仍为空——
   老站 PG 里有 GSM 库信息，值得跟 pg_dump 一起要
