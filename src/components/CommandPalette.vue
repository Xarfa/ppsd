<!--
    全局命令面板（Ctrl+K）—— 数据库手感的 flagship 交互。

    一个输入框，同时搜索：
      · 站内页面（静态）
      · 8 个物种（直达 Browse）
      · 数据库记录：locus / phasiRNA / 基因号 / 转录本 / miRNA（走 /api/search 全类型）
    ↑↓ 选择、回车跳转、Esc 关闭，完全键盘可用。
-->
<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { t } from '../i18n/index.js'
import api, { speciesName } from '../api/ppsd.js'
import { speciesColor } from '../utils/echarts.js'

const props = defineProps({
    open: { type: Boolean, default: false },
    species: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'open'])

const router = useRouter()
const query = ref('')
const results = ref([])
const searching = ref(false)
const active = ref(0)
const inputEl = ref(null)
const listEl = ref(null)

let debounceTimer = null

/* ---------- 候选项 ---------- */
const pages = computed(() => [
    { kind: 'page', icon: '⌂', label: t('nav.home'), to: '/' },
    { kind: 'page', icon: '☰', label: t('nav.browse'), to: '/browse/osa' },
    { kind: 'page', icon: '⌕', label: t('nav.search'), to: '/search' },
    { kind: 'page', icon: '⎇', label: t('nav.blast'), to: '/blast' },
    { kind: 'page', icon: '◔', label: t('nav.stats'), to: '/atlas' },
    { kind: 'page', icon: '⭳', label: t('nav.download'), to: '/download' },
    { kind: 'page', icon: '?', label: t('nav.help'), to: '/help' },
])

const speciesItems = computed(() =>
    props.species.map((sp) => ({
        kind: 'species',
        abbr: sp.abbr,
        label: speciesName(sp),
        sub: sp.scientific_name,
        to: `/browse/${sp.abbr}`,
    })),
)

/* 静态项（页面 + 物种）按关键词过滤 */
const staticItems = computed(() => {
    const q = query.value.trim().toLowerCase()
    const hit = (item) =>
        !q ||
        item.label.toLowerCase().includes(q) ||
        (item.sub && item.sub.toLowerCase().includes(q)) ||
        (item.abbr && item.abbr.toLowerCase().includes(q))
    return [...pages.value.filter(hit), ...speciesItems.value.filter(hit)]
})

/* 数据库动态结果 */
const dbItems = computed(() =>
    results.value.map((r) => ({
        kind: 'db',
        dbKind: r.kind,
        id: r.id,
        label: r.mirna && r.kind === 'mirna' ? `${r.mirna} → ${r.id}` : r.id,
        sub: [speciesName(r), r.chromosome ? `chr${r.chromosome}` : null, r.annotation].filter(Boolean).join(' · '),
        to: r.kind === 'locus' ? `/locus/${encodeURIComponent(r.id)}` : r.kind === 'phasiRNA' ? `/phasi-rna/${encodeURIComponent(r.id)}` : null,
        /* 非直连结果要带上下文去检索页：miRNA 用 miRNA 名查，gene/transcript 用 ID 查 */
        searchQ: r.kind === 'mirna' ? r.mirna : r.id,
        searchType: r.kind === 'mirna' ? 'mirna' : r.kind === 'gene' ? 'gene' : r.kind === 'transcript' ? 'transcript' : 'locus',
        species: r.species,
    })),
)

const flatItems = computed(() => [...staticItems.value, ...dbItems.value])

/* 分组视图：静态项按 kind 分组，db 项一组 */
const groups = computed(() => {
    const g = []
    const pg = flatItems.value.filter((i) => i.kind === 'page')
    const sp = flatItems.value.filter((i) => i.kind === 'species')
    const db = flatItems.value.filter((i) => i.kind === 'db')
    if (pg.length) g.push({ key: 'pages', label: t('palette.group.pages'), items: pg })
    if (sp.length) g.push({ key: 'species', label: t('palette.group.species'), items: sp })
    if (db.length) g.push({ key: 'db', label: t('palette.group.other'), items: db })
    return g
})

function indexOf(item) {
    return flatItems.value.indexOf(item)
}

/* ---------- 动态搜索 ---------- */
watch(query, (q) => {
    clearTimeout(debounceTimer)
    if (q.trim().length < 2) {
        results.value = []
        searching.value = false
        return
    }
    searching.value = true
    debounceTimer = setTimeout(async () => {
        try {
            const d = await api.search({ q: q.trim(), type: 'all', limit: 8 })
            results.value = d.rows || []
        } catch {
            results.value = []
        } finally {
            searching.value = false
        }
        active.value = 0
    }, 260)
})

watch(
    () => props.open,
    async (v) => {
        if (v) {
            query.value = ''
            results.value = []
            active.value = 0
            await nextTick()
            inputEl.value && inputEl.value.focus()
        }
    },
)

