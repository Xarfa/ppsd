# PPSD 部署教学：用 Hyper 一步一步放到实验室服务器

> 这份文档是给你（人）看的操作手册，不是给电脑看的脚本。
> 每条命令都拆开讲：**在哪敲、干什么、每个词什么意思、敲完看到什么、出错了怎么办**。
> 建议对照真机操作一遍，明天在老师面前你就是操作的人。
>
> 📌 临时位置说明：因为 E 盘（项目盘）中途掉线，这份文档先写在 C 盘。
> E 盘恢复后把它移回项目里：`PPSD\docs\部署教学-Hyper逐步.md`

---

## 〇、先搞清楚我们在干什么

### 部署完成后长这样

```
老师的浏览器 / 你的浏览器
        │
        │  http://202.195.250.119/PPSD_new/
        ▼
┌──────────────────────────────────────────────┐
│ Apache（服务器上的老牌 Web 服务器，占 80 端口）│
│  规则：凡是 /PPSD_new 开头的请求，             │
│        统统转交给本机 3618 端口 ← 管理员加这行  │
└──────────────────────────────────────────────┘
        │ 转发
        ▼
┌──────────────────────────────────────────────┐
│ 你的 Node 程序（跑在你家目录，占 3618 端口）    │
│  ├─ 页面：~/ppsd-26/app/dist/ 里的 HTML/JS/CSS        │
│  └─ 接口：/api/... 查数据库后返回 JSON          │
└──────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────┐
│ 数据库：~/ppsd-26/app/pgdata/（pglite = WASM 版 PG）  │
│  7760 个 PHAS 位点 / 10 万条 phasiRNA ...      │
└──────────────────────────────────────────────┘
```

一句话：**浏览器 → Apache → 你的 Node 程序 → 数据库**，四层。中间每一层都能单独测。

### 谁做什么（清楚分工，别慌）

| 事情 | 谁做 | 现在的状态 |
|---|---|---|
| 找能在这台老服务器上跑的 Node | 我（环境苦力活） | ✅ 已装好并验证 |
| 打包、上传后端/数据/前端 | 我（环境苦力活） | ✅ 已完成 |
| 灌数据库（54 万行） | 我（环境苦力活） | ✅ 已完成，53 秒 |
| **启动 / 停止 / 重启服务** | **你** ← 学这个 | 第 3~4 课 |
| **验证服务是否正常** | **你** ← 学这个 | 第 5 课 |
| **看日志、排错** | **你** ← 学这个 | 第 5 课 |
| **给老师演示** | **你** ← 学这个 | 第 8 课 |
| Apache 加 4 行转发规则 | 管理员（必须 root） | ⏳ 待协调，第 7 课 |

### ⚠️ 当前状态提醒（部署过程中断点）

部署做到"数据灌完"时，你电脑的 **E 盘（项目所在盘）掉线了**，所以：

- ✅ 已完成：Node 装好、三个包上传解压、54 万行数据灌好（`clusters: 7760` 是证据）
- ⏳ **还差一步**：把后端服务拉起来。`start.sh` 还没传到服务器，所以第 4 课的
  `bash ~/ppsd-26/app/start.sh` 暂时会报"文件不存在"。

**先用这条等价命令启动**（内容与 start.sh 完全一样，直接敲进服务器即可）：

```bash
cd ~/ppsd-26/app/backend && export PATH="$HOME/node22/bin:$PATH" PPSD_DB_DRIVER=pglite PGLITE_DIR="$HOME/ppsd-26/app/pgdata" PORT=3618 && nohup node src/server.js > ~/ppsd-26/app/backend.log 2>&1 & sleep 3; curl -s http://localhost:3618/api/health; echo
```

看到 `"clusters":7760` = 服务起来了。
（后面 E 盘恢复、`start.sh` 传上去之后，就按文档第 4~5 课的短命令用。）

### 为什么 Node 这件事要单独说

服务器是 **Ubuntu 16.04（2016 年的系统）**，基础库 glibc 只有 2.23 版。
而 Node 官方从 18 版开始，预编译的 Linux 包都要求 **glibc ≥ 2.28**。
直接下载官网的 node 包一运行就报：

