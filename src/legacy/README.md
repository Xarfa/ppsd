# legacy/ —— 学习痕迹，不参与构建

这里存放 2026 年 8 月从零学 Web 开发时的练习文件，**没有任何入口引用它们**，
`npm run dev` / `npm run build` 都不会碰这个目录。保留它们是故意的 ——
这个项目的初衷就是学习过程本身，这些文件记录了起点：

| 文件 | 日期 | 说明 |
|---|---|---|
| `App 8.10.vue` | 08-10 | 第一个 Vue 练习：组件化调用 todo 示例 |
| `App 8.24.vue` | 08-24 | 加了 axios 调 Laf 云函数的版本（本身有 bug：模板用了 `props.text` 但没定义 props，且挂载即请求可能已失效的云函数——正是它导致当时构建失败，才重写了 `src/App.vue`） |
| `button.vue` | 08 月 | 手写 todo 组件，带大量中文注释 —— 最完整的 CSS/JS 学习笔记 |
| `HelloWorld.vue` | — | Vite 脚手架残留 |
| `style.css.vite-default.bak` | 09-25 | 被 `src/style.css` 替换掉的 Vite 默认样式备份 |

要看当前应用，去 `../` —— `src/App.vue` 是唯一入口。
