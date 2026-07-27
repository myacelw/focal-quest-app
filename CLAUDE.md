# CLAUDE.md

**变焦大冒险 / FocalQuest**（项目名 `focal-quest-app`，工作目录代号 `fzp`）——翻转拍视力训练游戏化 App。把儿童"翻转拍"（Accommodative Flipper，双眼调节灵敏度训练）从枯燥的读卡片，改造成有节奏、音效、打卡积分的 **iPad 游戏**，解决"孩子有拍子却坚持不下来"的痛点。给自家 9-12 岁孩子用；远期若效果好再考虑商业化。

完整需求见 **[docs/需求文档.md](docs/需求文档.md)**。

## 沟通语言
与用户交流一律用**简体中文**。技术术语、代码标识符保留英文。

## 当前状态
- 迭代 0（技术验证）✅ 完成并合并：vosk 离线语音可用、屏幕标定、答案映射。
- 迭代 1a（核心训练循环）✅ 完成并合并：Tumbling E 视标、语音+触控答题、翻拍过渡、计时换眼、单节结算。
- 迭代 1b（坚持引擎）✅ 完成并合并：每日打卡、连续天数、积分、IndexedDB 持久化（sessions/checkins）、首页打卡卡片、完成庆祝（64 单测绿）。
- 视标尺寸优化 ✅ 完成并合并：准备页"视标大小"滑块（0.3–2.0mm / 步进 0.1 / 默认 1.0mm）+ 实时预览 E + 等效视力级别标注，训练视标按毫米×标定显示；实测合适约 0.7mm（93 单测绿）。原"视标偏小"遗留已解。
- 迭代 1c（统计图表）✅ 完成并合并：日/周/月统计，手绘 SVG 的 CPM/正确率/次数图表、汇总卡片（76 单测绿）。**迭代 1 全部完成**。
- 迭代 2·勋章墙 ✅ 完成并合并：30 勋章（6 类梯度/萌命名/稀有度四级）、从 sessions/checkins 判定解锁、Dexie v2 badges 表、勋章墙（放大格子/96×96 图标区/6 类分组/进度/稀有度边框）、训练完成解锁庆祝+音效（89 单测绿）。**勋章正式图已就位**：用户用 AI 生成两张 4×4 宫格图（public/badges/sheet1.webp、sheet2.webp），BadgeCard 按 background-position 切片引用，非 emoji。
- 迭代 2·太空射击皮肤 ✅ 完成并合并：可换肤架构（Skin 接口/registry/PlainStage 抽取）+ 太空射击皮肤（星空/战机/四方向陨石/答对激光爆炸/答错抖/翻拍星流）+ 准备页换肤入口；DOM/CSS/SVG 不引擎、emoji 占位待出图、默认 plain（96 单测绿）。
- 迭代 2·彩蛋随机奖励 ✅ 完成并合并：连续答对 5 个→下一题变彩蛋（session TDD），视标金光✨/太空宝箱💎 + 专属音效 + 答对特殊庆祝（100 单测绿）。
- 准备页皮肤实时预览 ✅ 完成并合并：选皮肤时下方 220px 预览框实时渲染当前皮肤 Stage（朴素/太空/神庙），不再盲选（100 单测绿）。
- 资源体积优化 ✅ 完成并合并：勋章两张 4×4 宫格图 PNG→WebP q90（4.06MB→442KB，-89%），BadgeCard 引用改 .webp，删原 PNG；皮肤素材本就小未动。iPad 局域网加载更快。
- 迭代 2·积分解锁皮肤 ✅ 完成并合并：累计分达门槛永久解锁（门槛派生、不扣分、零持久化），太空 1000 分 / 神庙 2500 分、朴素免费（当初记的"各 300 分"已在后续调价中改掉，此处以 `src/skins/registry.ts` 的 `SKIN_UNLOCK_COST` 为准）；准备页锁态按钮 🔒+"再练 N 分"提示+生效皮肤兜底回退（未解锁→plain）；结算页打卡跨门槛时「🎨 解锁新皮肤」庆祝+音效；改 `SKIN_UNLOCK_COST` 一处即可调价/全开（110 单测绿）。**注意：这把原本全开的皮肤改成需解锁，属产品行为变更，待父女确认体验；不满意把价都设 0 即回退全开。**
- 迭代 2·神庙怪兽池 ✅ 完成并合并：神庙皮肤守护者抽成 GUARDIANS 池，每题按 guardianForSeq(答题数) 轮换一只怪兽承载视标 E（E 仍标准 Tumbling E 印核心圆底，变的是载体不是 E），怪兽名牌 + sprite/emoji 混池、HERO 提取常量便于换林克/四英杰（114 单测绿）。揭示通用变形框架：每皮肤 = 怪兽/英雄/场景/特效四个可换池。
- 本地 Node+SQLite 后端 ✅ 完成并合并：数据从"只在浏览器 IndexedDB"扩成"双写同步到本机 SQLite"（防清缓存/换设备丢数据）。零第三方依赖（Node24 内置 node:sqlite + 原生跑 TS）、Vite proxy /api 免 CORS、后端没开不影响离线训练、启动幂等回填历史。见 server/README.md。**vercel/supabase 已核实国内用不了；当前只跑本机笔记本，部署后议。**
- 界面美化 ✅ 完成并合并：风格 B「糖果能量」（闺女在三方向 mockup 中选定）全局主题（src/index.css，紫#6c4bf0/珊瑚/柠檬 + 圆角卡片 + 糖果渐变 + fq-* 基础类）；全 6 页统一（首页/训练全流程/统计/勋章/标定/语音）+ 图表糖果化（紫折线+面积渐变/渐变柱）+ 勋章卡金边；全局动效（fq-rise 入场/hover 微交互/进度条过渡/首页数字 count-up/🚀 浮动，均尊重 reduced-motion）；vosk 动态 import 首屏 6MB→293KB(-95%)；标定条 regression 已修。此前全 app 是浏览器默认宋体白底灰按钮。
- 专业性与留存增强 ✅ 完成并合并：①反应时间指标（"视标出现→答对"计时，比推算 CPM 更专业，落库 avgReactionMs，完成页展示）②家长周报（本周 vs 上周次数/反应趋势/正确率+建议，统计页紫卡，weekly-report.ts+6 单测）③难度进阶提示（正确率≥90% 建议调小视标，融进周报文案）④首次上手引导（5 步教正确训练，Onboarding.tsx，localStorage 记住）⑤有效性小贴士。**关键理念：不做摄像头 CV，靠"答对率=真调节看清"这一天然逻辑保障有效性。**（120 单测绿）
- UX 与训练体验优化 ✅ 完成并合并：①孩子路径极简（首页大按钮 →「遮眼提示 1.5s 自动开始」，去掉准备页多余点击；所有配置移到新增的家长「⚙️ 设置」页；语音测试降级为设置里调试入口，导航保持 6 项）②翻拍引导强化（训练命脉：统一醒目「🔄 翻转拍子」+ 1.6s 节奏进度条 + 咔哒翻拍音，皮肤无关）③连击 combo（连对 3+ 飘「🔥 连击 ×N」，与彩蛋联动）④太空敌人池（对称神庙，每题换敌人）⑤医学专业性改善（设置页拍子度数 ±1.50/2.00/2.50、视标专业指导、「关于训练·家长必读」卡：软件只引导+记录/真调节靠透过拍子看清/40cm 遮眼/坚持每天 4-6 周见效/数据是趋势参考非诊断）。**端到端全流程实测零 error（首页→自动开始→答题→翻拍→换眼→打卡→勋章解锁），124 单测绿。**
- 导航精简 + 翻拍观感 ✅ 完成并合并：标定收进设置页顶部卡片，常驻导航 6→5 项（首页/训练/统计/勋章/设置）；翻拍引导从"不透明紫块糊屏 + 🔄 机械快转 + 白进度条"改回柔和渐变观感（糖果径向光晕 + fzpFlip3d 优雅翻一次 + 紫→珊瑚渐变进度条），朴素皮肤过渡态去掉突兀绿字（124 单测绿）。
- 纯前端 PWA 改造（分支 pwa-static）✅ 完成待合并：把 app 从"依赖本机 Node 后端"改造成可部署 GitHub Pages 的纯静态 PWA，iPad 浏览器打开→添加到主屏幕→离线可用。**核心难点**：vosk 依赖 SharedArrayBuffer→需跨域隔离（COOP/COEP），而静态托管设不了响应头——用自定义 Service Worker（`src/sw.ts`，injectManifest）给每个响应补 COOP/COEP/CORP 头解决，`main.tsx` SW 接管后"未隔离则刷新一次"。已用**裸静态服务器**（`scripts/serve-dist.mjs`，故意不发头，真实模拟 Pages）验证 `crossOriginIsolated=true` / SharedArrayBuffer 可用 / 子资源带全三头 / 离线预缓存建立。配套：`VITE_BACKEND=off` 关后端不发 /api（dev 不设→本机后端照用）、资源路径经 `data/asset.ts` base 相对化（支持子路径）、PWA 图标（`scripts/gen-icons.mjs` 占位可换 AI 图）、设置页版本号、`.github/workflows/deploy.yml` push 自动构建（CI 下载模型）发布。**更新机制**：push 后孩子联网开一次自动更新，模型不重下、只拉几十 KB。详见 [docs/部署到-GitHub-Pages.md](docs/部署到-GitHub-Pages.md)。
- App 图标/启动图 + 非商业开源 License ✅ 完成并合并：用户 AI 生成的翻转拍主视觉切成 icon-512/192/apple-touch(180) 替换占位、首页 hero banner（hero.webp）；LICENSE 采用 **PolyForm Noncommercial 1.0.0**（源码公开·禁商用·作者保留自身商业化权），README 去"家庭自用"旧句加许可说明。
- 托管定为 GitHub Pages（已上线）✅：曾评估 EdgeOne Pages（有国内节点但免备案区对大陆网络返回 401、须绑自定义域名，而免费域名 us.kg 等实测不稳）→ 放弃 EdgeOne，改回 **GitHub Pages**。用户把仓库 myacelw/focal-quest-app 改为 **public**，`.github/workflows/deploy.yml`（configure-pages enablement:true 自动开 Pages、base=/仓库名、VITE_BACKEND=off、模型分片已入库无需下载）push master 自动构建发布。**线上：https://myacelw.github.io/focal-quest-app/**（首页/资源/模型分片/SW/manifest 均 200，base 路径正确；crossOriginIsolated 由 SW 补头，机制已在裸静态服务器实测）。真机已验证可用。vosk 模型因 EdgeOne 单文件 25MiB 限制曾切成 3 分片（part00/01/02+parts.json，vosk.ts 自动拼回 blob），GitHub Pages 上照常工作。EdgeOne 的 config.json/文档已清理删除。
- 键盘作答 + 连击无限累加 + 翻拍速度可调 ✅ 完成并合并：①键盘兜底（方向键最直观；1-4/asdf/jkl; 按屏幕按钮顺序映射，方便电脑调试和无语音场景，将来若出数字视标同样把 1-9 对应即可）②修复连击 bug——原实现连对 5 个后随彩蛋触发被重置，现连击与彩蛋解耦，连对可无限累加，只在答错清零③设置页新增「🔄 翻拍速度」快/适中/慢（本轮又整体调快一版，见下）。
- 徽章解锁后保留说明 + 中英双语国际化 ✅ 完成并合并：①BadgeCard 修复——之前解锁后进度文案直接消失变空白，现改为显示「✓ 达标目标」（如 "✓ 10CPM"）②**全站中英双语**：新增 `src/i18n.tsx`（zh/en 字典 + `useT()` + `useLang()`/`setLang()` + `Rich` 组件解析 `**加粗**`），按浏览器语言自动选择、设置页可手动切换；覆盖导航/首页/训练全流程/统计/设置/勋章墙/标定页/Onboarding/语音测试调试页/图表 aria-label，含 30 枚徽章名、3 个皮肤名、太空 6 敌人名+神庙 6 守护者名（两者 name 字段改成稳定 slug，如 `enemy.name='ufo'`，渲染时 `t('space.enemy.'+name)`翻译，两皮肤 rotation 单测同步改断言值）、家长周报建议（`weeklyReport()` 吐 `suggestionKey` 而非拼好的中文串，渲染时才翻译）。vosk 语音语法常量（"上 下 左 右"）刻意保留中文，是喂给语音模型的识别词表和 UI 语言无关（124 单测绿）。
- 托管方案探索（EdgeOne→GitHub Pages 反复）：曾短暂尝试切到 EdgeOne Pages（config.json 原生 COOP/COEP、模型分片供 CI 免联网下载构建），后来发现私有仓库要用 GH Pages 得改公开——用户已把仓库设为 public，于是**弃 EdgeOne 改回 GitHub Pages**（EdgeOne 相关 config.json/脚本已清理删除，仅模型切片方案保留，因分片本身也利于 GH Pages 构建）。托管现状仍以 30 行前的"托管定为 GitHub Pages"条目为准。
- 皮肤怪兽出正式图 ✅ 完成并合并：太空/神庙各差 5 只怪兽的 emoji 占位，用 **Gemini 4×4 网格一次出图**（`docs/怪兽出图提示词.md` 含完整提示词+关键约束"透明背景/风格统一/不画分隔线"），切片转 webp 后接入代码——`Enemy`/`Guardian` 类型的 emoji 分支整个删掉（不再是 sprite/img/emoji 三态混池，太空全 img、神庙 sprite+img 两态），emoji 无兜底、直接换真图。每套另留 11 只储备（`public/skins/{space,shrine}/reserve/`），扩池不用再出图。两皮肤 CREDITS.md 补记 AI 出图来源。
- **本文档遗漏的已合并模块（2026-07-25 勘察补记）**：上面的条目漏记了若干已在 master 的功能，读代码时别以为是新东西——**怪兽图鉴**（`src/dex`，monsters 表，每日保底+彩蛋捕获）、**积分兑换现实奖励 + 补签卡**（`src/rewards`，rewards/redemptions 两表，可用积分=累计−消耗）、**线下验光记录**（`src/exams`，exams 表）、**JSON 备份导出/恢复**（`src/backup`）、**训练提醒 ICS**（`src/reminder`）、**清空数据**（`src/reset`）。故 Dexie 现为 **version 5、7 张表**（sessions/checkins/badges/monsters/rewards/redemptions/exams），不是早期条目暗示的 2-3 张。
- 迭代 3·域名+账号+云同步 🚧 进行中（设计已定稿并批准，见 [spec](docs/superpowers/specs/2026-07-25-域名账号云同步-design.md)）：买 **.top 域名** → 迁 **Cloudflare Pages**（免备案、自有域名根路径）→ **Pages Functions + D1** 做同步后端（免费层，同域零 CORS）→ **家长邮箱+密码账号**（客户端 PBKDF2 拉伸、服务端单次哈希，适配 Workers ~10ms CPU）→ **归属制邀请码**（每账号专属码，落库 invited_by，注册来源可追溯）→ 本地优先增量同步（**LWW upsert + 墓碑**，非纯追加）→ 管理后台（DAU/MAU 从 records 表 SQL 派生）。关键调研结论：微信登录对个人主体在 Web 端不可行（网站应用需企业资质、个人小程序禁 web-view）；短信个人通道仅剩阿里云"短信认证"（平台预置签名）；**备案与海外免费托管互斥**（备案后域名必须解析到境内 IP）；Turnstile 因大陆 DNS 污染排除。
  - **3a 基建搬家 ✅ 已上线**：**线上 https://fq.myacelw.top**（Cloudflare Pages 项目 `focal-quest-app` + D1 `focal-quest-db`，域名 myacelw.top 腾讯云注册、NS 已迁 Cloudflare）。`public/_headers` 平台下发 COOP/COEP/CORP（线上实测三头齐全、`crossOriginIsolated=true`）、`scripts/check-coi.mjs` 验证脚本、CI `deploy-cf.yml`（含 test + 两份 typecheck 质量门，首次部署 56 秒通过）、**SW 放行 `/api/`**（原 cache-first 会让同步拉到过期缓存，故前置到 3a 让已装机 iPad 先换 SW）。GitHub Pages 链保留热备。
    - 部署踩坑见 [部署文档](docs/部署到-Cloudflare-Pages.md)：①Pages 项目不能叫 `focal-quest`（同名 Worker 占用命名空间，API 只回 `code: 8000000` 不提重名）②D1 binding 不可照抄 `d1 create` 建议（代码按 `env.DB`）③绑域名后几分钟 HTTPS 握手失败属证书签发中 ④**本机 fake-ip 代理会让 DNS 诊断全失真**（曾据此误判"pages.dev 被污染"，实际 198.18.x.x 连续地址是代理虚拟 IP），查真实记录要用 DoH。
    - ✅ **国内可达性已由用户在 iPad 真机实测通过**（2026-07-26）。这一步必须真机：开发机挂着 fake-ip 代理，测得"能访问"不代表家宽/蜂窝能访问——当初还据此误判过"pages.dev 被污染"（实为代理虚拟 IP，见部署文档坑④）。**结论：Cloudflare Pages + 自定义域名 + NS 迁 Cloudflare 这套免备案方案在国内可用**，早前调研中"必须绑自定义域名（靠 CNAME 展平避开 pages.dev 污染）"的判断得到实证。
  - **3b-1 服务端骨架**：本地已全部完成（`functions/api/{auth/register,auth/login,sync/push,sync/pull}.ts` + `functions/lib/*` 纯函数 + `migrations/0001_init.sql` 四张表 + `scripts/test-api.mjs` 31 项集成断言）。**241 单测绿、两份 typecheck 干净、集成测试连跑三遍 31/31**。前端 `src/` 零改动。**待用户建线上 D1 与 secret 后才能上线**（`wrangler.toml` 现为占位 `database_id`；本地 `--local` 不需要账号）。
    - 注意：注册限速刻意是**两道额度**（成功 20/日 + 失败 10/小时），别合并成一个——合并会让手抄错邀请码的家长被锁一整天，`functions/lib/ratelimit.test.ts` 有测试锚定。
    - 本地跑集成测试：`npm run build && npm run db:migrate:local` → 后台 `npx wrangler pages dev dist --port 8788` → `npm run test:api`。撞 429 就先停服务再 `npm run db:reset:limits`（wrangler 持 D1 文件锁，运行期间清不掉）。
  - **3b-2 客户端接入**：已完成。Dexie **v6**（7 表补 uuid/updatedAt/profileId + 新增 outbox/syncMeta）、`src/sync/*` 纯函数层（sync-keys 派生 uuid 与时钟钳制 / merge 按 kind 分派 / reconcile 重算打卡链 / authkey PBKDF2 / credentials 本地凭据校验 / sync-policy 退避、切批与失败分类）、同步引擎（outbox 推送 + 游标拉取 + 合并入库 + 重算回写，触发时机=启动/训练完成/网络恢复，失败静默退避）、设置页「☁️ 云同步」卡 + 隐私政策页 + 监护人同意勾选。**测试基建也在这一迭代补上**（新增 `vitest.config.ts` + `fake-indexeddb`，此前 241 个测试全是纯函数、碰不到 IndexedDB）。
    - `src/data/api.ts` 的 7 个 `pushXxx` **签名一字未动**，实现从"POST 本机 Node 后端"换成"写 outbox + 唤引擎"，业务代码零改动；`server/`（本机 Node+SQLite）自此**不再被前端调用**。
    - 六个反直觉但必须坚持的口径（都有单测锚定，勿"优化"掉）：①**勋章/怪兽取最早**而非 LWW——"首次达成时刻"才是正确语义；②**存量迁移的 updatedAt 取行内既有时间戳**而非 `Date.now()`——取 now 会让后迁移的设备凭 LWW 盖掉对面的修改；③**打卡链必须整体重算**，`streak`/`totalPoints` 是链式累积写死在行里的，LWW 修不了；④重算**只修链条、不重算 dailyPoints**——它是"打卡当时结算"的事实数据，按 sessions 重算会让"一天练两轮"和"补签过的日子"白涨分，而积分是能换现实奖励的货币；⑤**7 表 uuid 全部确定性派生**（`kind:profileId:自然键`，自增表用行内写入时刻），随机 uuid 会让同一条历史在云端变两行、拉回本地后当日答对数翻倍；⑥**推送失败必须分暂时/永久**——服务端整批全或无校验，把 400 当网络错误无限退避会让一条毒药记录彻底堵死这台设备的同步。
    - 两处数据安全闸门：**登录不无条件全量上推**（`boundUserId` 分辨换号，防跨账号串账）、**退出登录保留 outbox 里的墓碑**（墓碑无从重建，清掉等于删除意图永久丢失、记录会被复活）。
    - 已知缺口（明示接受）：两台设备离线各兑换一次会**超额**（余额校验纯本地）。家长端「奖励设置」超支时显示「⚠️ 已超支 N 分」，可人工取消一条。
    - 部署开关：CF 那条链（`deploy-cf.yml`）**不再设** `VITE_BACKEND=off`（它有同域 `/api`）；GitHub Pages 那条链（`deploy.yml`）必须继续设 off。
    - **端到端实测已通过**（2026-07-25，本地整栈 `wrangler pages dev dist` + 浏览器真操作，非单测）：`crossOriginIsolated=true`、Dexie 实到 v6、监护人同意未勾选时注册按钮禁用、真实注册成功并拿到归属邀请码、`boundUserId` 正确落库；随后用该 token 从命令行 push 两条记录**模拟第二台设备**，浏览器点「立即同步」后两条都落入本地库、游标推进、outbox 归零。其中一条我故意推 `streak:3`，落库后为 `streak:1`（本地链条无前一天，reconcile 正确重算）而 `totalPoints:45` 原样保留——**同时验证了"重算链条"与"不重算货币"两个语义**。另附带确认 SW 更新机制正常：新构建后需刷新一次才接管（即"孩子联网打开一次自动更新"的预期行为，首次看到旧版本不是 bug）。
  - **3d 手机竖屏适配 ✅ 完成**：①App 外壳改 `height:100dvh` 一列 flex（导航固定 + `.fq-app-main` 自己滚），**干掉全站三处写死的 `calc(100vh - 57px)`**——那个 57 在手机上实际是 99（导航折两行），正是"↓ 方向键掉出首屏 24px"的根因；②单一手机断点 `@media (max-width:560px)`（560 = 英文导航单行所需 531px 的上取整余量）：导航只留图标（文案 `aria-label` 兜无障碍）、方向盘 210→240px/间距 7→10px、语音提示从方向盘左侧改成上方整行；矮屏断点 `@media (max-height:560px)` 让方向盘按 34dvh 收缩；③皮肤方形画布改 `width: min(100%, 420px, 100cqh)`（**容器查询单位拿到舞台剩余高度，纯 CSS 无需 JS 测量**），画布内所有装饰改 `cqmin` 等比，sprite 逐帧动画的 `background-size`/`background-position` 也改 cqmin 才不错帧；④**顺带修正神庙皮肤的医学偏差**——原 `scale(0.8)` 套在视标祖先上，E 只有标定值的 80%，现把 0.8 折进容器 `width/height` 并从 `fzpFloat`/`fzpShakeG` 每帧删掉 scale，视标从此严格等于 `毫米 × 标定`（⚠️ 神庙历史数据与新数据不可比）；⑤**标定页堵住一条静默破坏医学参数的路**——手机竖屏放不下银行卡长边（85.6mm，375 屏最多只到 4.03 px/mm 而真值约 6.05），现窄屏自动改用**卡片短边 53.98mm**（可达 6.39），且"当前屏够不到已存值"时**禁用保存 + 明确警告**，不再一次误触把 px/mm 低估 33%；⑥`viewport` 补 `viewport-fit=cover` + 全站 `env(safe-area-inset-*)`（都带 `, 0px` 兜底），manifest 显式 `orientation: 'any'`；`user-scalable=no` 刻意保留（双指缩放会毁掉物理标定）。⑦新增 `src/layout/layout-budget.ts` 作为 CSS 数字的唯一出处 + `css-contract.test.ts` **读 index.css 文本核对**（防 TS/CSS 漂移，含"`calc(100vh - 57px)` 不许回来"这条闸门）。**436 单测绿 / 47 文件**。
    - **本迭代修掉的三个已上线 bug**（都是"线上真在发生"而非新引入）：①**导航折行致训练页溢出**——手机竖屏导航折两行占 99px，而三处布局写死减 57px，训练页整体比首屏高 42px，`↓` 方向键有 24px 在屏外点不到；②**竖屏标定静默低估 px/mm**——竖屏放不下银行卡长边时，旧代码把卡宽静默夹到屏宽上限仍允许保存，一次误触就把 px/mm 低估约 33%，此后所有视标偏小 33% 且家长完全无感；③**神庙皮肤视标偏小 20%**——`scale(0.8)` 压在视标祖先链上，换到神庙皮肤等于偷偷把训练强度降一档。
    - **神庙修正是产品行为变更（已与用户确认）**：孩子主要用朴素/太空皮肤，影响面小，故直接修正而不加兼容开关。**修正后神庙皮肤的历史训练数据与新数据不可比**（同一毫米设定下 E 变大 25%），趋势图跨这个时间点看神庙数据要留意。若实测觉得"神庙突然变简单"，请在设置页把视标毫米数下调一档（0.7 → 0.6mm），**不要**把 `scale(0.8)` 加回去。
  - 3c 多档案：**已决定不实施**（家里只有一个孩子，`profileId` 恒为 `'default'`）；3e 管理后台已完成，见下一条。
