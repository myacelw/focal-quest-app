# 部署到 GitHub Pages（纯前端 PWA）

把「变焦大冒险」发布成一个网址，iPad 用浏览器打开、添加到主屏幕，就是一个离线可用的 App。
**零托管成本**，不用一直开着电脑当服务器。

---

## 一次性设置（约 10 分钟）

### 1. 建 GitHub 仓库并推代码
- 在 GitHub 新建一个仓库，例如 `focal-quest-app`。
- **必须是 public（公开）仓库** —— GitHub 免费版只有公开仓库能用 Pages。
  （代码会公开可见；自家视力训练 App 一般无所谓。介意的话需 GitHub Pro 才能私有 Pages。）
- 把本项目推上去：
  ```bash
  git remote add origin https://github.com/<你的用户名>/focal-quest-app.git
  git push -u origin master
  ```

### 2. 打开 Pages 的 Actions 部署
- 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
  （只需选这一下，不用自己写配置——工作流已在 `.github/workflows/deploy.yml`。）

### 3. 触发首次部署
- 随便 push 一次（或在 **Actions** 页手动 **Run workflow**）。
- 工作流会自动：装依赖 → 从官方源下载 vosk 中文模型并转换 → 构建 → 发布。
- 跑完后,网址是：`https://<你的用户名>.github.io/focal-quest-app/`

> 模型 42MB 不入库，由 CI 在境外服务器下载（对 GitHub runner 很稳），所以你的仓库保持精简。

---

## iPad 上安装（添加到主屏幕）

1. iPad **Safari** 打开上面的网址。
   - ⚠️ 首次加载要下载约 6MB 程序 + 首次训练时下 42MB 模型；**国内可能慢，但只慢这一次**，
     装好后完全离线，以后再不碰网络。建议首次在 WiFi 好的地方打开、进一次训练把模型缓存下来。
2. 点 Safari 的**分享**按钮 → **添加到主屏幕**。
3. 从主屏幕图标打开，就是全屏 App 了。
   - 装成主屏 App 后，训练数据（IndexedDB）**不会被 Safari 7 天清除**，长期保存。

---

## 怎么更新

1. 你在电脑改完代码 → `git push`。
2. GitHub 自动重新构建、发布（几分钟）。
3. 孩子的 iPad **联网打开一次** App → 后台自动下载更新 → 下次打开就是新版。
   - 42MB 模型不变、不会重下；每次更新只拉变化的几十 KB，**国内也是秒级**。
   - 到设置页底部看**版本号**，即可确认那台 iPad 更没更到最新。
   - iOS 偶尔要联网打开一两次才换过来，期间旧版照常离线可用，不会坏。

---

## 常见问题

**Q：国内访问 `github.io` 慢/打不开？**
装成 PWA 后只有「首次安装 + 每次更新」需要联网，平时完全离线。所以慢只影响这两个时刻，
且更新只拉几十 KB。若首次安装实在打不开，换个网络环境装一次即可；或改用国内轻量服务器托管
（那样能自己设 COOP/COEP 头，连 SW 补头都不需要，但要花点钱、备案）。

**Q：语音（vosk）在纯静态托管为什么能用？**
vosk 依赖 `SharedArrayBuffer`，它要求页面「跨域隔离」（COOP+COEP 响应头）。GitHub Pages
设不了自定义响应头，所以用一个 Service Worker（`src/sw.ts`）在客户端给每个响应补上这三个头，
使 `crossOriginIsolated=true`。已用裸静态服务器（不发任何头）验证通过。

**Q：换自定义域名 / 用 `<用户名>.github.io` 根仓库？**
那样 App 在根路径而非 `/仓库名/` 子路径。改工作流里的 `VITE_BASE` 为 `/` 即可。

**Q：本地想预览这个静态包（和线上一模一样）？**
```bash
npm run build          # 构建到 dist/
npm run serve:static   # 裸静态服务器（不发头，真实模拟 GitHub Pages）→ http://localhost:4173
```

**Q：还想用本机 Node 后端（双写 SQLite）吗？**
仍可以——本地 `npm start` 照旧（后端 + 局域网 Vite），只有 Pages 构建才关掉后端。
纯 PWA 版数据只在 iPad 本地 IndexedDB；想额外备份可后续加"导出/导入 JSON"。
