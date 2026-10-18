#!/bin/bash
# ===========================================================================
# 开机自启用的包装脚本（给 crontab 调用）
#
# 和 start.sh 的区别：start.sh 是"前台运行"（占着终端，Ctrl+C 能停），
# 适合手动测试；这个脚本把它扔到后台并把输出写进日志，适合开机时无人值守地拉起。
#
# 配置方法（服务器上执行一次）：
#   (crontab -l 2>/dev/null; echo "@reboot $HOME/ppsd-26/app/autostart.sh") | crontab -
# 查看是否配上：
#   crontab -l
# 取消：
#   crontab -r
#
# 注意：@reboot 只在服务器重启后触发。平时启动/重启服务还是用 restart.sh。
# ===========================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# 等 30 秒，避开开机时一堆服务同时启动的拥挤（也确保家目录已就绪）
sleep 30

nohup bash "$APP_DIR/start.sh" > "$APP_DIR/backend.log" 2>&1 &
