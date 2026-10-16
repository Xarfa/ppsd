<!--一个前端小程序 Rattry Wu 26.8.10-->
<!--其余程序已经按照组件的形式写入 .components/button.vue-->

<script setup>
import mybutton from "./button.vue" /*引用组件*/
</script>

<template>
    <mybutton text="title from mainprogram"> <!--直接一个块就可以调用所有的 js,css,html-->
    </mybutton> <!--创建多个就可以有多个-->
</template>

<style>
</style>