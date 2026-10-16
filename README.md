# PPSD — Plant Phased siRNA Database（Web 复刻）

> ⚠️ **这是数据库网站的 Web 界面复刻，并非数据库本身。** 真实、完整的 PPSD
> （植物相位小干扰 RNA 数据库）由**南京农业大学作物生物信息学组**维护：
> **<http://cbi.njau.edu.cn/PPSD>**。本项目与官方团队无关，不提供数据下载。

用 Vue 3 + Node.js/Express + PostgreSQL 复刻 PPSD 的整套网页界面与后端接口，
打通「前端页面 → HTTP → 后端接口 → SQL → 数据库」的完整链路。

- **在线演示**：<https://xarfa.github.io/ppsd/> —— 单文件版，内嵌 165 个位点的
  轻量快照（每物种约 20 个），全部计算在浏览器本地完成，不连后端
- 收录 8 个物种：水稻、大豆、玉米、拟南芥、葡萄、油菜、柑橘、棉花

## 技术栈

| 层 | 技术 | 目录 |
|---|---|---|
| 前端 | Vue 3 + vue-router + Bootstrap 5 + ECharts 5 | `src/` |
| 后端 | Node.js + Express + pg 驱动 | `backend/` |
| 数据库 | PostgreSQL（可切换 pglite/WASM 版） | `backend/src/db/` |
| 数据 | 8 物种位点/序列/initiator 节选 | `data/samples/` |

## 本地运行

需要三个终端：

```bash
# ① 启动本机 PostgreSQL（路径按本机实际；没装可跳到第 ② 步用 pglite）

# ② 后端（首次 db:load 约 35 秒，灌入 54 万行）
cd backend && npm install && npm run db:load && npm start   # → :3000

# ③ 前端
npm install && npm run dev                                  # → :5173
```

> 没装 PostgreSQL：在 `backend/.env` 把 `PPSD_DB_DRIVER` 改成 `pglite`
> （WASM 版 PostgreSQL，零安装），其余步骤一样。
> npm 镜像证书过期报 `CERT_HAS_EXPIRED` 时，加
> `--registry=https://registry.npmjs.org/`。

## 演示版（不连后端，双击即用）

```bash
node backend/scripts/build-demo-snapshot.mjs   # 生成轻量快照（165 位点）
npm run build:demo                             # → dist-demo/index.html
```

服务器子路径部署用 `npm run build:server`（base=`/PPSD_new/`，API 走反代）。

## 页面

首页 `/` · 物种浏览 `/browse/:species` · 统计图鉴 `/stats` · 位点详情 `/locus/:id`
· phasiRNA 详情 `/phasi-rna/:id` · 检索 `/search` · 序列比对 `/blast`
· 批量下载 `/download` · 帮助 `/help`

## 数据归属

数据采集自原站**公开**接口，用于技术验证；版权属于南京农业大学作物生物信息学组。
本仓库**不含整库数据**（`data/` 只保留 samples 节选与建表脚本），
正式版本应从实验室服务器取数。

## 更多文档

- [`docs/前端手册.md`](docs/前端手册.md) —— 前端结构与规范
- [`reports/部署报告-课题组服务器.md`](reports/部署报告-课题组服务器.md) —— 服务器部署步骤
- [`data/README.md`](data/README.md) —— 数据文件说明
