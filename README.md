# PPSD — Plant Phased siRNA Database（本地复刻 v2）

把南京农业大学作物生物信息学组的植物 phasiRNA 数据库
[PPSD](http://cbi.njau.edu.cn/PPSD) 复刻成一套前后端分离的全栈应用，
目的是打通「**前端页面 → HTTP → 后端接口 → SQL → 数据库**」这条完整链路。

> 📖 **先看 [`docs/资产盘点与技术路线.md`](docs/资产盘点与技术路线.md)** ——
> 项目背景、资产清单、技术选型和组会演示脚本。
> 要在这个前端上加功能，看 [`docs/前端手册.md`](docs/前端手册.md)。
> 要改配色/字体，只需要动一个文件：`src/styles/tokens.css`。

---

## 界面（v2「Botanical Ink」）

- **语言**：英文为默认语言，顶栏右上角可切换简体中文（`EN` / `中文`）
- **视觉**：纯白底 + 墨绿正文 + **深植物绿强调色**，8 个物种各占一个专属色相
  （色板刻意拉开距离，避免撞色）。版面是 bento 卡片网格 + 玻璃拟态吸顶导航。
  hero 右侧是一段自绘 SVG 动画：双链 RNA 被扫描线逐段切成 21-nt 相位片段，
  下方配 sRNA-seq 读数热图 —— 把"phasiRNA 是什么"直接画出来
- **字号规范**：严格七档（正文 12/14/15/16 + 标题 20/24/30/40），Space Grotesk
  展示标题 + Inter 界面正文 + IBM Plex Mono 数据等宽，等宽只用于 ID/序列/坐标/数字
- **交互手感**：全局命令面板（**Ctrl+K** 或 `/`，一个框同时搜页面/物种/位点/phasiRNA）、
  URL 同步的表格状态（可分享）、关键词防抖过滤、页大小/行高切换、
  一键导出当前页 CSV、复制序列 + Toast 反馈、骨架屏与滚动入场动画
- **图表**：ECharts，全站 11 张，向 Nature 期刊图版风格靠拢
  （极简网格线、固定系列色、面板字母 a–i、对数轴标注）：
  首页 1 张（物种占比环图）、统计图鉴页 8 张（分组柱状、染色体×物种热力图、
  生物类型旭日图、Top miRNA 触发器、位点长度分布、单位点产量、降解组证据双环图、
  P值×相位得分散点全景、预测方法组合）、位点详情页 2 张（相位分布散点 +
  相邻间距直方图，21 nt 峰值高亮）、phasiRNA 详情页 2 张
- **Browse 页有一棵 119 个物种的植物系统发育树**（复刻原站 browse.php 的 ECharts 树），
  有数据的 8 个物种高亮显示、点击即可浏览


---

## 这是什么

phasiRNA（相位小干扰 RNA）是植物特有的一类非编码小 RNA，由 miRNA 剪切 PHAS locus 后
以 21 nt 为周期依次切割产生，再去调控下游靶基因：

```
miRNA（phase initiator） → 剪切 → PHAS locus → 相位切割 → phasiRNA → 靶基因
```

本库收录 8 个植物物种的整条调控通路，从上游到下游四个组分的详细信息全都有。

| 数据 | 数量 |
|---|---|
| 物种 | 8（水稻、大豆、玉米、拟南芥、葡萄、油菜、柑橘、棉花） |
| PHAS loci | 7,760 |
| phasiRNA | 104,166 |
| 降解组验证靶基因记录 | 465,863 |
| phase initiator | 11,786 |

---

## 架构

三个**相互独立的程序**，靠网络通信：

```
浏览器  ──HTTP──▶  后端  ──SQL──▶  数据库
Vue 3              Node.js         PostgreSQL
:5173              :3000           :5432
```

| 层 | 技术 | 目录 |
|---|---|---|
| 前端 | Vue 3 + vue-router + Bootstrap 5 + ECharts 5 | `src/` |
| 后端 | Node.js + Express + pg 驱动 | `backend/` |
| 数据库 | PostgreSQL | `backend/src/db/` |
| 数据 | 8 物种真实数据 + 数据字典 | `data/` |

---

## 快速开始

需要**三个终端窗口**。

### ① 数据库

本机已装 PostgreSQL 16.9（免管理员二进制版，装在 `E:\Arborist\pgsql`）：

```bash
E:/Arborist/pgsql/bin/pg_ctl.exe -D E:/Arborist/pgdata -l E:/Arborist/pgdata/server.log start
```

> 如果本机没装 PostgreSQL，可以在 `backend/.env` 里把
> `PPSD_DB_DRIVER` 改成 `pglite`（零安装的 PostgreSQL/WASM 版），其余步骤一样。

### ② 后端

```bash
cd backend
npm install
npm run db:load      # 首次需要：建表 + 灌 54 万行数据（约 35 秒）
npm start            # → http://localhost:3000
```

### ③ 前端

```bash
npm install
npm run dev          # → http://localhost:5173
```

浏览器打开 <http://localhost:5173>。

> ⚠️ **npm 镜像问题**：本机默认镜像 `r.cnpmjs.org` 证书已过期，
> 如果 `npm install` 报 `CERT_HAS_EXPIRED`，加上官方源：
> `npm install --registry=https://registry.npmjs.org/`

---

## 页面

| 页面 | 路径 | 对应原站 |
|---|---|---|
| 首页 | `/` | `index.php` |
| 物种浏览 | `/browse/:species` | `browse.php` + `clusters.php` |
| 统计图鉴 | `/stats` | （v2 新增，原站没有） |
| 单 locus 详情 | `/locus/:id` | `single_cluster.php` |
| 单 phasiRNA | `/phasi-rna/:id` | `single_phasiRNA.php` |
| 检索 | `/search` | `search.php` |
| 序列比对 | `/blast` | `blast.php` |
| 批量下载 | `/download` | `download.php` |
| 帮助 | `/help` | `help.php` |

---

## 前端结构

```
src/
├── main.js              入口：字体 + 样式 + 路由表
├── App.vue              外壳：玻璃导航 / 命令面板 / Toast / 页脚
├── api/ppsd.js          所有后端调用的封装
├── i18n/index.js        中英文案字典 + t()
├── utils/
│   ├── echarts.js       ⭐ useChart composable —— 全站图表唯一入口（防两坑）
│   └── ui.js            数字格式化 / 复制 / Toast / CSV 导出 / 数字滚动
├── components/
│   ├── CommandPalette.vue  Ctrl+K 全局搜索面板
│   ├── PhaseRing.vue       相位环品牌图形（hero 装饰 + logo）
│   └── ToastHost.vue       全局复制反馈
├── styles/
│   ├── tokens.css       ⭐ 设计令牌 —— 换风格只改这一个文件
│   └── base.css         ⭐ 组件库 —— 所有页面只用这里的类
└── views/               9 个页面，一个文件一个页面
```

**三条不能破的规矩**（详见 [`docs/前端手册.md`](docs/前端手册.md)）：

1. 颜色/字体/间距全部走 CSS 变量，不写死
2. 所有用户可见文字都走 `t()`，中英两份都要有
3. 不引新的 CSS 框架（Bootstrap 只当布局工具用，只引了 grid/utilities/reboot）


---

## 后端接口

全部以 `/api` 开头：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查，返回驱动与数据库版本 |
| GET | `/api/species` | 8 个物种及各自数据量 |
| GET | `/api/stats` | 首页统计数字与各物种分布 |
| GET | `/api/stats/atlas` | 统计图鉴页的 9 组聚合数据（v2 新增） |
| GET | `/api/loci` | PHAS loci 分页列表（`species` / `q` / `sort` / `order` / `page` / `pageSize`） |
| GET | `/api/loci/:id` | 单 locus 详情（含序列） |
| GET | `/api/loci/:id/phasi-rna` | 该 locus 的 phasiRNA 列表 |
| GET | `/api/loci/:id/initiators` | 该 locus 的 phase initiator |
| GET | `/api/phasi-rna/:id` | 单条 phasiRNA + 全部靶基因 |
| GET | `/api/search` | 综合搜索（`type=locus\|phasiRNA\|gene\|transcript\|mirna`） |
| GET | `/api/search/region` | 基因组区间搜索（`species` / `chrom` / `start` / `end`） |

细节见 [`backend/README.md`](backend/README.md)。

---

## 数据来源与归属

数据采集自 <http://cbi.njau.edu.cn/PPSD> 的**公开**接口，用于技术验证。
数据版权属于南京农业大学作物生物信息学组，正式版本应当从实验室服务器取数。
详见 [`data/README.md`](data/README.md)。

---

## 已知缺口

- **靶基因明细只有水稻和大豆完整** —— 其余 6 物种的逐条靶基因老站只逐页展示，
  已抓取到逐条验证计数（`data/scraped/`，不入库），完整明细需要管理员
  `pg_dump` 老站数据库
- **相位比对图未复刻** —— 原站是静态 JPG，这里改成了动态 ECharts 图；
  原站同款结构图以 `plot/{物种}/{span}/{recorder}.jpg` 形式接在位点详情页，
  部署时把老站 `plot/` 目录放到站点根下即生效
- **BLAST 检索集与线上有偏差** —— 本地库数据来自官网公开导出，权威副本应来自
  老站 PostgreSQL 的 `pg_dump`
- **JBrowse / tplot 未集成** —— 老站的基因组浏览器和表达图谱是静态资产，
  部署时拷贝目录 + 加外链即可（见 `reports/部署报告-课题组服务器.md`）

---

## 部署到学校服务器

完整步骤（含需要管理员做的事、Node 22 家目录安装、pglite 驱动配置、
Apache 反代片段）见 **[`reports/部署报告-课题组服务器.md`](reports/部署报告-课题组服务器.md)**。
要点：后端用 pglite 驱动（WASM 版 PostgreSQL，不需要服务器数据库账号），
跑在自家目录，Apache 把 `/api` 反代到后端端口。

> 数据库访问做成了可切换驱动（见 `backend/src/db/index.js`），
> 从本机 pglite 切到服务器 PostgreSQL 只需要改配置，`routes/` 里的业务代码一行都不用动。

