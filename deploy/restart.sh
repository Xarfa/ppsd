#!/bin/bash
# ===========================================================================
# 重启 PPSD 后端（改完配置、换完数据、或者发现它不响应时用这个）
#
# 用法： bash ~/ppsd-26/app/restart.sh
#
# 做三件事：停 → 等 2 秒让端口释放 → 后台启动 → 轮询健康检查
# （pglite 启动/恢复可能要几十秒，所以健康检查最多等 60 秒）
# ===========================================================================
set -uo pipefail

PPSD_HOME="$(cd "$(dirname "$0")" && pwd)"

echo "① 停止旧进程"
bash "$PPSD_HOME/stop.sh"

# 端口释放需要一点时间，太急会报 EADDRINUSE（地址已被占用）
sleep 2

echo "② 后台启动"
nohup bash "$PPSD_HOME/start.sh" > "$PPSD_HOME/backend.log" 2>&1 &

echo "③ 等它起来，然后做健康检查（最多 60 秒）"
for _ in $(seq 1 30); do
    out="$(curl -s --max-time 3 http://localhost:3618/api/health 2>/dev/null || true)"
    if [ -n "$out" ]; then
        echo "$out"
        exit 0
    fi
    sleep 2
done

echo "健康检查超时。看日志：tail -50 $PPSD_HOME/backend.log" >&2
exit 1