- 迭代 3e·管理后台 ✅ 完成并合并：`GET /api/admin/stats`（`requireUser` + **`adminGate` 纯函数**——没登录 401 / 没权限 403 刻意分开，否则排障时分不清"该重登"还是"该去 D1 设 is_admin"；抽成纯函数是因为 `deploy-cf.yml` 的质量门**不跑 `test:api`**，鉴权回归只有单测拦得住）从已有四张表派生总注册数/记录数/各 kind 量与近 7 天增速、日活周活月活（主口径 = 近 1/7/30 个**东八区**日内有 `kind='session'` 记录的去重用户；辅口径 = `tokens.last_seen_at`）、近 30 天训练量曲线、最近注册（`LEFT JOIN` 带邀请人 email）、邀请排行、滥用计数（`counters` 汇总，**排除 `rl.%`** 且第二道是形状白名单——那些 key 编着 IP 与邮箱，而界面对未知 metric 默认原样上屏）。**三个关键口径决定**：①分日与活跃走 `records.updated_at`（客户端写入时刻=练的时候）而非 `received_at`——后者会让离线补传全堆到补传当天，且 push 的 `ON CONFLICT` 里 `received_at = excluded.received_at` 使任何 LWW 覆盖都让历史柱子回溯变矮；`updated_at` 是列不是 payload 字段，读它不违反"不解析 payload"；②日界按北京时间（UTC 日界=北京 08:00，会把清晨训练算到前一天）；③8 条 SQL 打成一次 `env.DB.batch()`、`totals.records` 由 kind 分组求和、永不自动轮询——这是 D1 免费层行读配额保护，配额与云同步共用，耗尽会连带同步挂掉。整形逻辑抽成 `functions/lib/admin-stats.ts` 纯函数单测，D1 查询由 `scripts/test-api.mjs` 集成断言覆盖（含"非管理员得 403"、"滥用计数不含 rl.*"）。前端因项目无 router，管理页是 `App.tsx` 的一个 View 分支 + **全仓首处 `React.lazy`**（自带 Suspense fallback + **就地 `ErrorBoundary`**——lazy 的 import 若 reject，全局那个边界会让首页和训练一起变全屏 😵，参见 06b7de6 的同类坑；注意 lazy 只省首屏解析执行，chunk 仍进 SW 预缓存，这正是离线也能打开管理页的原因），图表复用 `src/stats` 的手绘 SVG 糖果风格不引图表库；入口卡只对 `isAdmin` 账号渲染。**管理员标记不做提权 UI**，部署者手动跑一次 `UPDATE users SET is_admin=1 WHERE email=...`（⚠️ 改完要重新登录一次——客户端 `isAdmin` 是登录响应的快照）。明确不做：匿名遥测（儿童应用隐私成本不值，家庭规模装机量≈注册量）、即席查询 UI（用 Cloudflare D1 Console 跑 SQL，常用几条已写进部署文档）、多档案维度（3c 不实施）。
- 迭代 2·限时挑战 ✅ 完成并合并：当天练完训练才解锁的 **30 秒冲分小游戏**（`src/challenge/`），**双眼不遮眼**（binocular accommodative facility 是标准训练项目）、**不给积分/勋章/怪兽、不进统计、不落 Dexie**，最高分只写 localStorage `fzp.challengeBest`。**自适应节奏**：读最近 20 次训练 `avgReactionMs` 的**中位数**为基准，初始答题窗口 = 基准×2.0、最快 = 基准×1.3，每 3 题降一档共四档；样本 <3 个回落固定 2000/1300ms（全部常量集中在 `challenge-pace.ts`，调参只改这一处）。**钳制只钳基准 `b ∈ [750, BASELINE_MAX_MS=3000]`，两个窗口一律由 `b × 固定系数` 派生——绝不给窗口加上限**：计划评审阶段的原稿给两窗封了顶（4000/2500），实测推演发现基准 ≥1924ms 时最快窗口的实际系数会掉到 1.3 以下（b=2500 时正好 ×1.0＝窗口等于孩子自己的中位反应时间，约一半的题必超时），把医学边界①静默架空了；`challenge-pace.test.ts` 有一条 `derivePace([2500×4]).fastestMs ≥ 3250` 的回归锚死死钉住这个破口，**别把窗口上限加回来**。**两条医学边界不可动**：①下限系数不得低于 1.3（`FASTEST_FACTOR_FLOOR`，压到 ×1.05 会让约一半的题超时=逼孩子瞎猜）②翻拍过渡强制不低于 600ms（`challengeFlipMs` 是唯一出口；孩子来不及真翻就会干脆不翻，挑战退化成纯反应游戏还会腐蚀主流程）。**时限只覆盖答题窗口**，翻拍过渡是独立阶段、不计入也不被压缩；**超时不算错也不得分**，与答错都清连击但分开计数、结算页分开显示，**音效也分开**（`sfx.ts` 新增 `'timeout'` 短促下滑音——超时若沿用 `'wrong'`，界面刚分清的"看错了/没跟上"会在耳朵里被重新糊成一团）。视标恒为 毫米×标定，不因挑战而变。刻意**不复用** `training/session.ts`（规则不同，硬合并会把被大量测试压住的训练状态机搞复杂）；复用皮肤 Stage（`getSkin`，**注意 spec 里写的 `skinById` 不存在**）、`pickDirection`、`playSfx`、`.fzp-train/.fzp-stage/.fzp-answer` 三段外壳（含 `.fzp-rotate-hint` 与 `.fzp-tiny-warn` 两条提示）与翻拍引导视觉。计时**不能照抄训练页**（那是 1 秒粒度 + 依赖 phase 重建 interval，会丢余量），改成 100ms 高频 + 真实时间差推进。**挑战不接语音，只用触控/键盘**——这是找用户单独拍板过的产品决策（理由与结论写在 spec §8.5/§9）：挑战按毫秒判超时、最快档窗口才 1300ms，vosk 出词的几百毫秒延迟会造成"明明及时说了却判超时"的委屈；故挑战页**不加载 vosk、不开麦克风**，正经训练的语音路径完全不受影响（见关键决策 #2）。键盘映射从 `TrainingPage` 抽成共用的 `src/training/key-map.ts`（两处各写一份必然漂移）。入口只在首页「当天已打卡」时渲染，**不进 NAV**；`challenge-shell.test.ts` / `challenge-entry.test.ts` 用 `?raw` 源文本锚住"不落库（`db.*.put|add|bulkPut…` 与 `pushXxx(` 两条正则，不是函数名黑名单）/无 scale/翻拍必过闸门/超时不复用答错音/入口不许随时可玩"。
- 训练完成门槛 ✅ 完成并合并：堵掉「挂机 3 分钟照样打卡拿分续连续天数」这个上线漏洞（`dailyPoints` 的 `+30` 是打卡奖励、与答对数无关，所以挂机能凭空印出可换现实奖励的货币）。门槛 = **每分钟 5 个答对 × 时长比例 × 双眼合计**（1/2/3/5 分钟档 → 单节 5/10/15/25、整次 10/20/30/50），全部常量在 `src/training/goal.ts` 一处，调松紧只改 `GOAL_CORRECT_PER_MIN`（**要全放行须把它与 `GOAL_MIN_PER_EYE` 同时设 0**，只设前者会被下限顶住）。**六个反直觉但必须坚持的口径**：①**整次合计判，不按单眼各判**（用户 2026-07-27 拍板）——弱眼天生慢，各判等于对最该练的那只眼施加最严标准，且某只眼状态差就整轮作废要重练 6 分钟；判定因此只发生在右眼节末点「完成这一轮 →」那一次，左眼节末照旧不判；②**判据是「当天全部 sessions 答对之和」，与 `dailyPoints` 完全同源**，于是"再练一轮补够"天然成立（结算页那个重来按钮的基础），也不会出现"门槛按单节、发分按全天"两把尺子；③判定顺序硬定 **already → below-goal → checked-in**，已打卡必须先短路，否则"第一轮达标已打卡、第二轮又练但合计不够"会被误判成打卡失败、把到手的连续天数吓没；④**不达标时 session 照常落库照常推云、勋章照常判定落库**（`syncBadges` 必须在分流之前调，挪到之后会让 `unlockedAt` 失真），只是不打卡/不加分/不发保底怪/不算皮肤解锁/不放完成音——**门槛只决定"今天算不算完成"，不决定"训练事实是否被记录"**；⑤**门槛的时长基准取「当天真实练过的最长一节 `elapsedSec`」**（`goalForDay`），当天没练过才用当前设置——`fzp.durationSec` 就是设置页那四个按钮，只按当前设置算就能"练完不达标 → 点一下「1分」→ 门槛从 30 掉到 10 → 已练的答对数照样算 → 下次直接打卡成功"（反向也一样：家长中途把 1 分改成 5 分会让当天已练的全作废）；⑥**补签闸门的判据是「那天确实没练够」**（`dayFellShort` 重算那天的门槛），**不是**「那天有没有 session 行」——`saveSession` 只在计时走满时落库，所以"有行"其实等价于"完整走完过一节"，拿它当判据会把"练到 40 个（门槛 30）却被收走 iPad、没点完成键"那天永久堵死（最该补的一天），同时放过"点开就退出"的日子（一行都不落）。配套堵住**补签卡这条 50 分的付费绕过通道**（`canRepair` 新增 `'attempted'`）。「再练一轮」**刻意不用 `key` 重挂载**（会 stop 掉 vosk 再重启，正是 89743b6 那条换眼白屏的内存尖峰路径），改为 `restartRound()` 手工复位 state/ref，清单由 `src/training/goal-gate.test.ts` 源文本契约逐条锚定。另外**一轮训练锁定一个日期**（`roundDateRef`，左眼节开始时定）：原先 `saveSession` / `doCheckIn` 各自现算日期，跨零点会把左右两节裂到两天，加门槛后可能整轮判 below-goal 且两天都没打卡行、连续天数直接断。右眼末按钮从「完成并打卡 🎊」改成中性的「完成这一轮 →」（`train.finishRound`），因为它点下去可能落到不达标页。顺带把 `TrainingPage` 私有的无校验 `readDurationSec` 收进 `goal.ts` 并加钳制——原实现 `Number('abc')=NaN` 会让门槛所有比较为 false（**静默全放行**）、`'0'` 会让门槛变 0。首页加「今天练了 7/10」第三态（消除"首页说没练、统计说练了 1 次"的观感打架），设置页时长档位下显示**该档位对应**的门槛（当天真实门槛按 ⑤ 算、见首页第三态，两处不矛盾）。明确不做：速率型门槛（会惩罚调节慢的孩子，与医学目标相反）、积分补发/重算（撞 `reconcile.ts` 的硬口径且积分是货币）、统计与周报口径改动（训练量是事实）、服务端门槛校验。**三条已知且明示接受**：①旧版本设备按老逻辑打的卡经云端 LWW / `restoreBackup` 拉回来仍会落库——**门槛是本地写入闸门，不是数据校验器**；②**发分不对称**：同样练两轮，"第一轮 29 差一个 → 第二轮 40"按当天累计 69 结算得 375 分，而"第一轮就 40 达标"只按 40 结算得 230 分（+63%），即"多练只有先失败才发分"。已与用户确认保留现状（要吃这个差价得先坐满 6 分钟故意不答再认真练 6 分钟），止损阀门是 `goal.ts` 的 `POINTS_CORRECT_CAP_FACTOR`（默认 0=不封顶；真要开取 **6**，**不要取 2**——3 分钟档门槛只有 30，封在 60 会把诚实一轮的当日积分从 430-830 砍到 330）；③孩子**练之前**就把「单眼时长」钉在 1 分钟（那天只需 10 个答对）——门槛按时长**等比缩放**是不可动摇的医学口径（固定值会惩罚调节慢的孩子），所以这条只能靠**降低可达性**：用户 2026-07-27 拍板"折叠而非加口令"，已把「⏱️ 单眼时长」与「👁️ 视标大小」收进设置页 `<Collapsible title={t('settings.trainingLoad')}>`「📐 视标与时长（家长设置）」（默认收起，**不许传 `defaultOpen`**）。**定性是降低可达性、不是权限闸门**——孩子展开一样能改，已知且接受；只折这两项的判据是"改了会不会改变训练量或难度"，故标定（首次必做，藏起来会卡住新用户）/翻拍速度/拍子度数/皮肤刻意留在折叠区外，由 `src/settings/settings-fold.test.ts` 源文本锚定。设计见 [spec](docs/superpowers/specs/2026-07-27-训练完成门槛-design.md)。
- 下一步：真机持续使用收集反馈（限时挑战的节奏松紧待闺女实测，觉得太难就调 `src/challenge/challenge-pace.ts` 的 `INITIAL_FACTOR`，**不要**动 `FASTEST_FACTOR_FLOOR` 与 `MIN_FLIP_MS` 这两条医学边界，也**不要**给两个窗口加上限——上限会压过下限系数、把边界①静默架空，`derivePace([2500×4]) ≥ 3250` 那条回归锚就是防它的）；**训练完成门槛需闺女实测校准**——若认真练却被拦，只改 `src/training/goal.ts` 的 `GOAL_CORRECT_PER_MIN`（5 → 3 或 2），**不要**改判定逻辑、不要加"正确率豁免"分支、更不要改成速率型；迭代 3 按上述子迭代推进；迭代 2 其余（深海动物需先验 vosk）；皮肤储备怪兽池扩充（已有 22 只素材待挑用）。

