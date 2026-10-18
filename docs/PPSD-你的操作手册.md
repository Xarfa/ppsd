# PPSD 部署操作手册（你来操作，我讲解）

> 📌 **这份讲的是"第一次装"**（解压 → 灌库 → 启动 → 验证）。
> **装好之后日常怎么打开、怎么给别人看** → 看 [`PPSD-怎么打开实例.md`](PPSD-怎么打开实例.md)。
>
> ⚠️ **当前状态（2026-10-18）**：服务器上**已经装好，但服务当前是停的**（10-17 收尾时关了）。
> 要演示先运行 `bash ~/ppsd-26/app/restart.sh`。
> 三个部署包已按你的要求清理掉。所以这份手册现在是你将来"换机器 / 重装"时的参考 ——
> 到那时先用 `deploy/pack-local.ps1` 重新打包，再按下面的步骤上传解压。

> **起点**：服务器上已经准备好两样东西，剩下的都由你自己敲 ——
> - `~/env/node22/` —— Node 运行环境（老系统兼容版，已装好验证过，你**不用碰**它）
> - `~/ppsd-26/` 下的三个部署包：`ppsd-backend.tar.gz`、`ppsd-data.tar.gz`、`ppsd-dist.tar.gz`
>
> **你要做的四步**：解压 → 灌数据库 → 启动服务 → 验证。全程约 3 分钟。
> **解压到哪个目录由你定** —— 下文用变量 `$PPSD` 指代它，步骤 1 第一步会教你怎么设。

---

## ⚠️ 先说清楚：会不会影响到师兄师姐的东西

**不会。** 原因是你做的每一步都只在自己的地盘里：

| 你的操作 | 落在哪里 | 影响别人吗 |
|---|---|---|
| 解压三个包 | `$PPSD/`（你自己选的目录，在你自己家目录里） | 不会 |
| 灌数据库 | `$PPSD/pgdata/`（就是个普通目录，不是服务器的数据库） | 不会 |
| 启动服务 | 占用 **3618 端口**（这台机器上的应用都排在 36xx，3615/3616/3617 已被占用，3618 是空号） | 不会 |
| 管理员加的 4 行 | 独立的 `<Location "/PPSD_new">` 段，只对 `/PPSD_new` 开头的网址生效 | 不会，其他站一个字都不动 |

**我们没有、也不会碰 `/home/www/html/` 下任何人的目录**（那是各个师兄师姐的网站文件）。
唯一请求管理员做的事，是在 Apache 配置里**新增** 4 行，不修改、不删除任何现有内容。

---

## 步骤 0：连上服务器

打开 **Hyper**（默认是 PowerShell），敲：

```powershell
ssh lab-hj
```

- `ssh` = 远程登录，敲完你的键盘就"接到"服务器上了
- `lab` = 你在 `C:\Users\22345\.ssh\config` 里配的别名，代表 `202.195.250.119` 上的 `wjj` 账号

输密码（**屏幕上不显示字符**，这是正常的），回车。看到 `$` 提示符就成了。

> 前提：**aTrust 客户端已登录**。如果 10 秒没反应最后报 `Connection timed out`，就是 VPN 掉了。

**下面所有命令都在这个 `$` 后面敲。**

---

## 步骤 1：解压三个包（约 10 秒）

### ① 先定一个变量：你想把项目放在哪

```bash
PPSD=~/ppsd-26/app        # ← 想放哪就改这一行，下面所有命令都跟着走
```

| 部分 | 意思 |
|---|---|
| `PPSD=~/ppsd-26/app` | 定义一个**变量** —— 给"项目要放的路径"起个代号叫 `PPSD`。等号两边**不能有空格** |
| 后面命令里的 `$PPSD` | shell 会自动把它替换成上面那个路径（`$` 就是"取这个变量的值"） |
| 想放别处 | 只改这一行就行，`PPSD=~/myPPSD`、`PPSD=~/ppsd-26/PPSD` 都可以 |

> ⚠️ 变量只在**当前这个 ssh 会话**里有效（断开重连就没了）。重新 `ssh lab-hj` 进来后，要再设一次。
> 好处是：你现在不用决定"永久放哪"，改一行就能换地方。

### ② 敲这三条解压

```bash
mkdir -p $PPSD/data
tar xzf ~/ppsd-26/ppsd-backend.tar.gz -C $PPSD
tar xzf ~/ppsd-26/ppsd-data.tar.gz -C $PPSD/data
tar xzf ~/ppsd-26/ppsd-dist.tar.gz -C $PPSD
```

### 逐条解释