```
GLIBC_2.28 not found
```

（这就是你试出来"node 装不了"的原因。）

解决法：用 Node 官方团队另外维护的 **unofficial-builds**，
里面有一份 `linux-x64-glibc-217` 变体 —— **同一个版本号（22.23.3）、同一份源码，
只是用老 glibc 重新编译过**，专门给 Ubuntu 16.04 这种老系统用。已经装好了：

```
~/node22/bin/node   ← 以后用的就是这个
```

系统自带的 `/usr/bin/node` 是 14 版，跑不了我们的后端，**任何操作都别用它**。

---

## 第 1 课：连上服务器（ssh）

### 在哪敲

**你的电脑**：打开 Hyper（默认就是 PowerShell）。

### 敲这条

```powershell
ssh lab-hj
```

### 逐字解释

| 部分 | 意思 |
|---|---|
| `ssh` | Secure Shell，帮你开一个"远程命令行"。敲完你键盘输入的内容就发到服务器上执行了 |
| `lab` | 不是网址，是你在 `C:\Users\22345\.ssh\config` 里配好的**别名**。那个文件写着 `lab` 对应 `202.195.250.119` 和用户名 `wjj`，所以不用每次打一长串 |

> 等价完整写法：`ssh wjj@202.195.250.119`，配了别名就省了。

### 敲完会看到

```
wjj@202.195.250.119's password:
```
输入密码（**屏幕上不显示任何字符**，不是卡住了），回车。

然后出现：
```
Welcome to Ubuntu 16.04.7 LTS ...
$
```
看到 `$` 提示符就说明**你已经在服务器里面了**。
从现在起，你敲的每条命令都是在服务器上执行，不是在你的电脑上。

### 前提：VPN 通了

服务器在学校内网（202.195.250.119），必须先打开 **aTrust 客户端**并登录。
`ssh lab-hj` 若 10 秒无反应最后报 `Connection timed out`，八成是 VPN 掉线了。

### 出错了怎么办

| 现象 | 原因 | 处理 |
|---|---|---|
| `Connection timed out` | VPN 没连上 | 重新登录 aTrust |
| `Permission denied` | 密码打错 | 重新 `ssh lab-hj` 再输（注意大小写） |
| `Host key verification failed` | 服务器换过 IP/重装 | 删掉 `C:\Users\22345\.ssh\known_hosts` 里对应那行 |

---

## 第 2 课：先认清"家里"有什么

### 敲这条（在服务器里）

```bash
ls ~/ppsd-26/app
```

### 逐字解释

| 部分 | 意思 |
|---|---|
| `ls` | list，列目录内容 |
| `~` | 你的家目录，即 `/home/riceUsers/wjj`。两者完全等价 |
| `~/ppsd-26/app` | 项目根目录 |

### 应该看到

```
backend  data  dist  start.sh
```

| 目录/文件 | 是什么 |
|---|---|
| `backend/` | 后端程序（Node.js 代码 + 依赖包） |
| `data/` | 原始数据文件（灌库用，也是"下载"页面的文件来源） |
| `dist/` | 前端页面（Vue 打包出来的 HTML/CSS/JS） |
| `start.sh` | **启动脚本**，第 4 课用它 |

再敲这几条，多认识一点：

```bash
ls ~/ppsd-26/app/backend
```
→ `src`（代码）、`node_modules`（依赖包）、`package.json`。

```bash
du -sh ~/ppsd-26/app/pgdata
```
→ 数据库文件占多大。`du` = disk usage，`-s` 总计、`-h` 人类可读单位（M/G）。

```bash
ls ~/node22/bin
```
→ 看到 `node`、`npm`。这就是第 0 课说的那个"能跑"的 Node。

---

## 第 3 课：手动启动后端（第一次，前台跑）

**前台跑** = 程序霸占着命令行窗口，日志直接滚在屏幕上，按 `Ctrl+C` 停。
第一次就用手动方式，因为它最直观：能立刻看出它报不报错。

