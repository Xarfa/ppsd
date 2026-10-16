/**
 * 单文件演示版构建配置。
 *
 * 用法：npm run build:demo
 * 产物：dist-demo/index.html（所有 JS/CSS/数据内嵌成一个 HTML，双击即用）
 *
 * 与普通构建的差异：
 *   1. vite-plugin-singlefile 把产物全部内联（无外链资源）
 *   2. VITE_STATIC_DEMO=1 → 前端不请求后端，改用 src/demo/mockApi.js 内嵌数据
 *   3. 路由用 createWebHashHistory（file:// 协议下 history 模式不可用）
 *   4. base: './' → 相对路径，任何目录打开都正常
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  base: './',
  plugins: [vue(), viteSingleFile()],
  define: {
    'import.meta.env.VITE_STATIC_DEMO': JSON.stringify('1'),
  },
  build: {
    outDir: 'dist-demo',
    assetsInlineLimit: 100 * 1024 * 1024, // 全部内联
    chunkSizeWarningLimit: 40000,         // 单文件 8MB 左右，别报警
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
})