| 命令 | 拆开看 | 作用 |
|---|---|---|
| `mkdir -p $PPSD/data` | make directory `-p` 建立多级目录、已存在也不报错 | 先把"项目目录"和"数据目录"建好 |
| `tar xzf ~/ppsd-26/ppsd-backend.tar.gz -C $PPSD` | `x`=解压 `z`=gzip `f`=指定文件 `-C`=解压到哪个目录 | 解出 `backend/`（程序）和 `start.sh`/`stop.sh`/`restart.sh`（三个脚本） |
| `tar xzf ~/ppsd-26/ppsd-data.tar.gz -C $PPSD/data` | 同上 | 解出 `raw/`、`derived/`、`scraped/`（灌库用的数据） |
| `tar xzf ~/ppsd-26/ppsd-dist.tar.gz -C $PPSD` | 同上 | 解出 `dist/`（前端网页文件） |

> **为什么先打包再传**：`node_modules` 有 1000 多个小文件，VPN 下逐个传要几十分钟；
> 打成单个压缩包传，30 秒搞定，到了服务器一条命令解开。

### 检查一下

```bash
ls $PPSD
```

应该看到：`backend  data  dist  restart.sh  start.sh  stop.sh`

---

## 步骤 2：灌数据库（约 1 分钟，只做一次）

### 先理解这 4 行在干什么

```bash
cd $PPSD/backend
export PATH="$HOME/env/node22/bin:$PATH"
export PPSD_DB_DRIVER=pglite
export PGLITE_DIR="$PPSD/pgdata"
```

| 行 | 意思 |
|---|---|
| `cd $PPSD/backend` | 进入后端目录（程序要从这里找代码） |
| `export PATH="$HOME/env/node22/bin:$PATH"` | **最要紧的一行**。`PATH` 是"去哪里找命令"的清单，这个把家目录的 Node 22 排到最前面，让后面的 `node` 用的是 22 版而不是系统里的 14 版（14 版跑不了这个项目） |
| `export PPSD_DB_DRIVER=pglite` | 告诉程序用 pglite 驱动。**pglite 是把 PostgreSQL 编译成 WebAssembly 的版本**，是个真数据库（PostgreSQL 18），只是不用安装、不用账号密码 —— 数据就是一个目录 |
| `export PGLITE_DIR="$PPSD/pgdata"` | 数据库文件放哪。以后备份数据库 = 打包这个目录，没别的 |

> **这正是"不需要管理员"的原因**：不用碰服务器上的 PostgreSQL（那需要数据库账号，你没有），
> 数据库完全跑在你自己家目录里。

### 敲这条开始灌

```bash
node src/db/load.js
```

> 为什么不是 `npm run db:load`？因为 npm 的启动脚本会去 PATH 里找 `node`，
> 直接 `node` 更可控（而且我们不需要 npm 的任何功能，依赖包已经在包里了）。

### 应该看到（约 1 分钟后）

```
[0.0s] 驱动 = pglite
...
=== 装载结果 ===
  species                   8 行
  clusters               7760 行
  phas_seq               7760 行
  phasi_rna            104166 行
  phasi_rna_target     465863 行
  initiator              8956 行
[53.5s] 完成
```

**看到这 6 个数字就成功了**（我还原过一遍，服务器上实测 53 秒）。
这 6 张表就是整个网站的底料：8 个物种、7760 个 PHAS 位点、10 万条 phasiRNA、46 万条靶基因记录。

> 重复执行这条命令是安全的（会先清表再灌），但没必要 —— 灌一次就行。

---

## 步骤 3：启动服务

### 前台启动（先试这个，直观）

```bash
bash $PPSD/start.sh
```

看到这三行就是成功的：

```
PPSD backend 已启动: http://localhost:3618
  数据库驱动: pglite (PostgreSQL/WASM)
  数据库版本: PostgreSQL 18.3 ...
```

光标停住不动是正常的（程序在运行、等着被访问）。按 **Ctrl+C** 可以停掉。

### 改成后台跑（日常用这个）

按 Ctrl+C 停掉后，敲：

```bash
nohup bash $PPSD/start.sh > $PPSD/backend.log 2>&1 &
```

| 部分 | 意思 |
|---|---|
| `nohup` | "挂不断"—— 默认你断开 ssh 时服务器会杀掉你起的程序，加了它就能一直活着 |
| `bash $PPSD/start.sh` | 启动 |
| `> $PPSD/backend.log` | 把正常输出写进日志文件 |
| `2>&1` | 把错误输出也一起写进去（**不加这句，程序报错你就看不见了**） |
| `&` | 扔后台，命令行立刻还给你 |

---

## 步骤 4：验证

### 第一条：服务活着吗

```bash
curl -s http://localhost:3618/api/health; echo
```

应该返回：

```json
{"ok":true,"driver":"pglite (PostgreSQL/WASM)","database":"PostgreSQL 18.3 ...","clusters":7760}
```