function move(delta) {
    const n = flatItems.value.length
    if (!n) return
    active.value = (active.value + delta + n) % n
    nextTick(() => {
        const itemEl = listEl.value?.querySelector('.cmdk__item.is-active')
        itemEl && itemEl.scrollIntoView({ block: 'nearest' })
    })
}

function go(item) {
    if (!item) return
    emit('close')
    if (item.to) {
        router.push(item.to)
    } else if (item.kind === 'db') {
        // 基因号 / 转录本 / miRNA 不是位点 ID —— 带上正确的检索类型去 Search 页
        router.push({
            path: '/search',
            query: {
                q: item.searchQ || item.label,
                type: item.searchType,
                ...(item.species ? { species: item.species } : {}),
            },
        })
    }
}

function onEnter() {
    go(flatItems.value[active.value])
}

function onKeydown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Enter') { e.preventDefault(); onEnter() }
    else if (e.key === 'Escape') { emit('close') }
}

/* 全局快捷键：Ctrl/⌘+K，以及非输入状态下的 "/" */
function globalKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        emit(props.open ? 'close' : 'open')
    } else if (e.key === '/' && props.open === false) {
        const tag = document.activeElement?.tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
            e.preventDefault()
            emit('open')
        }
    }
}

onMounted(() => window.addEventListener('keydown', globalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', globalKey))
</script>

<template>
    <Teleport to="body">
        <Transition name="cmdk-fade" :duration="{ enter: 200, leave: 120 }">
            <div v-if="open" class="cmdk-backdrop" @mousedown.self="emit('close')">
                <div class="cmdk" role="dialog" aria-modal="true">
                    <div class="cmdk__input">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m20 20-3.5-3.5" />
                        </svg>
                        <input
                            ref="inputEl"
                            v-model="query"
                            :placeholder="t('palette.placeholder')"
                            spellcheck="false"
                            @keydown="onKeydown"
                        />
                        <span class="kbd">Esc</span>
                    </div>

                    <div ref="listEl" class="cmdk__list">
                        <template v-for="g in groups" :key="g.key">
                            <div class="cmdk__group">{{ g.label }}</div>
                            <button
                                v-for="item in g.items"
                                :key="(item.to || item.label) + item.kind"
                                class="cmdk__item"
                                :class="{ 'is-active': indexOf(item) === active }"
                                :data-idx="indexOf(item)"
                                @mouseenter="active = indexOf(item)"
                                @click="go(item)"
                            >
                                <span v-if="item.kind === 'species'" class="dot" :style="{ background: speciesColor(item.abbr) }"></span>
                                <span v-else-if="item.kind === 'page'" style="color: var(--c-text-muted); width: 14px; text-align: center">{{ item.icon }}</span>
                                <span v-else-if="item.dbKind === 'locus'" class="mono" style="color: var(--c-accent)">◈</span>
                                <span v-else-if="item.dbKind === 'phasiRNA'" class="mono" style="color: var(--c-accent)">•</span>
                                <span v-else class="mono" style="color: var(--c-text-muted)">→</span>

                                <span class="cmdk__label" :class="{ mono: item.kind === 'db' }">{{ item.label }}</span>
                                <small v-if="item.sub">{{ item.sub.slice(0, 64) }}</small>
                            </button>
                        </template>
                        <div v-if="searching" class="cmdk__empty">{{ t('state.loading') }}</div>
                        <div v-else-if="!flatItems.length && query.trim()" class="cmdk__empty">{{ t('palette.noResults') }}</div>
                        <div v-else-if="!query.trim() && !flatItems.length" class="cmdk__empty">{{ t('palette.empty') }}</div>
                    </div>

                    <div class="cmdk__foot">
                        <span><span class="kbd">↑</span> <span class="kbd">↓</span> move</span>
                        <span><span class="kbd">↵</span> open</span>
                        <span class="spacer"></span>
                        <span class="dim mono" style="font-size: var(--fs-xs)">PPSD · Ctrl K</span>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.cmdk__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmdk__foot {
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 9px 16px;
    border-top: 1px solid var(--c-border);
    background: var(--c-surface-sunk);
    font-size: var(--fs-xs);
    color: var(--c-text-3);
}
.cmdk-fade-enter-active { transition: opacity 0.18s var(--ease-out); }
.cmdk-fade-enter-active .cmdk { transition: transform 0.18s var(--ease-out), opacity 0.18s var(--ease-out); }
.cmdk-fade-leave-active { transition: opacity 0.12s ease; }
.cmdk-fade-enter-from { opacity: 0; }
.cmdk-fade-enter-from .cmdk { transform: translateY(-8px) scale(0.985); }
.cmdk-fade-leave-to { opacity: 0; }
</style>
