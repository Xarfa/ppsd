# PPSD 数据资产说明

本目录存放 PPSD（Plant Phased siRNA Database，植物 phased siRNA 数据库）的**真实数据**。

## 数据来源与获取方式

数据取自南京农业大学作物生物信息学组（CBI）公开站点 <http://cbi.njau.edu.cn/PPSD>，
于 2026-09-25 采集。采集方式有三种，全部是站点**公开提供**的接口：

| 来源 | 说明 |
|---|---|
| `download.php` 直链 | 官方发布的 TSV / FASTA 打包数据（仅水稻、大豆有） |
| `clusters.php?spe=<物种>` | 浏览页把该物种全量数据内嵌在页面 JS 变量里（`PHAS_info_21` / `PHAS_Seq_21` / `phasiRNA_21_seq`），8 个物种都有 |
| 论文附录 | 数据规模与表设计的交叉校验依据 |

> ⚠️ **数据归属提醒**：这批数据属于南农 CBI 课题组。本地 demo 用作技术验证没问题，
> 但要对外发布 / 写进汇报材料前，务必先跟导师（黄骥 教授）或学长确认使用边界，
> 正式版本应当从实验室服务器取数，而不是从公开站点抓。

## 目录结构

```
data/
├── raw/          官网 download.php 发布的原始文件（水稻 + 大豆，小写表头原名）
├── browse/       从浏览页 JS 提取的 8 个物种全量数据（JSON，原样保存）
├── derived/      把 browse/ 合并整理成可直接 COPY 进数据库的 TSV / FASTA
└── schema.sql    PostgreSQL 建表脚本（依据真实表头 + 论文第三章写成）
```

### `raw/` —— 官方发布文件（8 个）

| 文件 | 行数(不含表头) | 大小 | 内容 |
|---|---|---|---|
| `osa_database_PHAS_Loci.txt` | 3366 | 519 KB | 水稻 PHAS loci 元数据，19 列 |
| `osa_database_phasiRNA.txt` | 415876 | 92 MB | 水稻 phasiRNA + 靶基因降解组验证，21 列 |
| `osa_database_initiator.txt` | 5884 | 1.0 MB | 水稻 phase initiator（触发 miRNA），15 列 |
| `osa_new_PHAS_Gene.fa` | 3366 条 | 5.3 MB | 水稻 PHAS loci 核酸序列 |
| `gma_database_PHAS_Loci.txt` | 536 | 100 KB | 大豆，同上 |
| `gma_database_phasiRNA.txt` | — | 11 MB | 大豆，同上 |
| `gma_database_initiator.txt` | — | 844 KB | 大豆，同上 |
| `gma_new_PHAS_Gene.fa` | — | 1.4 MB | 大豆，同上 |

**官网只发布了水稻（osa）和大豆（gma）两个物种的下载包**，其余 6 个物种没有官方
导出文件 —— 这是原站的数据缺口，不是采集遗漏。

### `browse/` —— 8 物种全量（JSON）

每个物种三个文件，命名 `<缩写>__<变量名>.json`：

- `<abbr>__PHAS_info_21.json` —— PHAS loci 元数据，key 是 locus 名，value 是 18 元素数组
- `<abbr>__PHAS_Seq_21.json` —— PHAS loci 序列，`{locus: sequence}`
- `<abbr>__phasiRNA_21_seq.json` —— phasiRNA 序列，`{phasiRNA_id: sequence}`

物种缩写：`osa` 水稻 / `gma` 大豆 / `zma` 玉米 / `ath` 拟南芥 / `vvi` 葡萄 /
`bna` 油菜 / `csi` 柑橘 / `ghi` 棉花。

`PHAS_info_21` 的数组是**按位置对应**官方 TSV 的列（缺 `PHAS_Loci` 列，因为它是
字典的 key），顺序如下：

```
[0]  Chromosome          [9]  PhaseScore
[1]  Genome_start        [10] PhaseRatio
[2]  Genome_end          [11] Annotation
[3]  Locus_Gene          [12] Method_Ref
[4]  Transcript          [13] Tag
[5]  PHAS_Gene_Type      [14] recorder
[6]  Transcript_start    [15] Target_verified
[7]  Transcript_end      [16] Initiator_Verified
[8]  Pvalue              [17] Initiator_Number
```

### `derived/` —— 合并后的可导入文件（推荐用这个）