### 敲这条（在服务器里）

```bash
bash ~/ppsd-26/app/start.sh
```

### 逐字解释

| 部分 | 意思 |
|---|---|
| `bash` | 用 bash 解释器执行脚本文件 |
| `~/ppsd-26/app/start.sh` | 要执行的脚本 |

### 那个脚本里写了什么（你要知道每一行）

打开看：`cat ~/ppsd-26/app/start.sh`。核心 5 行：

```bash
export PATH="$HOME/node22/bin:$PATH"
```
> 把**家目录的 Node 22** 排到 PATH 最前面。
> `PATH` 是"去哪里找命令"的清单，谁排前面用谁。
> 这句让之后敲 `node` 时用的是 22 版而不是系统的 14 版。
> **这句最要紧 —— 忘了它，程序会起不来或行为异常。**

```bash
export PPSD_DB_DRIVER=pglite
```
> 告诉后端："数据库用 pglite 驱动"。
> pglite 是**编译成 WebAssembly 的 PostgreSQL**，一个真数据库，只是不用安装、不用配账号密码 —— 数据就是 `~/ppsd-26/app/pgdata` 那一个目录。
> 这解释了为什么服务器上不需要数据库账号。

```bash
export PGLITE_DIR="$HOME/ppsd-26/app/pgdata"
```
> 数据库文件放哪儿。备份数据库 = 备份这个目录。

```bash
export PORT=3618
```
> 程序监听哪个端口。
> 为什么不是 80：80 被 Apache 占着，而且 1024 以下端口要 root。
> 为什么不是 3000：这台机器上的应用集中在 36xx（3615/3616/3617 已是 SmartRice2、RiceData、RiceSALTNet），我们排 **3618**。

```bash
cd "$HOME/ppsd-26/app/backend"
exec node src/server.js
```
> 进入后端目录（程序要按相对路径找 `../data`、`../dist`），然后启动 `src/server.js`。
> `exec` = 用这个程序替换当前 shell，效果是 Ctrl+C 能干净地停掉它。

### 应该看到

```
PPSD backend 已启动: http://localhost:3618
  数据库驱动: pglite (PostgreSQL/WASM)
  数据库版本: PostgreSQL 18.x ...
```

看到这三行 = **成功**。光标停住不动是正常的（程序在运行，等人访问）。

### 出错了怎么办

| 报错 | 原因 | 处理 |
|---|---|---|
| `GLIBC_2.28 not found` | 用了系统自带的旧 Node | 检查 start.sh 里 PATH 那行在不在 |
| `数据库未就绪 / 先执行 npm run db:load` | 数据库目录丢了 | 找我重跑灌库（约 1 分钟） |
| `EADDRINUSE :3618` | 已经有一个在跑了 | `ps aux \| grep server.js` 找出来，或先 `pkill -f "node src/server.js"` |
| `Cannot find module ...` | node_modules 没传全 | 找我重新打包上传 |

### 停掉它

按 `Ctrl+C`。停掉后回到 `$` 提示符。

---

## 第 4 课：让它在后台一直跑（日常用这个）

演示时你不能一直霸占窗口，也不能关掉终端就断了。
**后台跑** = 程序在你退出终端后继续运行。

### 敲这条（在服务器里）

```bash
nohup bash ~/ppsd-26/app/start.sh > ~/ppsd-26/app/backend.log 2>&1 &
```

### 逐字解释

| 部分 | 意思 |
|---|---|
| `nohup` | no hang up。默认你一断开 ssh，服务器会把你起的程序杀掉；加了它，程序"挂不断"，继续活 |
| `bash ~/ppsd-26/app/start.sh` | 启动那个脚本 |
| `> ~/ppsd-26/app/backend.log` | 把程序的**正常输出**写进日志文件 |
| `2>&1` | 把**错误输出**也倒进同一个文件（`2`=错误流，`1`=正常流，`&1`=跟正常流走同一个地方）。不加这句，报错信息就直接丢了 |
| `&` | 扔到后台，命令行立刻还给你 |