## 关键决策（反复讨论后确定的边界，勿擅自推翻）
1. **平台：iPad + 手机 Web（竖屏可用）**（迭代 3d 起，用户明确要求"同时支持 iPad 和手机"，推翻了原先的「仅 iPad Web、手机远期再议」口径）。iPad 横竖屏为主形态，手机竖屏已完整适配（断点 560px、导航窄屏只留图标、皮肤画布 100cqh 自适应、标定窄屏走卡片短边）。仍不做电脑 / 电视 / 原生 App / Flutter（远期才议）。**手机横屏不是目标形态**，只保证不破版并提示"竖屏更好用"。
2. **交互：语音报答案为主 + 触控/键盘兜底**。不做手势。语音识别范围仅方向 `上下左右`（数字识别已弃用，见下方状态记录）；键盘作答（方向键/1-4/asdf/jkl;）后来补上，方便电脑调试和无语音场景。**唯一例外：限时挑战页不接语音**（用户单独拍板，理由见 spec `2026-07-26-限时挑战-design.md` §8.5——毫秒判超时容不下 vosk 的出词延迟）；正经训练这条以语音为主的口径不变。
3. **训练驱动：节奏引导，不检测翻转**。不做任何摄像头 CV（虹膜测距 / 闭眼检测 / ArUco）。
   - 代价（已接受）：软件无法保证孩子真翻拍，有效性依赖诚实翻拍 + 家长偶尔监督。**家庭级够用，非临床级严谨**。CPM 为推算值。