| 文件 | 内容 | 行数 | 大小 |
|---|---|---|---|
| `pha_loci_all_species.tsv` | **8 物种全部 PHAS loci**，首两列是 `species` / `phas_loci`，后接 18 列 | 7760 | 1.4 MB |
| `phasi_rna_seq_all_species.tsv` | 全部 phasiRNA 序列，列：`species` / `phasi_rna` / `parent_locus` / `sequence` | 104166 | 9.2 MB |
| `phas_locus_seq_all_species.fa` | 全部 PHAS loci 序列（FASTA） | 7760 条 | 14 MB |

## 数据规模核对

| 物种 | 学名 | PHAS loci | phasiRNA |
|---|---|---|---|
| 水稻 | Oryza sativa | 3366 | 50508 |
| 大豆 | Glycine max | 536 | 7117 |
| 玉米 | Zea mays | 1597 | 23558 |
| 拟南芥 | Arabidopsis thaliana | 77 | 823 |
| 葡萄 | Vitis vinifera | 1054 | 11176 |
| 油菜 | Brassica napus | 21 | 130 |
| 柑橘 | Citrus sinensis | 1050 | 10473 |
| 棉花 | Gossypium hirsutum | 59 | 381 |
| **合计** | | **7760** | **104166** |

论文摘要给的官方数字是 **7765 个 PHAS loci / 104204 条 phasiRNA**。差异来自葡萄
（1054 vs 1055）和玉米（1597 vs 1601）—— 浏览页能翻到的记录比论文统计少了几条，
原因未知（可能是页面分页截断，也可能原库后来有增删）。**差异 <0.1%，不影响 demo**，
但正式做数据库时应当以实验室服务器为准。

## 列定义（来自官方 TSH 表头，可直接当数据字典用）

### PHAS loci（19 列）

| 列名 | 含义 |
|---|---|
| `PHAS_Loci` | 主键，命名规则 `<物种><PHAS><染色体>g<基因号>.<转录本序号>@<长度>#<编号>`，如 `OsaPHAS9g4346635.1@21#1` |
| `Chromosome` | 染色体 |
| `Genome_start` / `Genome_end` | 基因组坐标 |
| `Locus_Gene` | NCBI Gene locus（如 `LOC4346635`） |
| `Transcript` | NCBI 转录本 ID |
| `PHAS_Gene_Type` | 来源类型：mRNA / lncRNA / ... |
| `Transcript_start` / `Transcript_end` | 在转录本上的起止 |
| `Pvalue` | 小 RNA 富集分析（超几何检验）P 值 |
| `PhaseScore` / `PhaseRatio` | phase score 算法得分与相位比 |
| `Annotation` | 功能注释 |
| `Method_Ref` | 命中的打靶方法组合，如 `HC,PC,PG,HG` |
| `Tag` | 原始记录标签 `HC1` / `HC2` … |
| `recorder` | 站点显示的 ID 序号 |
| `Target_verified` | 靶基因是否有降解组验证 yes/no |
| `Initiator_Verified` | 是否有验证过的 initiator yes/no |
| `Initiator_Number` | initiator 个数 |

### phasiRNA + 靶基因（21 列，注意是**扁平宽表**）

| 列名 | 含义 |
|---|---|
| `PhasiRNA` | phasiRNA ID，形如 `<父 locus>.1` |
| `Chromosome` | 染色体 |
| `Genome_Start` / `Genome_End` | 官网里大面积是 `-`，未填 |
| `Strand` | 正负链 |
| `Sequence` | 21nt 序列 |
| `Length` | 长度 |
| `PHAS_Loci` | 父 PHAS locus（外键） |
| `Transcript_id` | 所在转录本 |
| `Start_in_Transcript` / `End_in_Transcript` | 转录本上位置 |
| `T_Verified` | 本条 phasiRNA 是否降解组验证 |
| `Verified_Target_Num` | 验证到的靶基因总数 |
| `Verified_Target` | **本行**对应的靶基因 |
| `Degradome_Lib` | 降解组文库 GSM 号 |
| `Category` | 降解组验证置信分类 `Cat_1` / `Cat_2` … |
| `SmallRNA_Loc` / `Deg_Loc` | 小 RNA / 降解组读数位置 |
| `Deg_Count` | 降解组读数（RP10M） |
| `Shift` | 相位偏移 |
| `T_plot` | 降解组作图图片文件名 |