### 敲完会看到

```
[1] 12345
```
`[1]` 是任务编号，`12345` 是进程号（PID）。提示符马上回来。

### 立刻验证它真的活着（每次启动都做）

```bash
curl http://localhost:3618/api/health
```

| 部分 | 意思 |
|---|---|
| `curl` | 命令行浏览器，帮你发 HTTP 请求并把返回内容打印出来 |
| `http://localhost:3618` | 本机的 3618 端口。`localhost` = 127.0.0.1 = 这台服务器自己 |
| `/api/health` | 后端专门留的"体检"接口 |

**应该返回**：

```json
{"ok":true,"driver":"pglite (PostgreSQL/WASM)","database":"PostgreSQL 18...","clusters":7760}
```

`"clusters":7760` = 数据库里有 7760 个 PHAS 位点，说明**数据库也是通的**。

### 再验一条"有真实数据"的接口

```bash
curl -s "http://localhost:3618/api/species" | head -c 600
```

| 部分 | 意思 |
|---|---|
| `-s` | silent，不显示进度条 |
| `"..."` | URL 带 `?`、`&` 时用引号包起来，防止 shell 自己解释 |
| `\| head -c 600` | `\|` 是管道：前一条的输出喂给后一条；`head -c 600` = 只要前 600 个字符 |

**应该看到** 8 个物种的 JSON（rice/soybean/maize...）。

---

## 第 5 课：日常三件事（看状态、看日志、停/重启服务）

### ① 它还在跑吗？

```bash
ps aux | grep "node src/server.js"
```

| 部分 | 意思 |
|---|---|
| `ps aux` | 列出当前所有进程 |
| `\| grep "..."` | 从这一大堆里筛出含这串字的行 |

有一行（且不含 `grep` 字样）就是活着；只回一行 `grep` 自己就是**没在跑**。

### ② 它在嘀咕什么？（看日志）

```bash
tail -20 ~/ppsd-26/app/backend.log
```
→ 看最后 20 行。`tail` = 看文件结尾（`head` 看开头）。

```bash
tail -f ~/ppsd-26/app/backend.log
```
→ `-f` = follow，**实时滚动**，有人访问网站时这里会不断冒出新行。按 `Ctrl+C` 退出（只退出"看"，不停服务）。

### ③ 重启它（改了配置/数据之后）

```bash
pkill -f "node src/server.js"
```
→ 按名字杀进程。`pkill` = 按条件 kill，`-f` = 匹配完整命令行。

```bash
nohup bash ~/ppsd-26/app/start.sh > ~/ppsd-26/app/backend.log 2>&1 &
curl -s http://localhost:3618/api/health; echo
```
→ 再起来，再验一次。**两步必须连着做**，不然你会以为它还在跑。

> ⚠️ 两个坑：
> 1. `>` 会**覆盖**日志（重来一份），想看历史用 `>>` 追加。
> 2. `pkill` 之后等一两秒再启动，端口释放需要时间，否则报 `EADDRINUSE`。

### 一键重启（记不住就抄这个）

```bash
pkill -f "node src/server.js"; sleep 2; nohup bash ~/ppsd-26/app/start.sh > ~/ppsd-26/app/backend.log 2>&1 & sleep 3; curl -s http://localhost:3618/api/health; echo
```

---

## 第 6 课：从"外面"验证（管理员配完之后）

§4/§5 用的都是 `localhost`，那只证明**服务器自己**能访问。
要让**你、老师、同学的浏览器**能打开，还差 Apache 那层转发。

### 在服务器上验证 Apache 这层

```bash
curl -s http://202.195.250.119/PPSD_new/api/health
```
→ 和 `localhost` 那次返回**同样的 JSON** = Apache 转发正常。

这条挂了但 `localhost:3618` 正常 → 问题在 Apache 配置（找管理员），不在你的程序。

### 在自己的电脑上验证

浏览器打开 `http://202.195.250.119/PPSD_new/`，能看到首页 = **全链路通了**。（电脑要连着 aTrust/VPN。）

