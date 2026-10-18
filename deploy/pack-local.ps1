# ===========================================================================
# PPSD 部署包打包脚本（在 Windows 上运行）
#
# 用法：在项目根目录打开 PowerShell，执行
#     powershell -ExecutionPolicy Bypass -File deploy\pack-local.ps1
#
# 产出三个上传包（放在 %TEMP% 下）：
#     ppsd-backend.tar.gz   后端 + node_modules + 运维脚本（约 9 MB）
#     ppsd-data.tar.gz      灌库用的数据（约 14 MB）
#     ppsd-dist.tar.gz      前端构建产物（约 2.7 MB）
#
# 为什么必须打包成 tar.gz 再传：
#   node_modules 有 1000 多个小文件，通过 VPN 逐个传要几十分钟；
#   打成单个文件后压缩率高、传输快，服务器端一条命令解开。
# ===========================================================================

$ErrorActionPreference = 'Stop'

# $PSScriptRoot 是本脚本所在目录（deploy/），上一级就是项目根
$root = Split-Path -Parent $PSScriptRoot
$tmp  = $env:TEMP

Write-Host "[1/4] 构建前端（base=/PPSD_new/，接口走 /PPSD_new/api）"
Push-Location $root
npm run build:server
Pop-Location

Write-Host "[2/4] 打包后端（含运维脚本；排除本机 .env）"
# 两个 -C：先在项目根打包 backend 目录，再切到 deploy/ 把运维脚本打到包内根目录，
# 解压后正好是 ~/ppsd-26/app/backend/ + ~/ppsd-26/app/*.sh 这个布局
tar czf "$tmp\ppsd-backend.tar.gz" --exclude="backend/.env" --exclude="__pycache__" -C $root backend -C "$root\deploy" start.sh stop.sh restart.sh autostart.sh check-assets.sh

Write-Host "[3/4] 打包数据（raw + derived + 抓取的 initiator + samples）"
# -C 切到 data 目录再指定要打的内容，包内路径就是 raw/... derived/... 这样
# samples/ 里有物种系统发育树 JSON（进化树页面要用），后端会在 data/samples/ 里找它
# 注意不包括 data/reference（15G 的老站资料，灌库和跑服务都用不到）
tar czf "$tmp\ppsd-data.tar.gz" -C "$root\data" raw derived scraped/initiator_scraped.tsv samples

Write-Host "[4/4] 打包前端产物"
tar czf "$tmp\ppsd-dist.tar.gz" -C $root dist

Write-Host ""
Write-Host "完成，三个包在这里："
Get-ChildItem "$tmp\ppsd-*.tar.gz" | Select-Object Name, @{n = 'MB'; e = { [math]::Round($_.Length / 1MB, 2) } }
Write-Host ""
Write-Host "下一步（在 PowerShell 里逐条执行）："
Write-Host "  scp `"$tmp\ppsd-backend.tar.gz`" lab-hj:/home/riceUsers/wjj/ppsd-26/"
Write-Host "  scp `"$tmp\ppsd-data.tar.gz`"    lab-hj:/home/riceUsers/wjj/ppsd-26/"
Write-Host "  scp `"$tmp\ppsd-dist.tar.gz`"    lab-hj:/home/riceUsers/wjj/ppsd-26/"
