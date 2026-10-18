# PPSD（植物 phasiRNA 数据库）Web 复刻，非官方

Vue 3 + Express + PostgreSQL/pglite。覆盖 8 个物种、7,760 个 PHAS 位点、104,166 条 phasiRNA。

- 浏览 / 检索 / 下载 / 统计图鉴 / 物种树
- BLAST：NCBI BLAST+ 2.9.0+（与老站一致）+ JS 近似兜底，页面可切换
- tplot 降解组图、水稻 chr11 JBrowse 链接

演示 https://xarfa.github.io/ppsd ｜ 官方 cbi.njau.edu.cn/PPSD

> GitHub Pages 上是静态前端快照（BLAST 为 JS 示例）；完整 NCBI BLAST、tplot、JBrowse
> 需要按 `docs/PPSD-你的操作手册.md` 部署到课题组服务器。
