# ppsd-web

> ⚠️ **这只是一个数据库网站的 Web 界面测试，并非数据库本身。**
> 真实、完整的 PPSD（Plant Phased siRNA Database，植物相位小干扰 RNA 数据库）由
> **南京农业大学作物生物信息学组**维护，请访问官方网站：
> **<http://cbi.njau.edu.cn/PPSD>**
>
> 本仓库是个人学习性质的前端复刻练习：用 Vue 3 重新实现了 PPSD 的网页界面，
> 并内嵌一小份从官网公开接口采集的**演示快照**（每物种仅节选约 20 个位点，
> 共 165 个位点 / 5,438 条 phasiRNA），全部计算（检索、排序、分页、详情、
> 序列比对）都在浏览器本地完成，不连接任何后端。
>
> 数据版权归南京农业大学作物生物信息学组所有；本项目与官方团队无关，
> 不提供数据下载，正式数据请从官网获取。

---

## 这是什么

phasiRNA（phased small interfering RNA，相位小干扰 RNA）是植物特有的一类非编码小 RNA。
它由 **PHAS 位点**被 **miRNA** 剪切后，以 21 个核苷酸为周期依次切割产生，
进而降解或抑制下游的**靶基因**：

```
miRNA（phase initiator） → 剪切 → PHAS locus → 相位切割 → phasiRNA → 靶基因
```

PPSD 把这条通路上四个组分的详细信息全部收录。本仓库复刻了它的整套网页界面：

| 页面 | 路径 | 对应原站 |
|---|---|---|
| 首页 | `/` | `index.php` |
| 物种浏览 | `/browse/:species` | `browse.php` |
| 统计图鉴 | `/stats` | （v2 新增） |
| 单 locus 详情 | `/locus/:id` | `single_cluster.php` |
| 单 phasiRNA | `/phasi-rna/:id` | `single_phasiRNA.php` |
| 检索 | `/search` | `search.php` |
| 序列比对 | `/blast` | `blast.php` |
| 批量下载 | `/download` | `download.php` |
| 帮助 | `/help` | `help.php` |

界面特性：中英双语（默认英文，右上角切换）、Ctrl+K 全局命令面板、
URL 同步的表格状态（可分享/收藏）、边输边过滤、一键复制序列、
ECharts 图表（相位分布散点 + 相邻间距直方图）、本地序列比对
（种子延伸 + Smith-Waterman，算法与后端一致，非 NCBI BLAST）。

## 在线演示

GitHub Pages：<https://xarfa.github.io/ppsd/>

演示版运行在轻量快照上，与原版整库的差异：

- 位点/phasiRNA 每物种只收录 phasiRNA 数量最多的前 20 个（另加 5 个演示位点）
- 统计图鉴页的聚合图表不在快照内，页面会给出提示
- 下载页不提供文件（演示版权限）

## 本地运行

```bash
npm install
npm run dev        # → http://localhost:5173
```

## 构建单文件演示版

```bash
npm run build:demo
# 产物：dist-demo/index.html —— 所有 JS/CSS/数据内嵌成一个 HTML，
# 双击即用（file:// 协议，hash 路由），不需要任何后端
```

## 目录结构

```
src/                 前端（Vue 3 + vue-router + ECharts）
├── main.js          入口：字体 + 样式 + 路由表
├── App.vue          外壳：玻璃导航 / 命令面板 / Toast / 页脚
├── api/ppsd.js      接口封装（演示版切换到 mockApi）
├── i18n/index.js    中英文案字典 + t()
├── styles/
│   ├── tokens.css   设计令牌 —— 换风格只改这一个文件
│   └── base.css     组件库 —— 所有页面只用这里的类
├── demo/
│   ├── mockApi.js       演示版数据适配器（内存快照上实现全部接口）
│   ├── demo-data.json   轻量快照（由 backend/scripts/build-demo-snapshot.mjs 生成）
│   └── demo-data.b64.txt  快照的 gzip+base64，构建时内嵌进 HTML
└── views/           9 个页面，一个文件一个页面

backend/             后端源码（Node.js + Express + PostgreSQL，本演示不部署）
data/
├── samples/         各数据文件的格式样例（节选）
├── schema.sql       建表脚本
└── README.md        数据来源与格式说明
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + vue-router + Bootstrap 5（仅 grid/utilities/reboot）+ ECharts |
| 演示数据 | 构建期内嵌 gzip 快照，运行时浏览器 `DecompressionStream` 解压 |
| 后端（源码在 `backend/`，演示不部署） | Node.js + Express + pg 驱动，PostgreSQL |

## 数据来源与归属

演示快照采集自 <http://cbi.njau.edu.cn/PPSD> 的公开接口，仅作界面测试用途。
数据版权属于南京农业大学作物生物信息学组。完整数据、最新数据与正式引用
请一律以官方网站为准。
