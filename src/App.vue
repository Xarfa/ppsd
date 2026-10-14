<!--
    站点外壳 v2 —— 玻璃拟态吸顶导航 + 路由出口 + 页脚。

    v2 新增的全局交互：
      · Ctrl+K / "/" 呼出命令面板（CommandPalette）
      · 复制反馈 Toast（ToastHost）
      · 回到顶部按钮
      · 页面切换过渡
    内容区的三栏结构由各页面自己组织，因为首页的通栏首屏不需要左栏。
-->
<script setup>
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { t, locale, setLocale } from './i18n/index.js'
import api, { speciesName, IS_DEMO } from './api/ppsd.js'
import CommandPalette from './components/CommandPalette.vue'
import ToastHost from './components/ToastHost.vue'
import LogoMark from './components/LogoMark.vue'

const route = useRoute()
const speciesList = ref([])
const paletteOpen = ref(false)
const showBacktop = ref(false)

/** 主菜单 —— 与原站菜单一一对应（顺序同原站：首页/浏览/统计图鉴/检索/序列比对/下载/帮助） */
const navItems = [
    { name: 'home', key: 'nav.home', to: '/' },
    { name: 'browse', key: 'nav.browse', to: '/browse' },
    { name: 'stats', key: 'nav.stats', to: '/stats' },
    { name: 'search', key: 'nav.search', to: '/search' },
    { name: 'blast', key: 'nav.blast', to: '/blast' },
    { name: 'download', key: 'nav.download', to: '/download' },
    { name: 'help', key: 'nav.help', to: '/help' },
]

/** 详情页也算在 browse 板块下，让导航保持高亮 */
const activeName = computed(() => {
    if (route.name === 'locus' || route.name === 'phasi-rna') return 'browse'
    return route.name
})

function onScroll() {
    showBacktop.value = window.scrollY > 480
}

function scrollTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(async () => {
    window.addEventListener('scroll', onScroll, { passive: true })
    try {
        const d = await api.species()
        speciesList.value = d.species
    } catch {
        /* 物种列表拿不到不影响导航本身 */
    }
})

onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
    <!-- 玻璃拟态吸顶导航 -->
    <header class="topbar">
        <div class="page topbar__inner">
            <RouterLink to="/" class="brand">
                <span class="brand__mark">
                    <LogoMark />
                </span>
                <span>
                    <span class="brand__name">PPSD</span>
                    <span class="brand__sub">{{ t('brand.sub') }}</span>
                </span>
            </RouterLink>

            <nav class="nav">
                <RouterLink
                    v-for="item in navItems"
                    :key="item.name"
                    :to="item.to"
                    class="nav__link"
                    :class="{ 'is-active': activeName === item.name }"
                    :aria-current="activeName === item.name ? 'page' : undefined"
                >
                    {{ t(item.key) }}
                </RouterLink>
            </nav>

            <div class="topbar__right rowline" style="gap: var(--sp-2); margin-left: auto">
                <button class="topk" @click="paletteOpen = true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                    </svg>
                    <span class="topk__q">{{ t('palette.placeholder').split('…')[0] }}</span>
                    <span class="kbd topk__kbd">Ctrl K</span>
                </button>

                <div class="seg" role="group" :aria-label="t('common.language')">
                    <button
                        class="seg__btn"
                        :class="{ 'is-active': locale === 'en' }"
                        :aria-pressed="locale === 'en'"
                        @click="setLocale('en')"
                    >
                        EN
                    </button>
                    <button
                        class="seg__btn"
                        :class="{ 'is-active': locale === 'zh' }"
                        :aria-pressed="locale === 'zh'"
                        @click="setLocale('zh')"
                    >
                        中文
                    </button>
                </div>
            </div>
        </div>
    </header>

    <main class="main">
        <!-- :duration 用定时器而不是 transitionend 事件来收尾：
             浏览器在页签被隐藏时不派发过渡事件，事件模式会让页面卡在
             opacity:0（真实踩过的 bug）。定时器在任何可见性下都会触发。 -->
        <RouterView v-slot="{ Component }">
            <Transition name="page" mode="out-in" :duration="{ enter: 280, leave: 120 }">
                <component :is="Component" :key="route.path" />
            </Transition>
        </RouterView>
    </main>

    <footer class="footer">
        <div class="page footer__inner">
            <div class="stack" style="gap: 4px">
                <span class="rowline" style="gap: 8px">
                    <span class="dot" style="background: var(--grad-brand)"></span>
                    <strong style="color: var(--c-text-2)">PPSD</strong>
                    <span class="dim">v2.0 — {{ t('brand.sub') }}</span>
                </span>
                <span>{{ t('footer.data') }} <span class="dim">— cbi.njau.edu.cn/PPSD</span></span>
            </div>
        </div>
    </footer>

    <!-- 演示快照标识（单文件版） -->
    <div v-if="IS_DEMO" class="demo-banner">{{ t('demo.note') }}</div>

    <!-- 全局命令面板 -->
    <CommandPalette
        :open="paletteOpen"
        :species="speciesList"
        @open="paletteOpen = true"
        @close="paletteOpen = false"
    />
    <ToastHost />

    <button class="backtop" :class="{ 'is-show': showBacktop }" :title="t('ux.backTop')" :aria-label="t('ux.backTop')" @click="scrollTop">
        ↑
    </button>
</template>

<style scoped>
.topbar__right .topk { height: 34px; }
.topk__q { font-size: var(--fs-sm); }

/* 演示快照横幅 */
.demo-banner {
    background: var(--c-warn-bg);
    color: var(--c-warn);
    border-top: 1px solid var(--c-warn-border);
    font-size: var(--fs-xs);
    text-align: center;
    padding: 5px var(--sp-4);
}

@media (max-width: 960px) {
    .topk__q, .topk__kbd { display: none; }
    .nav__link { padding: 0 8px; }
    .brand__sub { display: none; }
}
</style>
