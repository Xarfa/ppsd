<!-- 全局 Toast 气泡（复制成功等瞬时反馈），消息来自 utils/ui.js 的 toast() -->
<script setup>
import { toasts } from '../utils/ui.js'
</script>

<template>
    <div class="toasts" aria-live="polite">
        <TransitionGroup name="toast">
            <div v-for="t in toasts" :key="t.id" class="toast">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                </svg>
                {{ t.message }}
            </div>
        </TransitionGroup>
    </div>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.25s var(--ease-out); }
.toast-enter-from { opacity: 0; transform: translateY(10px); }
.toast-leave-to { opacity: 0; transform: translateY(4px); }
</style>
