# 数据文件样例（samples）

这里放的是 `data/` 目录下每类数据文件的**真实片段**，用文本编辑器直接打开就能看到文件长什么样，
不用去开 92 MB 的原始文件。每个样例都在文件名里标注了它摘自哪个完整文件。

> 完整数据在上一级目录：`raw/`（官方发布）、`browse/`（8 物种浏览页 JSON）、
> `derived/`（合并后的可导入文件）、`reference/`（系统发育树）。
> 各文件的完整列定义见 `../README.md`。

## 样例清单

| 文件 | 摘自 | 内容 |
|---|---|---|
| `01_物种系统发育树_species-tree.json` | `reference/species-tree.json`（完整拷贝，8.7 KB） | 119 个植物物种的分类树，8 个有数据的物种标了 `hasData: true` |
| `02_PHAS位点_官方TSV_水稻_前20行.txt` | `raw/osa_database_PHAS_Loci.txt` 前 20 行（完整文件 3366 行） | 水稻 PHAS 位点元数据，19 列，大写驼峰表头 |
| `03_PHAS位点_八物种合并TSV_前10行.tsv` | `derived/pha_loci_all_species.tsv` 前 10 行（完整 7760 行） | 8 物种合并版，前两列新增 `species` / `phas_loci`，小写下划线表头 |
| `04_PHAS位点序列_FASTA_前3条.fa` | `derived/phas_locus_seq_all_species.fa` 前 3 条（完整 7760 条） | FASTA 格式：`>` 开头是位点名，下一行整行是核酸序列（不折行） |
| `05_phasiRNA序列_合并TSV_前10行.tsv` | `derived/phasi_rna_seq_all_species.tsv` 前 10 行（完整 104166 行） | 4 列：物种 / phasiRNA ID / 父位点 / 21 nt 序列 |
| `06_phasiRNA及靶基因_官方TSV_水稻_前12行.txt` | `raw/osa_database_phasiRNA.txt` 前 12 行（完整 415876 行） | 扁平宽表：一条 phasiRNA × 一条降解组验证靶基因 = 一行，同一 phasiRNA 会重复多行 |
| `07_起始因子initiator_官方TSV_水稻_前12行.txt` | `raw/osa_database_initiator.txt` 前 12 行（完整 5884 行） | 触发 PHAS 位点的 miRNA，15 列（注意 `Cleavege_site` 是官网原拼写） |
| `08_浏览页JSON_油菜_完整.json` | `browse/bna__PHAS_info_21.json`（完整拷贝，油菜 21 个位点全在） | 浏览页 JS 变量的原样提取：key 是位点名，value 是 18 元素数组（按位置对应 TSV 的 18 列，缺主键列） |
| `09_数据库建表脚本.sql` | `schema.sql`（完整拷贝） | PostgreSQL 建 6 张表的脚本，含注释版数据字典 |

## 怎么看这些文件

TSV 就是「用制表符（Tab）分隔的表格」，Excel 可以直接打开（数据 → 自文本 → 选 Tab 分隔）。
推荐用 VS Code 打开：选中一列 Tab 能明显看出列边界。

一条记录的「一生」可以作为阅读线索：

```
OsaPHAS9g4346635.1@21#1                 ← 位点：02/03/04/09 号样例
  └─ OsaPHAS9g4346635.1@21#1.1          ← 它切出的 phasiRNA：05/06 号样例
       └─ XM_015787922.2 (Cat_2)        ← 这条 phasiRNA 降解组验证的靶基因：06 号样例
  └─ osa-miR5521 (Distance=1)           ← 触发这个位点的 miRNA：07 号样例
```
