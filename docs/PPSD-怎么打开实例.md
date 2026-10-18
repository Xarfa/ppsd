# 怎么打开 PPSD 实例（每条命令都写清楚）

> 这份文档回答两件事：
> **① 你自己以后怎么打开**（从头到尾，一条不落）
> **② 师兄/老师怎么看**（两种办法，按有没有配 Apache 分）
>
> 服务器上的位置：`~/ppsd-26/app`（= 下面的 `$APP`，等于 `/home/riceUsers/wjj/ppsd-26/app`）

---

## 零、前提（缺一不可）

| 前提 | 怎么确认 |
|---|---|
| **aTrust 已登录**（或电脑本身在校园网内） | 打开 aTrust 客户端，显示"已连接" |
| 有服务器账号 | 账号 `wjj`，密码你知道 |

---

## 方式一：浏览器直接打开（配了 Apache 之后，最省事）

**前提**：师兄在 Apache 配置里加过那 4 行（见本文最后"请师兄配置"）。

**操作**：打开浏览器，输入

```
http://202.195.250.119/PPSD_new/
```

**完**。不需要 ssh、不需要隧道、任何连校园网/VPN 的电脑都能看，也能直接发网址给别人。

> 这是最终形态。在你请师兄配好之前，用下面的方式二。

---

## 方式二：SSH 隧道（没配 Apache 时用，也是你自己看的方式）

原理一句话：**在你电脑上开一个口子（8080），把请求通过 ssh 送到服务器的 3618**。
因为服务器 3618 端口从外面访问不到（只有 80 端口对外开放），所以需要这座"桥"。

### 第 1 步：连上服务器，确认服务在跑

打开 Hyper：

```powershell
ssh lab-hj
```

进去之后敲：

```bash
curl -s http://localhost:3618/api/health; echo
```

**两种情况**：

**A. 看到** `{"ok":true,...,"clusters":7760}` → 服务活着，直接跳到第 2 步。

**B. 什么都没有 / 报错** → 服务没跑，启动它：

```bash
nohup bash ~/ppsd-26/app/start.sh > ~/ppsd-26/app/backend.log 2>&1 &
```
```bash
sleep 5; curl -s http://localhost:3618/api/health; echo
```

再看到 `"clusters":7760` 就对了。然后退出服务器：

```bash
exit
```

### 第 2 步：架桥（新开一个 Hyper 窗口！）

**关键**：这一步要**另开一个窗口**，而且这个窗口之后要一直开着（最小化就行）。

在**新的 Hyper 窗口**里敲：

```powershell
ssh -L 8080:localhost:3618 lab
```

输密码。**注意**：敲完之后它不会出现 `$` 提示符，光标就那么停着 —— **这是正常的**，说明桥架好了、正在守着。

| 部分 | 意思 |
|---|---|
| `ssh` | 建一条连到服务器的通道 |
| `-L` | Local forward：本地端口转发 |
| `8080` | 在**你电脑**上开的端口号（随便选，只要没被占用） |
| `localhost:3618` | 从 8080 进来的请求，转给"**服务器的** localhost:3618" |
| `lab` | 服务器别名 |

### 第 3 步：浏览器打开

```
http://localhost:8080/PPSD_new/
```

**注意结尾的 `/PPSD_new/` 不能少**（前端是按这个子路径打包的）。

### 用完怎么关

| 关什么 | 怎么关 | 影响 |
|---|---|---|
| 关隧道 | 在隧道那个窗口按 `Ctrl+C`，或直接关掉窗口 | 你自己就看不到了，**不影响服务** |
| 关服务 | `ssh lab-hj` 进去 → `bash ~/ppsd-26/app/stop.sh` | 所有人都看不到了 |

> 平时**服务不用关**（它用 nohup 在后台跑着，服务器不重启就一直在）。只有你确实想停掉整个网站时才关。

---

## 让师兄看到（两种办法，选一种）

### 办法 A：请他配 Apache 那 4 行（**推荐，一劳永逸**）

