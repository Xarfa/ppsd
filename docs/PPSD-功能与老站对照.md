# PPSD 功能与老站对照（2026-10-18）

> 这份是给师兄/老师看的：老站有什么、新站对应什么、哪些已还原、哪些还缺、缺的怎么补。
> 技术细节和部署步骤看同目录的 `PPSD-部署教学-Hyper逐步.md` 和 `PPSD-你的操作手册.md`。

---

## 1. 一句话结论

老站 6 个主页面（Home / Browse / Search / Blast / Download / Help）和 4 个详情/结果页都已对应到新站的路由；数据覆盖 8 个物种、7,760 个 PHAS 位点、104,166 条 phasiRNA。新站另外加了统计图鉴（9 张 ECharts 图）和物种树。

目前明确的缺口有三块：

1. **6 个物种的靶基因明细**：数据库里只有水稻和大豆的 `phasiRNA → target` 记录，其余 6 个物种缺。
2. **tplot 图**：本地已有 6 个物种约 5.7 万张，葡萄/玉米缺失；水稻的 initiator 图也缺。
3. **JBrowse**：老站的 JBrowse 只有水稻 11 号染色体一个静态实例，只能给水稻 chr11 位点加链接。

---

## 2. 页面/功能对照

| 老站 | 新站 | 状态 |
|---|---|---|
| `index.php` 首页 + 统计 | `/` HomeView | ✅ |
| `browse.php` / `clusters.php` 物种位点表 | `/browse/:species?` BrowseView | ✅ |
| `single_cluster.php` 位点详情 | `/locus/:id` LocusDetailView | ✅ |
| `single_phasiRNA.php` phasiRNA 详情 | `/phasi-rna/:id` PhasiRnaView | ✅ |
| `search.php` + `search_res_Gene` / `search_res_location` | `/search` SearchView | ✅ 6 种检索（phasiRNA / 位点 / NCBI Gene / 转录本 / miRNA / 基因组区间） |
| `blast.php` + `blast_res_zrf.php` | `/blast` BlastView | ✅ 双引擎（见 §4） |
| `download.php` | `/download` DownloadView | ✅ 8 物种、5 类文件；老站只发布水稻/大豆 |
| `help.php` | `/help` HelpView | ✅ 内容比老站多 |
| `verified_ini.php` 独立页 | 合并进位点详情的 initiator 表 | △ 信息没丢，但没有独立 URL |
| JBrowse | 水稻 chr11 位点详情加链接 | △ 只覆盖水稻 11 号染色体 |
| tplot 表达/降解组图 | phasiRNA 靶基因表、位点 initiator 表加 T-plot 按钮 | △ 6 个物种可看，缺葡萄/玉米 |
| （老站没有） | `/atlas` 统计图鉴，9 张 ECharts 图 | ✅ 新增 |
| （老站没有） | 物种系统发育树（119 物种，8 个有数据可点） | ✅ 新增 |

> 老站本身现在部分页面是坏的：`clusters.php` 和 `verified_ini.php` 直接报 PHP Warning/Fatal error。新站对应页面是正常出数据的，所以不要拿老站现在的错误页面当验收标准。

---

## 3. 数据量

| 项目 | 数量 |
|---|---|
| 物种 | 8 |
| PHAS 位点 | 7,760 |
| phasiRNA | 104,166 |
| 靶基因记录 | 465,863（水稻 415,876 + 大豆 49,987） |
| initiator | 8,956（8 个物种都有） |
| 已验证 initiator | 354 |
| 已验证靶基因 | 6,520 |

分物种位点数：

| 物种 | 缩写 | 位点数 | phasiRNA |
|---|---|---:|---:|
| 水稻 Oryza sativa | osa | 3,366 | 50,508 |
| 玉米 Zea mays | zma | 1,597 | 23,558 |
| 葡萄 Vitis vinifera | vvi | 1,054 | 11,176 |
| 柑橘 Citrus sinensis | csi | 1,050 | 10,473 |
| 大豆 Glycine max | gma | 536 | 7,117 |
| 拟南芥 Arabidopsis thaliana | ath | 77 | 823 |
| 棉花 Gossypium hirsutum | ghi | 59 | 381 |
| 油菜 Brassica napus | bna | 21 | 130 |

老站 `download.php` 只提供水稻和大豆的 8 个官方文件（各 4 个）；这 8 个文件本地 `data/raw/` 都有，之前做过 md5 交叉校验。**老站公开的下载数据没有遗漏。**

老站首页写 “over 100 plant species”，但 browse 实际只有 8 个物种有数据。新站的物种树是 119 个物种、8 个可点，和这个说法对得上——不是少了 100 个物种的数据。

---

## 4. BLAST：保留两个版本

页面上的“比对引擎”可以切换：

| 引擎 | 说明 |
|---|---|
| **NCBI BLAST+ 2.9.0+** | 直接调用老站 `PPSD_zby/blast/` 下现成的 `blastn` 和 `phasiRNA` / `PHASGene` 两个预编译库。任务、E 值、最大序列数与老站 `blast.php` 一致，结果是 NCBI BLAST 语义。 |
| **JS 近似** | 原来的 JavaScript 种子延伸 + Smith-Waterman。Windows 本机没有 Linux 版 blastn 时用它；得分和 E 值是近似值，页面上明确标注。 |

默认规则：服务器上 NCBI 可用就用 NCBI；NCBI 不可用或运行失败时自动回退 JS，并在结果上方显示 `warning`，不会静默换引擎。

