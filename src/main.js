import { createApp } from 'vue'
import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'

/* ---------------------------------------------------------------------------
   样式加载顺序（改这里之前先想清楚，顺序会直接影响最终效果）
   1. 字体 —— 本地打包，不走 CDN，断网演示也不会掉字体
   2. Bootstrap 只引 reboot / grid / utilities —— 也就是只当"布局工具"用。
      刻意不引 bootstrap.min.css：它那套按钮、表格、导航的默认样式
      正是让页面显得像"随便套了个模板"的原因，全部由我们自己的组件替代。
   3. tokens → base —— 我们的设计系统，放在最后，保证优先级最高
   --------------------------------------------------------------------------- */
import '@fontsource-variable/inter'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-600.css'
import '@fontsource/space-grotesk/latin-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'

import 'bootstrap/dist/css/bootstrap-reboot.min.css'
import 'bootstrap/dist/css/bootstrap-grid.min.css'
import 'bootstrap/dist/css/bootstrap-utilities.min.css'

import './styles/tokens.css'
import './styles/base.css'

import App from './App.vue'
import HomeView from './views/HomeView.vue'
import BrowseView from './views/BrowseView.vue'
import LocusDetailView from './views/LocusDetailView.vue'
import PhasiRnaView from './views/PhasiRnaView.vue'
import SearchView from './views/SearchView.vue'
import DownloadView from './views/DownloadView.vue'
import BlastView from './views/BlastView.vue'
import AtlasView from './views/AtlasView.vue'
import HelpView from './views/HelpView.vue'
import { setLocale, locale } from './i18n/index.js'

/* 每个路径对应原站的一个页面：
     /                     index.php              首页
     /browse/:species?     browse.php             某物种的 PHAS loci 列表
     /locus/:id            single_cluster.php     单位点详情
     /phasi-rna/:id        single_phasiRNA.php    单条 phasiRNA 详情
     /search               search.php             检索
     /blast                blast.php              BLAST 序列比对
     /atlas                （新站新增）            统计图鉴
     /download             download.php           批量下载
     /help                 help.php               帮助 */
/* 单文件演示版走 file:// 协议，history 模式不可用，改用 hash 路由 */
const isDemo = import.meta.env.VITE_STATIC_DEMO === '1'

const router = createRouter({
    history: isDemo ? createWebHashHistory() : createWebHistory(),
    routes: [
        { path: '/', name: 'home', component: HomeView },
        { path: '/browse/:species?', name: 'browse', component: BrowseView },
        { path: '/locus/:id', name: 'locus', component: LocusDetailView },
        { path: '/phasi-rna/:id', name: 'phasi-rna', component: PhasiRnaView },
        { path: '/search', name: 'search', component: SearchView },
        { path: '/blast', name: 'blast', component: BlastView },
        { path: '/atlas', name: 'atlas', component: AtlasView },
        { path: '/download', name: 'download', component: DownloadView },
        { path: '/help', name: 'help', component: HelpView },
        { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
    scrollBehavior: () => ({ top: 0 }),
})

// 首次进入时把 <html lang> 同步一次，之后由 setLocale 负责
setLocale(locale.value)

createApp(App).use(router).mount('#app')
