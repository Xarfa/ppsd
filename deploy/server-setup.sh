#!/bin/bash
# ===========================================================================
# PPSD 服务器端首次部署（在服务器上、ssh 进来之后执行）
#
# 前提：三个 tar 包已经上传到 ~ （见 deploy/pack-local.ps1 的提示）
#       Node 22 已解压到 ~/node22（见 deploy/install-node.sh）
#
# 这个脚本做三件事：解压三个包 → 灌数据库 → 打印结果
# 灌库耗时 1~3 分钟；重复执行是安全的（建表时会先清空再重建）
# ===========================================================================
set -euo pipefail

PPSD_HOME="$HOME/PPSD"
NODE_BIN="$HOME/node22/bin"

echo "=== 1/4 解压后端 ==="
mkdir -p "$PPSD_HOME"
tar xzf "$HOME/ppsd-backend.tar.gz" -C "$PPSD_HOME"

echo "=== 2/4 解压数据 ==="
mkdir -p "$PPSD_HOME/data"
tar xzf "$HOME/ppsd-data.tar.gz" -C "$PPSD_HOME/data"

echo "=== 3/4 解压前端产物 ==="
tar xzf "$HOME/ppsd-dist.tar.gz" -C "$PPSD_HOME"

echo "=== 4/4 灌数据库（pglite：数据库文件落在 \$PPSD_HOME/pgdata）==="
cd "$PPSD_HOME/backend"
export PATH="$NODE_BIN:$PATH"
export PPSD_DB_DRIVER=pglite
export PGLITE_DIR="$PPSD_HOME/pgdata"
export PORT=3618

node src/db/load.js

echo ""
echo "=== 布局检查 ==="
ls -1 "$PPSD_HOME"
echo "下一步：bash ~/PPSD/start.sh   然后 curl http://localhost:3618/api/health"