- `curl` = 命令行里的浏览器，发一个请求把返回内容打印出来
- `"clusters":7760` = 数据库里 7760 个位点，说明**程序 + 数据库都通了**

### 第二条：数据接口正常吗

```bash
curl -s "http://localhost:3618/PPSD_new/api/species" | head -c 200; echo
```

应该看到 8 个物种的 JSON（osa 水稻、gma 大豆……）。

> 注意这里的路径带 `/PPSD_new` 前缀 —— 因为前端是按"部署在 /PPSD_new/ 子路径下"构建的，
> 后端我也做了兼容，带前缀、不带前缀两种请求都能处理。

### 第三条：网页能打开吗（在服务器上自测）

```bash
curl -s http://localhost:3618/PPSD_new/ | head -c 300; echo
```

应该返回 HTML（含 `<title>PPSD — Plant Phased siRNA Database</title>`）。

**这三条都过 = 服务器这边的部署完全成功。** 剩下的只是"怎么让浏览器访问到"。

---

## 步骤 5：关键问题 —— 在哪个网址访问？

这是你问的核心问题。有三种方式，**推荐先看方案 B（不需要等任何人）**：

### 方案 A（正式）：`http://202.195.250.119/PPSD_new/`

**前提：管理员在 Apache 配置里加 4 行**（见文末附录，直接转发给他）。

加完之后，任何**连着校园网/VPN 的电脑**打开这个网址都能用 —— 包括导师、师兄师姐。
这是"正式的部署地址"。

**为什么非要有这一步**：外网只能访问服务器的 **80 端口**，而 80 端口是 Apache 在管；
你的服务在 3618 端口，从外面根本看不到。Apache 那 4 行的作用就是"把 /PPSD_new 开头的请求转给 3618"。

> 顺便回答你之前听到的说法 —— "后端放不上去，必须要管理员权限"：
> **说反了**。后端完全放得上去（就在你家目录，不用任何权限）；
> 需要管理员的是"**让外网能访问到**"这一步。后端本身零权限需求。

### 方案 B（保底，不需要管理员）：SSH 隧道

**我已经实测过可行**（服务器允许 ssh 端口转发）。

原理：在你的电脑和服务器之间架一根"私线"，把你电脑上的 8080 端口直接接到服务器的 3618 端口：

```powershell
ssh -L 8080:localhost:3618 lab
```

| 部分 | 意思 |
|---|---|
| `-L` | Local forward，本地端口转发 |
| `8080` | 在**你的电脑**上开一个 8080 端口 |
| `localhost:3618` | 凡是进 8080 的请求，都转给"**服务器上的** localhost:3618" |
| `lab` | 还是那台服务器 |

敲完输密码，然后这个窗口**别关**（最小化即可）。浏览器打开：

```
http://localhost:8080/PPSD_new/
```

看到的就是服务器上跑着的网站。

**优点**：不需要管理员、不需要等任何人、立刻能用。
**局限**：只有**这台开了隧道的电脑**能访问；导师要自己看就得在他电脑上做同样的事（演示时你操作给他看，够用）。

> 💡 明天演示建议：**两个都准备**。先问管理员要方案 A（正式），
> 万一没配上，当场用方案 B —— 演示照样完整，讲解照样说到"部署在实验室服务器上"。

### 方案 C（应急）：静态单文件版

完全不需要服务器配合的降级方案，数据是 165 个位点的快照（不是全量），
放到服务器上任一个能用 80 端口访问的目录即可。**会借用别人的目录，不推荐**，除非别无办法。

---

## 步骤 6：日常操作（以后天天用）

| 我要… | 命令 |
|---|---|
| 看服务活着没 | `curl -s http://localhost:3618/api/health; echo` |
| 看实时日志 | `tail -f $PPSD/backend.log`（Ctrl+C 只是退出查看，不停止服务） |
| 看最后 20 行日志 | `tail -20 $PPSD/backend.log` |
| 重启（最常用） | `bash $PPSD/restart.sh` |
| 停止 | `bash $PPSD/stop.sh` |
| 看进程 | `ps -eo pid,cmd \| grep "[s]erver.js"` |
| 退出服务器 | `exit` |

> `restart.sh` / `stop.sh` 是封装好的脚本，里面就一条 `pkill`。
> 之所以封装，是因为直接 `pkill -f "node src/server.js"` 有坑：这条命令自己的命令行里
> 也含这串字，可能把发起命令的 shell 一起杀掉（我就踩过一次，ssh 直接断了）。
> 脚本里用的是 `[n]ode` 这种写法避开 —— 你打开 `cat $PPSD/stop.sh` 能看到注释说明。

**服务器重启过之后**（比如断电维护），服务不会自动起来，要手动敲一次：

```bash
nohup bash $PPSD/start.sh > $PPSD/backend.log 2>&1 &
```

