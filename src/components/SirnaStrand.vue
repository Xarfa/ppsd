<!--
    Hero 主视觉 —— sRNA-seq 读数热图。

    一块呼吸的热图（绿=背景表达，金=高信号），代表 phasiRNA 被测序读到、
    被降解组验证。纯 SVG + CSS 动画，尊重 prefers-reduced-motion（静止显示终态）。
    （2026-10-16 应用户要求删掉了原来的"PHAS transcript → 21-nt 相位切割"动画，
    只留热图。）
-->
<script setup>
// 测序热图：4 行 × 16 列。金色格子按固定位置点出（模拟高信号峰）
const HEAT_COLS = 16
const HEAT_ROWS = 4
const CELL = 27
const heatCells = []
for (let r = 0; r < HEAT_ROWS; r++) {
    for (let c = 0; c < HEAT_COLS; c++) {
        const idx = r * HEAT_COLS + c
        const gold = idx % 11 === 3 || idx % 17 === 7
        heatCells.push({
            x: 24 + c * (CELL + 4),
            y: 208 + r * (CELL + 4),
            gold,
            delay: ((r * 7 + c * 3) % 24) * 0.35,
        })
    }
}
</script>

<template>
    <svg
        class="sirna-art"
        viewBox="0 180 560 170"
        fill="none"
        aria-hidden="true"
    >
        <!-- ===== sRNA-seq 读数热图 ===== -->
        <text x="24" y="196" class="sirna-art__label">sRNA-seq read depth</text>
        <rect
            v-for="(c, i) in heatCells"
            :key="'h' + i"
            :x="c.x"
            :y="c.y"
            :width="CELL"
            :height="CELL"
            rx="5"
            class="sirna-art__cell"
            :class="{ 'sirna-art__cell--gold': c.gold }"
            :style="{ animationDelay: c.delay + 's' }"
        />
    </svg>
</template>

<style scoped>
.sirna-art { width: 100%; height: auto; display: block; }

.sirna-art__label {
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.08em;
    fill: var(--c-hero-dim, #a8bfb2);
    opacity: 0.9;
}

/* 热图：整块呼吸，金色格子脉冲更高 */
.sirna-art__cell {
    fill: var(--c-hero-accent, #7fd6ac);
    opacity: 0.14;
    animation: heat-breathe 7s ease-in-out infinite alternate;
}
.sirna-art__cell--gold { fill: var(--c-sp-zma, #e3a63b); }
@keyframes heat-breathe {
    from { opacity: 0.1; }
    to   { opacity: 0.5; }
}

@media (prefers-reduced-motion: reduce) {
    .sirna-art__cell { animation: none; opacity: 0.3; }
    .sirna-art__cell--gold { opacity: 0.75; }
}
</style>