### 三层排查口诀（出问题从下往上查）

```
第 3 层 浏览器  →  打不开？→ 查第 2 层
第 2 层 Apache  →  curl .../PPSD_new/api/health → 不动？→ 找管理员
第 1 层 Node    →  curl localhost:3618/api/health → 不动？→ 自己重启（第 5 课）
数据库          →  上面那条里 clusters 是不是 7760 → 不对？→ 找我重灌
```

---

## 第 7 课：需要管理员做的事（转发给老师/师兄的话）

**关键前提**：Apache 配置文件只有 root 能改，`wjj` 账号改不了。
所以这**一步必须管理员做**。
好消息：**只做一次，以后你更新前端、改数据、重启服务，都不用再麻烦他。**

把下面这段原样发给管理员：

> 老师，PPSD 改版的测试环境想放到内网服务器上，后端已经在家目录跑起来了（监听 3618 端口）。
> 麻烦在 `/etc/apache2/sites-enabled/000-default.conf` 的 `</VirtualHost>` 之前加下面这段，
> 然后执行 `apachectl graceful`：
>
> ```apache
> <Location "/PPSD_new">
>     ProxyPreserveHost On
>     ProxyPass http://localhost:3618/
>     ProxyPassReverse http://localhost:3618/
> </Location>
> ```
>
> 作用：把 `http://202.195.250.119/PPSD_new/` 开头的请求转给家目录里那个程序
> （和现有 SmartRice2 / RiceData / RiceSALTNet 一样写法）。
> 不需要建目录、不需要改权限，加 4 行就行。

### 那 4 行分别在说什么

| 行 | 作用 |
|---|---|
| `<Location "/PPSD_new">` | 只对 /PPSD_new 开头的网址生效，**不影响**其他站点 |
| `ProxyPreserveHost On` | 转发时保留浏览器原本的 Host 头（与现有站写法一致） |
| `ProxyPass http://localhost:3618/` | 把 `/PPSD_new` 换成 `/` 后转给 3618。例：`/PPSD_new/api/loci` → `localhost:3618/api/loci` |
| `ProxyPassReverse ...` | 后端返回重定向时，把地址改回带 `/PPSD_new` 的正确形式 |

---

## 第 8 课：明天怎么给老师演示

### 演示前 5 分钟（自己先跑一遍）

```bash
ssh lab-hj
```
```bash
curl -s http://localhost:3618/api/health; echo
```
→ 看到 `"clusters":7760` 就放心了。**没看到先按第 5 课重启。**

### 演示时的三条线（按顺序讲）

**① 先讲"做了什么"**（30 秒，不用开电脑）

> 原来的 PPSD 是 PHP 老站，我把整套界面和接口用 Vue 3 + Node.js + PostgreSQL 重做了一遍。
> 数据逐条从原站公开接口采集、清洗后重新建库：8 个物种、7760 个位点、10 万条 phasiRNA。

**② 再讲"整体链路"**（1 分钟，指着屏幕）

> 这不是静态网页 —— 浏览器请求先到 Apache（80 端口），转发到 Node.js 后端（3618 端口），
> 后端查 PostgreSQL 数据库（WASM 版，跑在我家目录），查完返回给页面。前端、后端、数据库三层都是活的。

（顺手在服务器上敲这条，当场证明后端和数据库真在跑：）
```bash
curl -s http://localhost:3618/api/health; echo
```

**③ 最后演示功能**（3~5 分钟，浏览器操作）

打开 `http://202.195.250.119/PPSD_new/`，按这个顺序点：

| 操作 | 你讲什么 |
|---|---|
| 首页 | "8 个物种的数据量统计，都是从数据库实时聚合出来的" |
| 某个物种（如水稻） | "位点列表，支持分页、排序、按名称搜" |
| 点开一个位点详情 | "序列 + 产生的 phasiRNA + 相位起始因子，三张表关联出来的" |
| 搜索页搜一个 phasiRNA | "跨物种检索" |
| 下载页 | "原始数据文件可直接下载，清单是扫目录实时生成的" |

