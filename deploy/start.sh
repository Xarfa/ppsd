#!/bin/bash
# ===========================================================================
# PPSD 后端启动脚本
#
# 手动启动（前台，看报错用）：  bash ~/ppsd-26/app/start.sh
# 后台启动（日常用这个）：
#     nohup bash ~/ppsd-26/app/start.sh > ~/ppsd-26/app/backend.log 2>&1 &
# 看日志：  tail -f ~/ppsd-26/app/backend.log
# 停止：    pkill -f "[n]ode src/server.js"
#
# 环境变量逐个解释：
#   PATH          让 node 指向家目录的 Node 22（系统自带的 14 跑不了本项目）
#   PPSD_DB_DRIVER  pglite = 用 WASM 版 PostgreSQL，数据就在下面那个目录里，
#                 不需要服务器上任何数据库账号
#   PGLITE_DIR    数据库文件的落地目录（备份数据库 = 备份这个目录）
#   PORT          监听端口。3615/3616/3617 已被其他站占用，所以用 3618
#   PPSD_*_DIR    老站资产目录（BLAST / tplot / JBrowse），只读引用，不拷进项目
# ===========================================================================
set -euo pipefail

# 脚本自己所在的目录就是项目根（这样解压到别的路径也能直接跑）
PPSD_HOME="$(cd "$(dirname "$0")" && pwd)"

# Node 22 放在哪：家目录的 env/node22 或 node22，两个常见位置都探一下，
# 找不到就明确报错（而不是让 node 命令静默用上系统那个 14 版）
NODE_HOME=""
for candidate in "$HOME/env/node22" "$HOME/node22"; do
    if [ -x "$candidate/bin/node" ]; then
        NODE_HOME="$candidate"
        break
    fi
done
if [ -z "$NODE_HOME" ]; then
    echo "错误：没找到 Node 22（找过 ~/env/node22 和 ~/node22）" >&2
    echo "      把 Node 22 解压到家目录下（env/node22 或 node22），或改这个脚本" >&2
    exit 1
fi

export PATH="$NODE_HOME/bin:$PATH"
export PPSD_DB_DRIVER=pglite
export PGLITE_DIR="$PPSD_HOME/pgdata"
export PORT=3618

# 老站静态资产只读引用（省 3.3G JBrowse / 2.5G tplot / 749M BLAST）
# 不在服务器上时不要设，留给后端自动探测本地 data/reference
if [ -d /home/www/html/PPSD_zby ]; then
    export PPSD_BLAST_DIR="${PPSD_BLAST_DIR:-/home/www/html/PPSD_zby/blast}"
    export PPSD_TPOT_DIR="${PPSD_TPOT_DIR:-/home/www/html/PPSD_zby/tplot}"
    export PPSD_JBROWSE_DIR="${PPSD_JBROWSE_DIR:-/home/www/html/PPSD_zby/JBrowse/jbrowse}"
fi

cd "$PPSD_HOME/backend"
exec node src/server.js
