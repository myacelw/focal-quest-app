# 部署到 EdgeOne Pages（腾讯云，免费·免备案）

EdgeOne Pages 是腾讯云的静态托管（类似 Cloudflare Pages），永久免费额度（账号内所有项目
总大小 ≤5GB，我们约 92MB）。相比 GitHub Pages 的好处：**能原生设 COOP/COEP 响应头**
（`config.json`），vosk 不用只靠 Service Worker 补头。

> ⚠️ 免备案的取舍：不备案只能选「全球可用区（不含中国大陆）」，走境外节点，
> 国内首次访问不算快。但我们是 **PWA**，装成主屏 App 后完全离线，慢只影响
> 「首次安装 + 每次更新（更新只几十 KB）」。要国内节点全程快，需备案一个国内域名。

---

## 方式一：本地构建 + 直接上传（推荐，最省事，不碰模型下载）

因为 vosk 模型 42MB 不入库，让云端构建去下载它不稳；**本地构建好再直传**最干净
（本机已有模型）。

### 1. 本地构建
```bash
npm run build          # 默认 base=/，产出 dist/（含 config.json + 模型 + 全部资源）
npm run serve:static   # 可选：本地裸服务器预览，和线上一致 → http://localhost:4173
```
> 构建出的 `dist/` 就是要上传的整个文件夹（约 92MB，含 42MB 模型）。

### 2. 上传到 EdgeOne Pages
1. 登录 **EdgeOne 控制台**（国际站 edgeone.ai，或腾讯云 EdgeOne 控制台的 Pages）。
2. 新建 Pages 项目 → 选 **直接上传 / Direct Upload**。
3. 把 `dist` 文件夹整个上传（首次含 42MB 模型，稍久）。
4. 可用区：没备案就选 **全球可用区（不含中国大陆）**。
5. 部署完成，拿到一个 `xxx.edgeone.app`（或类似）网址。

### 3. iPad 安装
Safari 打开该网址 → 分享 → **添加到主屏幕**。首次在好网络下打开、进一次训练把 42MB
模型缓存下来，之后完全离线。

### 更新
改完代码后：`npm run build` → 到 EdgeOne 项目里再次「直接上传」覆盖。
（孩子的 iPad 联网打开一次即自动更新，模型不重下、只拉几十 KB。设置页底部看版本号确认。）

---

## 方式二：Git 集成自动构建（想 push 即部署，但要解决模型）

EdgeOne Pages 可连 GitHub/Gitee 仓库，push 自动构建。构建命令 `npm run build`、输出目录
`dist`、环境变量 `VITE_BACKEND=off`。**难点**：云端构建要拿到 42MB 模型——若 EdgeOne
构建机能访问 alphacephei.com 就能沿用 `.github/workflows/deploy.yml` 里的下载脚本；否则
需把模型入库或改用方式一。先用方式一跑通，之后再折腾自动化。

---

## 为什么 vosk 在纯静态能用

vosk 依赖 `SharedArrayBuffer`，要求页面跨域隔离（COOP+COEP）。这里两层保障：
1. **EdgeOne 原生下发**：`public/config.json`（构建后在 `dist/config.json`）用路由规则给
   所有响应加 COOP/COEP/CORP。
2. **Service Worker 兜底**：`src/sw.ts` 也会给每个响应补这三个头。即使 EdgeOne 没读到
   config.json，SW 也保证 `crossOriginIsolated=true`。已用裸静态服务器（不发任何头）验证通过。

---

## 和 GitHub Pages 的关系

两者不冲突：代码里 base 用环境变量控制（EdgeOne 根路径用默认 `/`；GitHub 项目页用
`VITE_BASE=/仓库名/`）。想同时挂两处、或以后换，都不用改代码。GitHub Pages 步骤见
[docs/部署到-GitHub-Pages.md](部署到-GitHub-Pages.md)。