配完之后，你只需把网址发给他：`http://202.195.250.119/PPSD_new/` —— 他在自己电脑浏览器里直接打开就能看，不需要 ssh、不需要隧道。

**发给他的话**（可直接复制）：

> 师兄，我在自己家目录（`~/ppsd-26/app`）部署了一个 PPSD 改版的测试环境，Node 服务监听 3618 端口。
> 想请您在 `/etc/apache2/sites-enabled/000-default.conf` 的 `</VirtualHost>` 之前加下面这 4 行，然后执行 `apachectl graceful`：
>
> ```apache
> <Location "/PPSD_new">
>     ProxyPreserveHost On
>     ProxyPass http://localhost:3618/
>     ProxyPassReverse http://localhost:3618/
> </Location>
> ```
>
> 只对 `/PPSD_new` 开头的网址生效，不建目录、不改权限、不影响其他任何站点。配好后访问
> `http://202.195.250.119/PPSD_new/` 就能看到。

**配完后你自己验证一下**（服务器上敲）：

```bash
ssh lab-hj
curl -s http://202.195.250.119/PPSD_new/api/health; echo
```

返回和 `localhost:3618` 一样的 JSON = 生效了。

### 办法 B：还没配，但想现在给他看

三种选择：

1. **你自己架桥，把屏幕给他看**（最快）—— 按上面方式二操作，然后让他看你屏幕。
2. **让他用自己的账号 ssh 上去**，在他电脑上执行方式二的第 2、3 步：
   ```powershell
   ssh -L 8080:localhost:3618 lab
   ```
   然后浏览器打开 `http://localhost:8080/PPSD_new/`。
   ⚠️ 注意：这条命令连的是 **wjj 账号**（服务跑在 wjj 家目录），所以需要你把密码给他，或者你用他的电脑操作。
3. 直接走办法 A（反正都要找他配，一步到位）。

---

## 速查：开机后从零到打开（照着敲就行）

```powershell
# ① 确认 aTrust 已连接，然后开 Hyper

# ② 连服务器
ssh lab-hj
```

```bash
# ③ 检查服务在不在跑
curl -s http://localhost:3618/api/health; echo

# ④ 没在跑才需要执行这两条（在跑就跳过）
nohup bash ~/ppsd-26/app/start.sh > ~/ppsd-26/app/backend.log 2>&1 &
sleep 5; curl -s http://localhost:3618/api/health; echo

# ⑤ 退出服务器
exit
```

```powershell
# ⑥ 新开一个 Hyper 窗口，架桥（这个窗口保持开着）
ssh -L 8080:localhost:3618 lab
```

```
# ⑦ 浏览器打开
http://localhost:8080/PPSD_new/
```

---

## 附：常用管理命令（都要先 `ssh lab-hj`）

| 我要… | 命令 |
|---|---|
| 看服务活着没 | `curl -s http://localhost:3618/api/health; echo` |
| 启动服务 | `nohup bash ~/ppsd-26/app/start.sh > ~/ppsd-26/app/backend.log 2>&1 &` |
| 重启服务 | `bash ~/ppsd-26/app/restart.sh` |
| 停止服务 | `bash ~/ppsd-26/app/stop.sh` |
| 看日志（实时） | `tail -f ~/ppsd-26/app/backend.log`（Ctrl+C 退出查看） |
| 看进程 | `ps -eo pid,cmd \| grep "[s]erver.js"` |
| 项目在哪 | `cd ~/ppsd-26/app` |

## 附：路径对照表（忘了就在这查）

| 东西 | 位置 |
|---|---|
| 项目根 | `~/ppsd-26/app` |
| 后端代码 | `~/ppsd-26/app/backend` |
| 前端页面 | `~/ppsd-26/app/dist` |
| 数据库 | `~/ppsd-26/app/pgdata`（备份就是打包这个目录） |
| 数据文件 | `~/ppsd-26/app/data`（raw/derived/scraped/reference） |
| Node 运行环境 | `~/env/node22` |
| 服务端口 | 3618 |
| 日志 | `~/ppsd-26/app/backend.log` |