**如果老师问"数据从哪来"**（大概率会问）：

> 全部来自原站公开接口，脚本采集 + 清洗后重新建库；数据版权属于实验室，
> 这次是内网测试环境，没有对外公开。

### 备选方案（万一管理员没来得及配 Apache）

**方案 B：内网直连端口** —— 浏览器试 `http://202.195.250.119:3618/`
能打开就是通的（后端本身就托管前端页面）。打不开说明端口被网络策略挡了，用方案 C。

**方案 C：静态单文件演示版**（完全不需要服务器配合）
把本地内嵌了数据的单文件 HTML 放到服务器上任何能通过 80 端口访问的目录：

```bash
scp dist-demo/index.html lab-hj:/home/www/html/RiceSALTnet/ppsd-demo.html
```
浏览器打开 `http://202.195.250.119/RiceSALTnet/ppsd-demo.html`。

> 这是**降级方案**：数据是节选快照（165 位点），且放在同事的目录里，只适合救急。
> 演示完记得删掉，并跟目录负责人打招呼。

---

## 附录 A：命令速查（贴便签）

| 我要… | 命令 |
|---|---|
| 连服务器 | `ssh lab-hj` |
| 看后端活着没 | `curl -s http://localhost:3618/api/health; echo` |
| 后台启动 | `nohup bash ~/ppsd-26/app/start.sh > ~/ppsd-26/app/backend.log 2>&1 &` |
| 一键重启 | `pkill -f "node src/server.js"; sleep 2; nohup bash ~/ppsd-26/app/start.sh > ~/ppsd-26/app/backend.log 2>&1 & sleep 3; curl -s http://localhost:3618/api/health; echo` |
| 看实时日志 | `tail -f ~/ppsd-26/app/backend.log` |
| 看进程 | `ps aux \| grep "node src/server.js"` |
| 停服务 | `pkill -f "node src/server.js"` |
| 退出服务器 | `exit` |

## 附录 B：常用词对照

| 词 | 一句话解释 |
|---|---|
| **ssh** | 远程登录：在自己电脑上操作服务器 |
| **端口** | 机器上的"门牌号"。80 是网页默认门（Apache 占着），我们的程序在 3618 |
| **localhost / 127.0.0.1** | "这台机器自己" |
| **Node.js** | 让 JavaScript 脱离浏览器运行的运行环境；后端就是用它写的 |
| **pglite** | PostgreSQL 编译成 WebAssembly 的版本，不用安装，数据就是一个目录 |
| **进程 / PID** | 正在跑的程序实例 / 它的编号 |
| **nohup + &** | 让程序在后台活着，退出终端也不死 |
| **curl** | 命令行里的浏览器，用来发请求、看返回 |
| **Apache / 反向代理** | 服务器上的门房：把外部请求按规则转给内部程序 |
| **base 路径** | 前端打包时告诉浏览器"我的资源在 /PPSD_new/ 下面"，配错会白屏 |

## 附录 C：本次部署的"体检结果"（供你核对）

| 项目 | 结果 |
|---|---|
| 服务器系统 | Ubuntu 16.04.7，glibc 2.23，128 核 / 503G 内存 |
| Node | `~/node22/bin/node` = v22.23.3（glibc-217 兼容构建） |
| 后端 | `~/ppsd-26/app/backend`（Express 5 + pglite 驱动） |
| 数据 | `~/ppsd-26/app/data`（raw 113M / derived 25M / scraped 0.5M） |
| 数据库 | `~/ppsd-26/app/pgdata`，灌入 54 万行，53.5 秒 |
| 灌库结果 | species 8 / clusters 7760 / phas_seq 7760 / phasi_rna 104166 / phasi_rna_target 465863 / initiator 8956 |
| 前端产物 | `~/ppsd-26/app/dist`（base=/PPSD_new/，2.7 MB） |
| 端口 | 3618（3615/3616/3617 已被其他站占用） |
| 待办 | ① 拉起服务（见开头"当前状态提醒"里的应急命令）② `start.sh` 传到服务器 ③ Apache 转发规则（管理员） |