> 一条 phasiRNA 有多个靶基因时**会重复多行**（水稻 50508 条 phasiRNA 摊成 41 万行）。
> 建表时若想规范化，拆成 `phasi_rna` + `phasi_rna_target` 两张表更干净 ——
> `schema.sql` 里保留了扁平结构以便直接 COPY，注释中说明了拆分方案。

### initiator（15 列）

| 列名 | 含义 |
|---|---|
| `PHAS_Gene` | 被触发的 PHAS locus |
| `miRNA` | 触发的 miRNA 名称 |
| `GeneID` | 靶转录本 |
| `Cleavege_site` | 剪切位点（官网原拼写如此，规范拼写为 Cleavage） |
| `Target_pos_end` | 靶位置末端 |
| `Posmax_min` | 丰度最高/最低位置 |
| `Distance` | miRNA 剪切位点到 PHAS 起始的距离 |
| `Initiator_seq` / `Initiator_len` | initiator 序列与长度 |
| `Recordmarker` | 记录标记 |
| `Verified` | 是否降解组验证 yes/no |
| `Degradome` / `Category` / `Deg_Count` / `T-plot` | 降解组验证详情 |

## 导入 PostgreSQL 的步骤

官网导出的表头是**大写驼峰**（`PHAS_Loci`、`Pvalue`…），而 `schema.sql` 里是**小写
下划线**。PostgreSQL 会折叠未加引号的大写标识符，直接 `\copy` 到目标表会列名对不上。
推荐做法是**建临时表按位置导入，再转为目标表**：

```bash
# 1. 建库
createdb ppsd
psql -d ppsd -f data/schema.sql

# 2. 水稻 PHAS loci：先建同构临时表（列名原样用双引号）
psql -d ppsd <<'SQL'
CREATE TEMP TABLE t_loci (
  "PHAS_Loci" text, "Chromosome" text, "Genome_start" bigint, "Genome_end" bigint,
  "Locus_Gene" text, "Transcript" text, "PHAS_Gene_Type" text,
  "Transcript_start" int, "Transcript_end" int, "Pvalue" double precision,
  "PhaseScore" double precision, "PhaseRatio" double precision, "Annotation" text,
  "Method_Ref" text, "Tag" text, "recorder" int,
  "Target_verified" text, "Initiator_Verified" text, "Initiator_Number" int
);
\copy t_loci FROM 'data/raw/osa_database_PHAS_Loci.txt' WITH (FORMAT csv, DELIMITER E'\t', HEADER true)
INSERT INTO clusters SELECT "PHAS_Loci",'Oryza sativa',"Chromosome","Genome_start","Genome_end",
  "Locus_Gene","Transcript","PHAS_Gene_Type","Transcript_start","Transcript_end","Pvalue",
  "PhaseScore","PhaseRatio","Annotation","Method_Ref","Tag","recorder",
  "Target_verified","Initiator_Verified","Initiator_Number" FROM t_loci;
SQL

# 3. 8 物种合并版（derived/，表头已是小写下划线，可直接 COPY）
psql -d ppsd -c "\copy clusters (phas_loci,species,chromosome,genome_start,genome_end,locus_gene,transcript,phas_gene_type,transcript_start,transcript_end,pvalue,phase_score,phase_ratio,annotation,method_ref,tag,recorder,target_verified,initiator_verified,initiator_number) FROM 'data/derived/pha_loci_all_species.tsv' WITH (FORMAT csv, DELIMITER E'\t', HEADER true)"
```

`data/derived/pha_loci_all_species.tsv` 的列顺序是
`species, phas_loci, chromosome, genome_start, ...`（前两列是新增的，其余 18 列与官网一致）。

## 本地 demo 阶段还没有的东西

| 缺失 | 影响 | 备注 |
|---|---|---|
| 其余 6 物种的 initiator / 靶基因数据 | 玉米、拟南芥等详情页的 initiator 表会是空的 | 官网本来就没发布 |
| 相位比对图 `plot/<物种>/21/<序号>.jpg` | 详情页的 Plot 板块无法复刻 | 每张约 65 KB × 7760 张 ≈ 500 MB，需要时再按需抓 |
| 降解组 T-plot 图片 | phasiRNA 详情页的作图缺失 | 数量更大，建议跳过 |
| 组织表达数据（Tissue Expression） | phasiRNA 详情页该板块缺失 | 官网这一块本身还有 PHP 报错 |
| 5 张测序登记表（sRNA-seq / degradome / flnc / genome / transcriptome） | 数据来源页缺失 | 论文里提到但未导出 |
