<!--
    Hero 主视觉 —— "RNA 相位切割 + 测序热图" 动画。

    讲的就是 PPSD 的生物学本身：
      ① 上面是一条双链 RNA（backbone + base pairs），一把金色扫描线从左到右
         每到一个相位位点就"切"一段 —— 被切下的片段上浮并标注 21 nt，
         这就是 phased siRNA 的产生过程；
      ② 下面是一块呼吸的 sRNA-seq 读数热图（绿=背景表达，金=高信号），
         代表这些 siRNA 被测序读到、被降解组验证。
    纯 SVG + CSS 动画，尊重 prefers-reduced-motion（静止显示终态）。
-->
<script setup>
// 8 个相位片段（对应 8 个物种是巧合的巧合，但并不妨碍）
const SEGS = 8
const SEG_W = 65
const X0 = 20
const segs = Array.from({ length: SEGS }, (_, i) => i)

// 双链之间的碱基对横杆
const rungs = Array.from({ length: 42 }, (_, i) => 26 + i * 12)

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
        viewBox="0 0 560 400"
        fill="none"
        aria-hidden="true"
    >
        <!-- ===== 上：PHAS 转录本 → 相位切割 ===== -->
        <text x="20" y="34" class="sirna-art__label">PHAS transcript → 21-nt phased siRNAs</text>

        <!-- 双链 backbone -->
        <line x1="20" y1="88" x2="540" y2="88" class="sirna-art__backbone" />
        <line x1="20" y1="128" x2="540" y2="128" class="sirna-art__backbone" />
        <!-- 碱基对 -->
        <line
            v-for="(x, i) in rungs"
            :key="'r' + i"
            :x1="x" y1="88" :x2="x" y2="128"
            class="sirna-art__rung"
        />

        <!-- 相位片段：被扫描线切到就上浮 -->
        <g
            v-for="i in segs"
            :key="'s' + i"
            class="sirna-art__seg"
            :style="{ animationDelay: ((i - 1) * 0.9) + 's' }"
        >
            <rect
                :x="X0 + (i - 1) * SEG_W + 3"
                y="62"
                :width="SEG_W - 6"
                height="56"
                rx="9"
            />
            <text
                :x="X0 + (i - 1) * SEG_W + SEG_W / 2"
                y="52"
                text-anchor="middle"
                class="sirna-art__nt"
            >21 nt</text>
        </g>

        <!-- 金色扫描线（切割复合物） -->
        <g class="sirna-art__scythe">
            <line x1="0" y1="44" x2="0" y2="148" />
            <circle cx="0" cy="108" r="5" />
        </g>

        <!-- ===== 下：sRNA-seq 读数热图 ===== -->
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

.sirna-art__backbone {
    stroke: var(--c-hero-accent, #7fd6ac);
    stroke-opacity: 0.55;
    stroke-width: 2.5;
    stroke-linecap: round;
}
.sirna-art__rung {
    stroke: var(--c-hero-accent, #7fd6ac);
    stroke-opacity: 0.2;
    stroke-width: 1.5;
}

/* 片段：默认贴在双链上（低透明度），被"切"到后上浮、变亮 */
.sirna-art__seg rect {
    stroke: var(--c-hero-accent, #7fd6ac);
    fill: rgba(127, 214, 172, 0.07);
    stroke-width: 1.5;
    animation: sirna-cut 9s var(--ease, ease) infinite;
    transform: translateY(0);
    transform-box: fill-box;
    transform-origin: center;
}
.sirna-art__seg text {
    font-family: var(--font-mono);
    font-size: 11px;
    fill: var(--c-hero-accent, #7fd6ac);
    opacity: 0;
    animation: sirna-label 9s linear infinite;
}
@keyframes sirna-cut {
    0%   { transform: translateY(0); }
    9%   { transform: translateY(-18px); }
    60%  { transform: translateY(-18px); }
    74%  { transform: translateY(0); }
    100% { transform: translateY(0); }
}
@keyframes sirna-label {
    0%, 6%   { opacity: 0; }
    14%, 62% { opacity: 0.95; }
    74%,100% { opacity: 0; }
}

/* 扫描线从左到右，节奏与片段的切割延迟一致 */
.sirna-art__scythe {
    animation: sirna-sweep 9s linear infinite;
}
.sirna-art__scythe line {
    stroke: var(--c-sp-zma, #e3a63b);
    stroke-width: 1.5;
    stroke-dasharray: 4 5;
    opacity: 0.9;
}
.sirna-art__scythe circle {
    fill: var(--c-sp-zma, #e3a63b);
    filter: drop-shadow(0 0 6px rgba(227, 166, 59, 0.8));
}
@keyframes sirna-sweep {
    from { transform: translateX(20px); }
    to   { transform: translateX(540px); }
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
    .sirna-art__seg rect { animation: none; opacity: 0.8; transform: none; }
    .sirna-art__seg text { animation: none; opacity: 0.85; }
    .sirna-art__scythe { animation: none; transform: translateX(280px); }
    .sirna-art__cell { animation: none; opacity: 0.3; }
    .sirna-art__cell--gold { opacity: 0.75; }
}
</style>
