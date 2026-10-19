#!/bin/bash
# ===========================================================================
# 部署后自检（在服务器上执行，不需要 root）
#
# 用法： bash ~/ppsd-26/app/check-assets.sh
#       PPSD_URL=http://localhost:3618 bash ~/ppsd-26/app/check-assets.sh
#
# 检查内容：
#   1. /api/health          —— 数据库在不在
#   2. /api/assets          —— BLAST / tplot / JBrowse 三块资产是否可用
#   3. /PPSD_new/           —— 前端页面
#   4. /PPSD_new/jbrowse/   —— JBrowse 静态实例
#   5. 一次真实 NCBI BLAST  —— 确认不是静默退回了 JS
# ===========================================================================
set -uo pipefail

BASE="${PPSD_URL:-http://localhost:3618}"

echo "=== 1. 健康检查 ==="
curl -s --max-time 10 "$BASE/api/health" || echo "FAILED"
echo
echo

echo "=== 2. 资产自检（重点看 blast.available / tplot.missingSpecies / jbrowse.available）==="
curl -s --max-time 25 "$BASE/api/assets" || echo "FAILED"
echo
echo

echo "=== 3. 前端页面 ==="
curl -s -o /dev/null -w "/PPSD_new/  HTTP %{http_code}\n" --max-time 10 "$BASE/PPSD_new/"
echo

echo "=== 4. JBrowse ==="
curl -s -o /dev/null -w "/PPSD_new/jbrowse/  HTTP %{http_code}\n" --max-time 10 "$BASE/PPSD_new/jbrowse/"
curl -s -o /dev/null -w "trackList.json  HTTP %{http_code}\n" --max-time 10 "$BASE/PPSD_new/jbrowse/data/trackList.json"
echo

echo "=== 5. NCBI BLAST 实测 ==="
echo "（应该看到 engine=ncbi、blastTask=blastn-short、hits 非空；"
echo "  如果返回 engine=js，往上翻 /api/assets 的 blast.reason）"
curl -s --max-time 60 -X POST "$BASE/api/blast" \
  -H "Content-Type: application/json" \
  -d '{"sequence":"CTATCAGCGGGCTTTCTTGTT","database":"phasi_rna","engine":"ncbi","maxHits":3,"maxSeqs":5,"evalue":"1e-5"}'
echo
