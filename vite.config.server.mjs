/**
 * 服务器子路径部署用的构建配置。
 *
 * 用法：npm run build:server
 * 产物：dist/ —— 部署到 http://202.195.250.119/PPSD_new/
 *
 * 与默认配置（vite.config.js，本机开发用）的差异只有两点：
 *   1. base: '/PPSD_new/' —— 静态资源全部走这个子路径。
 *      子路径部署不配 base 会白屏（浏览器按根路径请求 JS/CSS，全部 404）。
 *   2. VITE_API_BASE='/PPSD_new/api' —— 前端不直连后端端口，
 *      而是请求 Apache，由 Apache 反代到后端（见 reports/部署报告-课题组服务器.md）。
 *
 * 改部署路径时同步改这两行，别的地方不用动。
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/PPSD_new/',
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify('/PPSD_new/api'),
  },
})
