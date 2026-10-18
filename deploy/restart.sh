#!/bin/bash
# ===========================================================================
# 重启 PPSD 后端（改完配置、换完数据、或者发现它不响应时用这个）
#
# 用法： bash ~/PPSD/restart.sh
#
# 做三件事：停 → 等 2 秒让端口释放 → 后台启动 → 等 3 秒 → 打一次健康检查
# ===========================================================================
set -uo pipefail

PPSD_HOME="$(cd "$(dirname "$0")" && pwd)"

echo "① 停止旧进程"
bash "$PPSD_HOME/stop.sh"

# 端口释放需要一点时间，太急会报 EADDRINUSE（地址已被占用）
sleep 2

echo "② 后台启动"
nohup bash "$PPSD_HOME/start.sh" > "$PPSD_HOME/backend.log" 2>&1 &

echo "③ 等它起来，然后做健康检查"
sleep 4
curl -s --max-time 15 http://localhost:3618/api/health
echo
