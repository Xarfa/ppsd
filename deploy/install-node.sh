#!/bin/bash
# ===========================================================================
# 在服务器上装 Node 22（不需要 root，装在家目录）
#
# 前提：把 node-v22.23.3-linux-x64-glibc217.tar.gz 上传到 ~
#
# ⚠️ 为什么不能用 Node 官网的常规 Linux 包：
#   本站是 Ubuntu 16.04，系统的 glibc 版本是 2.23，
#   而 Node 18 以后的官方二进制要求 glibc ≥ 2.28，直接运行会报
#       version `GLIBC_2.28' not found
#   所以要用 Node 官方团队维护的 unofficial-builds 里带 glibc-217 标记的包：
#   https://unofficial-builds.nodejs.org/download/release/v22.23.3/node-v22.23.3-linux-x64-glibc-217.tar.gz
#   （同一版本号、同一份源码，只是用老 glibc 重新编译）
# ===========================================================================
set -euo pipefail

TARBALL="$HOME/node-v22.23.3-linux-x64-glibc217.tar.gz"

if [ ! -f "$TARBALL" ]; then
    echo "找不到 $TARBALL —— 先在 Windows 上执行："
    echo "  scp \$env:TEMP\\node-v22.23.3-linux-x64-glibc217.tar.gz lab-hj:/home/riceUsers/wjj/"
    exit 1
fi

cd "$HOME"
tar xf "$TARBALL"

# 解压出来的目录名带 -glibc-217 后缀，改成短的 node22 方便引用
[ -d node-v22.23.3-linux-x64-glibc-217 ] && mv node-v22.23.3-linux-x64-glibc-217 node22

echo "=== 验证 ==="
"$HOME/node22/bin/node" -v
echo "（看到 v22.23.3 就成功了；如果报 GLIBC 错误，说明拿错了包）"
