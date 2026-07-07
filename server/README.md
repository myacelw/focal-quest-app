# FocalQuest 本地数据后端

把训练数据从「只在浏览器 IndexedDB」扩成「额外同步到本机 SQLite」，解决清缓存 / 换设备丢数据。

## 架构
- **零第三方依赖**：Node 24 内置 `node:sqlite`（不用 better-sqlite3，避开原生模块编译）+ 原生跑 TS（不用 tsx / ts-node）。
- **双写**：前端本地 Dexie 仍是可靠数据源（离线可用——后端没开也能照常训练），额外 best-effort 同步到 SQLite；后端不可达就静默忽略。
- **免 CORS**：iPad 只连 Vite，`/api/*` 由 Vite dev server proxy 转发到本后端（`localhost:3001`）。

## 启动（开两个终端）
```
npm run server    # 终端1：SQLite 后端 :3001
npm run dev:lan   # 终端2：Vite（iPad 经局域网 https 访问 https://<电脑IP>:5173）
```
数据文件落在 `server/focalquest.db`（已 gitignore，不入库）。App 启动时会把本地全部数据回填到后端（幂等），历史数据也会进 SQLite。

## API
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET / POST | `/api/sessions` | POST 以前端 Dexie 的 id 为主键，重复推送幂等（DO NOTHING） |
| GET / POST | `/api/checkins` | POST 按 date upsert（重复打卡覆盖为最新） |
| GET / POST | `/api/badges` | POST 接收数组，按 id 首次写入、已存在不覆盖 |

## 部署（待定）
当前只跑本机笔记本。以后可把前端 build + 本后端一起放到一台国内轻量服务器（Node 24 直接跑），或把 SQLite 换成托管库——届时再定。
