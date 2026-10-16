<!--一个前端小程序 Rattry Wu 26.8.10-->

<script setup>

    import { ref,watch } from "vue";
    /*watch 是监听器*/
    const inputext=ref("");
    const click=ref(false);
    const todos=ref([
        {id:1,text:'DNA storage',done:false}
    ]) /*书写习惯：只有JS代码有复数的概念，需要+s，后面调用的时候变成todo.id、todo.text、todo.done*/
    const totid=ref(1);

    function Add(text){
        todos.value.push({id:++totid.value,text,done:false});
        /*理论上可以不加 text:text,但是 ++totid.value 是一个表达式，就必须加上 id:*/
        inputext.value="";
    }
    function Delete(id){
        let index=-1;
        for (let i=0;i<todos.value.length;i++){
            if (todos.value[i].id === id){ index=i; break; }
        }
        /* 更简便的写法：
        const index=todos.value.findIndex(i => i.id === id);
        意思就是 i 是 todos 的遍历，如果 i.id === id 条件达成就返回 i
        i 等于 todos.value[i]
        */
        if (index !== -1) { todos.value.splice(index,1) } /*在 index 位置删除一个项*/
        /*注意不需要把 totid 给--*/
    }

    watch(inputext,ifchanged); /*监听，如果 inputext 变化就输出 changed，注意前面要 import*/
    function ifchanged(a,b){  /*可以不用输入，如果有输入即 a 为原来的值，b 为改变后的值（如果一个就默认是新值）*/
        console.log(a,"->",b);
    }
    /* 深度监听
    如果 const inputext = ref({
        text: "Lover";    
    })，那 inputext 是一直都不会改变的，因为只是 inputext.text 改变了
    当然下面的 v-model="inputext.text" 完成双向绑定
    这个是函数就要写成 watch(inputext,ifchanged,{deep:true}), 深度监听才能看到 .text 的变化
    */

    import { defineProps,defineEmits } from "vue";
    const props = defineProps(['text']);
    /*主程序传入组件的变量*/
    const emits = defineEmits(['ok']);
    /*子往父，不太会*/
</script>

<template>

    <!--展示器 v-show
    可以设置 v-show="bool", const bool = ref('true');
    注意，bool = false, 空字符串"", 数字0 都默认不会展示

    v-show 的隐藏本质是给所有的元素、盒子都变为透明的（实体还在）
    v-if 也可以隐藏，但是会直接删除所有的元素、盒子
    -->
    <div class="whitebox">
        <div class="title">{{props.text}}</div>
        <div class="seekbox sameline">
            <input 
                v-model="inputext" 
                type="text" 
                class="inputbox cousinbox cousintext" 
                placeholder="Typein..." 
            />
            <div 
                @click="Add(inputext)" 
                class="clickbox cousinbox cousintext" 
                style="color: azure; font-weight: 900;"
            >
                add todo
            </div>
        </div>
        <div class="cousintodolist">
        <div
            v-for="todo in todos" 
            class="todolistbox"
        > <!--for循环遍历元素-->
            <div>
                <span>&nbsp;&nbsp;&nbsp;</span>
                <input v-model="todo.done" type="checkbox" /> <span>&nbsp;</span>
                <span :class="[todo.done ? 'completedtext' : '']">{{ todo.text }}</span>
            </div>
            <div>
                <button @click="Delete(todo.id)" class="todolistbutton">Del</button>
                <span>&nbsp;&nbsp;&nbsp;</span>
            </div>
        </div>
    </div>
    </div>

</template>

<style>
    
    body {
        margin: 0;
        background-color: rgb(40, 39, 29);
    }

    .whitebox {
        /*顺序：大小、位置、形状。后面在放内嵌的*/
        width: 90%; 
        height: 4000px;
        box-sizing: border-box;
        margin-left: 5%;
        margin-top: 30px;
        border-radius: 8px;
        background-color: antiquewhite;

        padding-top:20px;
    }

    .title {
        font-size: 20px;
        font-weight: 900; /*1000是超粗*/
        text-align: center; /*vue可能自动会挂这一条，所以不写也会居中*/
        color: black;
        font-family: 'Times New Roman', Times, serif; /*会从左到右一个一个试*/
        font-style: italic;
    }

    .seekbox{
        width: 80%;
        height: 60px;
        margin-top: 10px;
        margin-left: 10%;
        border-radius: 8px;
        background-color: rgb(250, 250, 250);

        padding-top: 4px;
    }

    .sameline{
        display: flex;
        gap: 1%; /*用 sameline 渲染的间隔*/
    }

    .cousinbox{
        height: 54px;
        border-radius: 8px;
    }

    .cousintext{
        font-size: 15px;
        color: black;
    }

    .inputbox{
        width: 73%;
        margin-left: 1%;
        background-color: #ffff;
        border: 1px solid rgb(196, 192, 192);
        padding: 0; /*只有这样才能和其他 cousinbox 保持一样，意思是取消内边距*/
        padding-left: 3%; /*目的是让“请输入文字”往右移*/
    }

    .clickbox{
        width: 24%;
        margin-right: 1%;
        border: 1px solid grey;
        display: flex;
        align-items: center;
        justify-content: center;
        /*这三句话是最稳妥的，所有东西都会居中。如果只有一行文字，行距=box_height也可以*/
        background: linear-gradient(
            135deg,
            #667eea 0%,
            #4b4ea2 30%,
            #9b83c7 60%,
            #7c6bb9 100%
        );
    }

    .cousintodolist{
        width: 80%;
        margin-top: 15px;
        margin-left: 10%;
    }

    .todolistbox{
        height: 50px;
        border-radius: 8px;
        background-color: rgb(250,250,250);
        box-shadow: grey 0px 2px 5px;
        color: black;
        margin-top: 10px;

        display: flex;
        align-items: center;
        justify-content: space-between;
        box-sizing: border-box;
    }

    .completedtext{
        text-decoration: line-through;
        color: rgb(168, 168, 168);
    }

    .todolistbutton{
        background: transparent;
        border: none; /*浏览器内置的 button 是有样式的*/
        color: red;
        font-weight: 800;
    }

</style>