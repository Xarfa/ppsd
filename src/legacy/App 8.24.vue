<!--前后端连接工具 axios Rattry Wu 26.8.24-->

<script setup>

    import axios from 'axios';

    async function getlist() {
        const res=await axios({
            url:"https://q6zv39.laf.run/get_list" ,
            method:"GET"
        })
        console.log(res);
    }
    getlist();

    import { ref,watch } from "vue";
    const inputext=ref("");
    const click=ref(false);
    const todos=ref([
        {id:1,text:'DNA storage',done:false}
    ]) 
    const totid=ref(1);

    function Add(text){
        todos.value.push({id:++totid.value,text,done:false});
        inputext.value="";
    }
    function Delete(id){
        let index=-1;
        for (let i=0;i<todos.value.length;i++){
            if (todos.value[i].id === id){ index=i; break; }
        }
        if (index !== -1) { todos.value.splice(index,1) }
    }


</script>

<template>

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
        >
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
        font-weight: 900; 
        text-align: center; 
        color: black;
        font-family: 'Times New Roman', Times, serif;
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
        gap: 1%;
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
        padding: 0;
        padding-left: 3%; 
    }

    .clickbox{
        width: 24%;
        margin-right: 1%;
        border: 1px solid grey;
        display: flex;
        align-items: center;
        justify-content: center;
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
        border: none; 
        color: red;
        font-weight: 800;
    }

</style>