差异说明：老站只有 BLASTN、两个库、E 值四档（1e-3 / 1e-5 / 1e-10 / 1e-20）、最大序列数四档（5 / 10 / 15 / 20）；新站保持一致，另外多了“物种过滤”和“最多显示条数”。

---

## 5. 三个老站静态资产怎么处理

### 5.1 tplot 图

- 位置：老站 `tplot/{物种}/21/{phasiRNA|initiator}/{文件名}`。
- 文件名存在数据库的 `t_plot` 列里；新站只在该文件真实存在时返回 URL，前端才显示 T-plot 按钮。
- 显示规则与老站一致：靶基因只有 `Cat_1` 显示；initiator 只有 `verified=yes` 显示。
- 本地已有 6 个物种、约 5.7 万张：拟南芥、油菜、柑橘、大豆、棉花、水稻（水稻只有 phasiRNA 图，initiator 图缺）。
- 缺葡萄、玉米；服务器老目录可能有，补图命令见部署手册。
- 图片不拷进 `dist/`，由后端直接静态托管老目录，部署包仍然很小。

### 5.2 JBrowse

- 位置：老站 `JBrowse/jbrowse/`，JBrowse 1.16.11 静态实例。
- 数据只有一条 refseq：`CM003932.2_RagTag`，对应 **水稻 Indica Minghui 63 第 11 号染色体**（NCBI 登录号 CM003932.2，32,883,170 bp）。
- 所以只有水稻 chr11 的位点详情显示“在 JBrowse 查看（11 号染色体）”；chr9 或其他物种不显示，避免跳错染色体。
- 老站的 “Link to JBrowse” 按钮原本就是注释掉的，所以这里没有现成的坐标映射可抄。

### 5.3 BLAST 库

- 位置：老站 `blast/ncbi-blast-2.9.0+/bin/blastn` 和 `blast/db/{phasiRNA,PHASGene}`。
- 版本是 2.9.0+（2019），不是最新 NCBI 版本；但和老站结果一致。
- 如果以后要升级，需要离线搬新二进制并重建库，属于另一项工作。

---

## 6. 还缺什么、怎么补

### 6.1 6 个物种的靶基因明细（最大缺口）

现在 `phasi_rna_target` 只有：

- 水稻 415,876 行
- 大豆 49,987 行

拟南芥、油菜、柑橘、棉花、葡萄、玉米的 phasiRNA 详情页能打开，但没有靶基因表。老站这 6 个物种的靶基因在 PostgreSQL 的 `{spe}_phasirna_21` 表里。

**最省事的补法**：请管理员/导师导出一份老库的 `pg_dump`（至少这 6 个物种的 phasirna 表），我们用导入脚本按现有表结构灌进去。

**不建议**抓 10 万多个单页：慢、容易漏、对老站压力大。

可以直接发给师兄的话：

> 师兄，老 PPSD 的 PostgreSQL 能不能导出一份 pg_dump？至少需要拟南芥、油菜、柑橘、棉花、葡萄、玉米这 6 个物种的 `{spe}_phasirna_21` 表，用来补 phasiRNA 的靶基因明细。现在网页只有水稻和大豆有靶基因，其余 6 个物种点进去是空的。

### 6.2 tplot 缺图

- 葡萄、玉米：本地没有；服务器老目录 `/home/www/html/PPSD_zby/tplot/` 可能有。
- 水稻 initiator：本地没有 `oryza_sativa/21/initiator/`。
- 补图命令（在服务器上，不需要 root）：
  ```bash
  ls /home/www/html/PPSD_zby/tplot
  # 有 vitis_vinifera / zea_mays 的话，本地开发可以流式拷回来：
  # ssh lab-hj "tar cf - -C /home/www/html/PPSD_zby/tplot vitis_vinifera zea_mays" | tar xf - -C data/reference/PPSD_zby/tplot
  ```
- 服务器上运行时直接读老目录，不需要拷贝；缺的物种前端会自动不显示按钮。

### 6.3 JBrowse 其他物种/染色体

- 现有静态实例只有水稻 chr11。要给其他染色体/物种做，需要每个基因组的序列 + 轨道数据，属于新工作量，不在本次范围。

---

## 7. 部署后怎么自检

在服务器上执行：

```bash
bash ~/ppsd-26/app/check-assets.sh
```

它会依次检查：

1. `/api/health`：数据库在不在（`clusters: 7760`）
2. `/api/assets`：BLAST / tplot / JBrowse 三块资产
   - `blast.available: true` + `version: 2.9.0+`
   - `tplot.missingSpecies` 里应该只剩葡萄/玉米（如果没补图）
   - `jbrowse.available: true`
3. `/PPSD_new/` 和 `/PPSD_new/jbrowse/` 的 HTTP 状态
4. 一次真实 NCBI BLAST：返回 `"engine":"ncbi"` 才算成功；返回 `js` 说明 NCBI 没起来

---

## 8. 一句话给师兄

> 老站 6 个主页面和详情页都复刻了，数据是 8 物种 7,760 位点 104,166 条 phasiRNA；BLAST 用回老站的 NCBI BLAST+ 2.9.0+，另外保留 JS 兜底；tplot 和 JBrowse 也接上了（JBrowse 只有水稻 chr11）。现在最大的数据缺口是 6 个物种的靶基因明细，需要老库的 pg_dump。