---

## 步骤 7：明天怎么给导师演示

### 演示前 3 分钟（自己先跑一遍）

```bash
ssh lab-hj
```
```bash
curl -s http://localhost:3618/api/health; echo
```
看到 `"clusters":7760` 就放心了。**没看到就先 `bash $PPSD/restart.sh`。**

然后开隧道窗口（另开一个 Hyper 标签）：

```powershell
ssh -L 8080:localhost:3618 lab
```

浏览器先打开一遍 `http://localhost:8080/PPSD_new/` 确认页面正常。

### 演示时的三条线

**① 讲"做了什么"**（30 秒）

> 原来的 PPSD 是 PHP 老站，我把整套界面和接口用 **Vue 3 + Node.js + PostgreSQL** 重做了一遍。
> 数据是从原站公开接口逐条采集、清洗后重新建库的：8 个物种、7760 个位点、10 万条 phasiRNA、
> 46 万条降解组靶基因记录。

**② 讲"这套东西是真的在服务器上跑"**（1 分钟）

> 这套系统现在部署在实验室的服务器上：前端页面、Node.js 后端、PostgreSQL 数据库三层都是活的。
> 后端进程跑在我的家目录，数据库是 WASM 版的 PostgreSQL，数据也是这次重建的。

当场敲给他看：

```bash
curl -s http://localhost:3618/api/health; echo
```

> 你看，这个接口实时返回数据库里的位点总数 —— 不是静态网页。

**③ 演示功能**（3~5 分钟，浏览器点）

打开 `http://localhost:8080/PPSD_new/`（或管理员的正式网址），按这个顺序：

| 点什么 | 讲什么 |
|---|---|
| 首页 | "8 个物种的数据统计，都是数据库实时聚合出来的" |
| 某物种（水稻） | "位点列表，支持分页、排序、按名称检索" |
| 点开一个位点 | "序列、产生的 phasiRNA、相位起始因子 —— 三张表关联查询" |
| 搜索页 | "跨物种检索" |
| 下载页 | "原始数据文件可直接下载，清单是实时扫目录生成的" |

**导师大概率会问"数据从哪来"**：

> 全部来自原站公开接口，脚本采集 + 清洗后重新建库。数据版权属于实验室，
> 这次是内网测试环境，没有对外公开。

---

## 排错速查

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `ssh lab-hj` 卡住/超时 | VPN 掉了 | 重新登录 aTrust |
| `node: command not found` | 没设 PATH | 敲 `export PATH="$HOME/env/node22/bin:$PATH"` |
| `GLIBC_2.28 not found` | 误用了系统自带的旧 Node | 同上，或检查是否用的是 `~/env/node22/bin/node` |
| `EADDRINUSE :3618` | 已有一个在跑 | `bash $PPSD/restart.sh` |
| 健康检查无返回 | 服务没起来 | `tail -30 $PPSD/backend.log` 看报错 |
| 页面白屏 | 前端资源路径不对 | 确认访问的是 `/PPSD_new/` 结尾（带斜杠） |
| 接口 404 | 路径少了前缀 | 用 `/PPSD_new/api/...`，或者检查 Apache 那 4 行 |
| 数据库报错 | pgdata 没灌或损坏 | 重跑步骤 2 的 `node src/db/load.js` |
| 隧道打不开页面 | 隧道窗口关了 | 重新 `ssh -L 8080:localhost:3618 lab` |

---

## 附录：发给管理员的话（复制即用）

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
> 作用是把 `http://202.195.250.119/PPSD_new/` 开头的请求转给我家目录里那个程序，
> 和现有的 SmartRice2 / RiceData / RiceSALTNet 写法一致。
> **不需要建目录、不需要改任何文件权限、不影响其他任何站点**，配置里新增 4 行就行。

配好之后你可以这样验证（在服务器上敲）：

```bash
curl -s http://202.195.250.119/PPSD_new/api/health; echo
```

返回和 `localhost:3618` 一样的 JSON 就说明转发生效了。

---

## 附：本次部署的数据（供你对答案）

| 项目 | 值 |
|---|---|
| Node | `~/env/node22/bin/node` = v22.23.3（glibc-217 兼容版） |
| 后端 | `$PPSD/backend` |
| 数据 | `$PPSD/data`（raw 113M / derived 25M / scraped 0.5M） |
| 数据库 | `$PPSD/pgdata` |
| 前端 | `$PPSD/dist` |
| 脚本 | `$PPSD/start.sh`、`stop.sh`、`restart.sh` |
| 端口 | 3618 |
| 灌库耗时 | 约 53 秒（服务器实测） |
| 灌库结果 | species 8 / clusters 7760 / phas_seq 7760 / phasi_rna 104166 / phasi_rna_target 465863 / initiator 8956 |
