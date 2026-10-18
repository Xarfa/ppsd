<!--
    T-plot 弹窗：老站点击表格里的图片图标后，在弹窗里显示降解组图。
    这里用 Teleport 挂到 body，避免被卡片的 overflow 裁掉。
-->
<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { t } from '../i18n/index.js'

const props = defineProps({
    open: { type: Boolean, default: false },
    src: { type: String, default: '' },
    title: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const failed = ref(false)

watch(
    () => props.src,
    () => {
        failed.value = false
    },
)

watch(
    () => props.open,
    (v) => {
        document.body.style.overflow = v ? 'hidden' : ''
        if (v) failed.value = false
    },
    { immediate: true },
)

function onKey(e) {
    if (e.key === 'Escape' && props.open) emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => {
    window.removeEventListener('keydown', onKey)
    document.body.style.overflow = ''
})
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="tp-overlay" @click.self="emit('close')">
            <div class="tp-dialog" role="dialog" aria-modal="true" :aria-label="title || t('tplot.title')">
                <div class="tp-head">
                    <span class="tp-title mono">{{ title || t('tplot.title') }}</span>
                    <button type="button" class="tp-close" :aria-label="t('tplot.close')" @click="emit('close')">
                        ×
                    </button>
                </div>
                <div class="tp-body">
                    <img
                        v-if="src && !failed"
                        :src="src"
                        :alt="title || t('tplot.title')"
                        class="tp-img"
                        @error="failed = true"
                    />
                    <div v-if="failed || !src" class="state">{{ t('tplot.missing') }}</div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.tp-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-4);
    background: rgba(8, 20, 14, 0.72);
    backdrop-filter: blur(2px);
}

.tp-dialog {
    display: flex;
    flex-direction: column;
    max-width: min(1100px, 94vw);
    max-height: 92vh;
    overflow: hidden;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--r-lg);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
}

.tp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--c-border);
}

.tp-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--fs-sm);
    font-weight: 600;
}

.tp-close {
    flex: none;
    width: 32px;
    height: 32px;
    border: 1px solid var(--c-border);
    border-radius: var(--r-md);
    background: var(--c-surface-sunk);
    color: var(--c-text-2);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
}

.tp-close:hover {
    color: var(--c-text);
    border-color: var(--c-text-3);
}

.tp-body {
    display: flex;
    justify-content: center;
    padding: var(--sp-3);
    overflow: auto;
    background: var(--c-surface-sunk);
}

.tp-img {
    max-width: 100%;
    max-height: 76vh;
    object-fit: contain;
    background: #fff;
    border-radius: var(--r-sm);
}
</style>