4. **数据：本地 IndexedDB**（Dexie.js）为可靠源；**已加本机 Node+SQLite 后端双写**（防丢/多设备读，见 server/）——注意是"本地服务"不是云，仍不做云同步 / 账号（远期）。
5. **美术：MVP 轻美术**，重"每日打卡 + 连续天数 + 音效"这套坚持引擎。**不引入游戏引擎**（Pixi/Phaser 留到迭代 2+）。
6. **距离 40cm**：MVP 用物理绳 / 家长监督，不用摄像头测距。
7. **屏幕物理标定必做**：银行卡（85.6mm）对齐算 px/mm，否则视标物理尺寸无意义。

> 上面这些是从一份很"重"的 Gemini 调研报告（`docs/翻转拍软件技术规划.md`）里做减法得到的。那份报告堆了大量重型 CV/ASR/回归方案，对本项目属过度设计——参考其医学背景即可，**不要照它实现**。

## 技术栈
- TypeScript + React + Vite
- 视标 / 动画 / 过渡：DOM + CSS（含 CSS filter 做模糊→清晰过渡）
- 存储：前端 IndexedDB（Dexie.js）为可靠源 + 本机 Node 后端 SQLite（node:sqlite，双写同步，见 server/）
- 语音：**方案 B vosk-browser 离线（已实测国内笔记本可用）**。方案 A（Web Speech API）走 Google 云、**国内不通**，已排除。模型需跑 `scripts/prepare-vosk-model.ps1` 生成（~42MB，不入库）。vosk 若不够准，升级路线是 **sherpa-onnx KWS**（关键词识别，对固定小词表最对口）。
- 运行：①开发期 iPad 与电脑同一 WiFi，Safari 访问局域网 Vite dev server（HTTPS，本地证书）——不依赖国外网络；②**部署：纯前端 PWA → GitHub Pages**（免费静态托管，装桌面离线可用；vosk 的跨域隔离头由 Service Worker 补，见 pwa-static 分支 + docs/部署到-GitHub-Pages.md）。本机 Node 后端仍可选（dev 双写 SQLite）。

## 核心训练循环（速记）
遮单眼 → 透过 +镜片看视标 → 看清后语音报答案 → 音效反馈 + 视标淡出 → 翻拍引导（动画+"咔"声）→ 新视标"模糊→清晰"淡入 → 循环 3 分钟 → 换眼再 3 分钟 → 完成打卡。MVP 用**自由节奏**（答完即引导翻拍，不强制固定节拍）；限时挑战模式留到迭代 2。

## 关键医学参数（勿随意改，影响训练有效性）
- 训练距离 **40cm**；单眼默认 **3 分钟**后换眼。
- 拍子屈光度 **±2.00D**（已与用户确认自家拍子度数；设置页可选 ±1.50/2.00/2.50 并记录，软件仅记录不参与计算——真调节刺激来自物理拍子）。
- 视标：数字(1-9) / 方向 E（都便于语音报答案）。
- 视力级别可配置，默认 **0.6-0.8** 起步。
- **CPM**：1 cycle = 正镜片看清一次 + 负镜片看清一次；MVP 为推算式 CPM。

## 迭代路线
- **迭代 0**：技术验证（语音识别 + 屏幕标定两个高风险点）← 当前
- 迭代 1：核心可玩 MVP（训练循环 + 标定 + 打卡积分 + 音效 + 统计）
- 迭代 2：游戏化增强（勋章墙 + 彩蛋 + 主题关卡 + 限时模式）
- 迭代 3+：多关卡 / 趋势分析 / 云同步 / 摄像头 / Flutter（可选）

## 目录结构
_(迭代 0 建立代码后补充)_

## 开发命令
> 单测基线：**622 个 / 63 个文件**（2026-07-27 实测 `npm test`，含训练完成门槛新增 59 个 / 4 个文件：`goal` 23 / `checkin` 15 / `goal-gate` 8 / `settings-fold` 7 + `i18n` 1 + `ledger` 5）。上面各条目里的"NN 单测绿"是当时的历史快照，别拿来当现值；这行也只是当天快照，开工前自己跑一遍 `npm test` 记真实基线。

- `npm install` — 装依赖
- `pwsh scripts/prepare-vosk-model.ps1` — 准备方案B的 vosk 中文离线模型（~42MB，不入库，仅首次）
- `npm run dev` — 本机开发（http://localhost:5173，localhost 即安全上下文，可用麦克风）
- `npm run dev:lan` — iPad 局域网（https，访问 `https://<电脑IP>:5173`，首次信任自签证书）
- `npm test` — 跑单元测试
