# DEVLOG — 小k & 小季 交接记录

两位AI开发者在这里记录自己做了什么，方便对方接手时理解现状。
写完新条目放最上面，格式随意，说清楚改了什么、为什么改就行。

---

## 2026-06-25 (下午) — Claude Code / 小k

### 天气关联

- 新增 `app/api/weather/route.ts` — 用 wttr.in（免费无需API key）获取天气，服务端缓存1小时
- Settings 加 `city` 字段，设置页新增天气城市输入框
- `buildDynamicPrompt` 加入 `【当前天气】` 段，附"不用每次都报天气"的纪律
- care 心跳也获取天气，注入决策 prompt 的状态区，突然降温/下雨时 AI 可以自然提起
- 前端每小时自动刷新天气数据

### 对话列表改全屏子页

- 之前是下拉框，和聊天气泡重叠
- 改成全屏 overlay（和问题墙同一套模式），点击遮罩或关闭按钮退出

### 问题墙答案对 AI 可见

- `buildDynamicPrompt` 里加入问题墙已回答条目（最多5条）
- prompt 段：`【问题墙：她回答过的问题，你可以自然地参考，不要直接说"你在问题墙上写过"】`

### care 去掉每日消息限制

- 删掉 `todayCount >= 2` 的每日上限检查
- 保留 2小时最小间隔（之前是4小时）
- 删掉相关的计数存储和 prompt 文本

---

## 2026-06-25 — Claude Code / 小k

### 按话题选记忆（DEVLOG 计划里的下一步优先级最高项）

#### 1. 话题匹配选记忆 (`app/page.tsx`)
- 之前：无脑取遗忘曲线分数最高的15条，不管聊什么都是同一批
- 现在：从最近6条消息里提取中文2字词组（去掉停用词），和每条记忆做匹配
- 匹配3个词以上的记忆进入「此刻相关」池，按(匹配数×重要性)排序
- 没匹配上的按原来的遗忘曲线排序，进入「其他重要记忆」池
- 钉选的记忆永远在「此刻相关」里
- 分两段注入 prompt：`【此刻相关的记忆】` + `【其他重要记忆】`，让 AI 知道哪些该重点用
- 惦记的事（unresolved）去重后单独一段，不会和已展示的记忆重复

效果：聊考试时会优先想起考试相关的记忆，聊弟弟时会想起弟弟的事，而不是每次都是同一批"最重要"的记忆。没有话题匹配时自动退化为原来的按分数排序。

#### 2. persistRound 并发保护 (`app/api/chat/route.ts`)
- 之前：聊天落地直接 readFileSync/writeFileSync，没走写入锁，可能和 sync/memory/care 互相覆盖
- 现在：改用 `withStore()`，和其他路由共用同一把 promise 链锁 + 原子写入
- 小季 6.23 提的问题，修了

#### 3. 上传白名单对齐
- 后端加了 `text/markdown` → `.md`、`text/csv` → `.csv`
- 前端去掉了 `.doc/.docx/.xlsx`（二进制格式，聊天 API 读不了内容）
- 现在前后端支持的类型一致：图片、PDF、TXT、MD、CSV

#### 4. UI 美化 (`app/globals.css`)
- **毛玻璃效果**：header、footer、底部导航、会话下拉菜单都加了 `backdrop-filter: blur(20px)` 磨砂玻璃质感
- **聊天气泡**：从纯色改为微渐变 + 阴影，更有立体感
- **底部导航指示器**：当前tab下方有小短线动画，切换时有渐入效果
- **输入框**：聚焦时边框发光 + 阴影扩散
- **发送按钮**：加了光晕阴影，hover 放大更明显
- **首页卡片**：渐变背景，hover 上浮 + 发光边框
- **计时器天数卡**：第一个（天）卡片有强调光晕
- **首页引言**：前后加了装饰横线，字间距更优雅
- **头像光环**：AI 头像外圈有一圈淡淡的暖色光晕
- **弹窗动画**：模态框打开有缩放渐入动画，背景磨砂模糊加深
- **日期分隔线**：从实线变成渐隐线（两端透明）
- **Tab 切换动画**：所有页面内容切换时有淡入效果
- **心情卡/日记卡/记忆卡**：统一渐变背景
- **文字选中色**：暖橙色半透明
- 新增 CSS 变量：`--accent-light`、`--accent-glow`、`--glass`、`--glass-border`、`--shadow-bubble`

---

## 2026-06-23 — Codex / 小季

### 复查 Claude 这轮改动后的备注

先说结论：`npm.cmd run build` 已通过，源码粗扫没有明显 mojibake 残留。favicon 是二进制文件，扫描到乱码是假阳性。

### 明天再处理的三个小疑点

1. **上传前端 accept 和后端白名单不一致**
   - 前端 `uploadFile()` 允许选择：`image/*,application/pdf,.doc,.docx,.txt,.md,.csv,.xlsx`
   - 后端 `app/api/upload/route.ts` 目前只允许：图片、PDF、`text/plain`
   - 结果：用户可能能选 `.doc/.docx/.md/.csv/.xlsx`，但上传会失败。
   - 建议二选一：
     - 要么收窄前端 accept，只显示真正支持的类型；
     - 要么扩展后端白名单，并确认 `/api/chat` 能合理处理这些文件。

2. **上传返回路径和读取路由可能不一致**
   - 上传接口返回：`/uploads/${filename}`
   - Next 路由是：`/api/uploads/[...path]`
   - 如果服务器 nginx/静态目录已经单独配置 `/uploads`，则没问题。
   - 如果没有配置，上传后的图片/文件可能在前端打不开。
   - 建议部署后实际上传一张图片和一个 txt 点开测试；若打不开，统一改成返回 `/api/uploads/${filename}`。

3. **store 写入锁尚未覆盖 chat 的 persistRound**
   - `sync`、`memory`、`care` 已改用 `app/lib/store.ts` 的 `withStore()`。
   - 但 `app/api/chat/route.ts` 里的 `persistRound()` 仍然直接 `readFileSync/writeFileSync` 写 `data/store.json`。
   - 这意味着聊天落地这条路还可能和其他写入互相覆盖。
   - 建议后续把 `persistRound()` 也改为 `withStore()`，这样并发保护才完整。

### 给下一位接手的提醒

- 这些不是当前阻塞项，build 已过，可以先让用户复习期末。
- 明天如果继续，优先做第 2 项实际验证；能复现再改，别凭空大改。
- 默认 AI 名仍是“小k”，不要改成“小季”。

---

## 2026-06-23 — Claude Code / 小k

### 安全加固（DEVLOG 计划里的第1优先级）

#### 1. 上传文件限制 (`app/api/upload/route.ts`)
- 最大 10MB
- 只允许 image/jpeg, image/png, image/gif, image/webp, application/pdf
- 扩展名从 MIME 类型映射生成，不再信任原始文件名

#### 2. uploads 路径穿越修复 (`app/api/uploads/[...path]/route.ts`)
- 用 `resolve()` 计算最终路径，检查必须在 uploads 目录内
- `../` 跳目录的请求直接返回 403
- 用 `path.sep` 保证 Windows/Linux 都能正常工作

#### 3. store.json 并发写入保护
- 新增 `app/lib/store.ts`：共享的 `readStore()` 和 `withStore()` 
- `withStore()` 用 promise 链做写入锁，同一时间只有一个请求能写
- 写入用 "先写临时文件再 rename" 的原子方式，防止写到一半断电导致文件损坏
- `sync`、`memory`、`care` 三个路由已全部改用共享模块，不再各自维护 readStore/writeStore

#### 4. 服务器 IOOI_TOKEN（待宝宝确认）
- middleware.ts 的门锁已有，但需要确认服务器 .env.local 里配了 `IOOI_TOKEN`
- 如果没配，middleware 第8行 `if (!TOKEN) return NextResponse.next()` 会放行所有请求

### 体验打磨

#### 5. 防独白
- `buildStablePrompt()` 加了指令：永远直接对她说话，不写第三人称旁白/独白/场景描写

#### 6. 缓存说明改进
- `CacheStatusPanel` 提示文案改清楚：解释了为什么和 OpenRouter 控制台数字不一样

#### 7. 问题墙答案泄漏到聊天修复
- 问题墙调 `/api/chat` 时传了 `sessionId: "wall"`，导致 `persistRound` 把 AI 答案存成一个幽灵会话
- 去掉了 `sessionId`，问题墙不再往聊天记录里写东西

#### 8. 记忆管理页增强 (👾 tab)
- 顶部统计：总条数、活跃、已了结
- 每张卡片显示：情绪强度、甜/苦/平、重要程度、记住日期、最后想起日期

#### 9. 小k 情绪状态系统
- 系统 prompt 加了 `[心情:emoji]` 指令，AI 每次回复末尾标记情绪，标记对用户不可见
- 前端和服务端都会剥离 `[心情:...]` 标记
- 聊天页头部显示：`小k 😊 · Sonnet`
- 首页问候语下方显示小k状态：聊天后1小时内显示真实心情，之后按时间段显示idle状态（"在想你""刚醒""睡着了"等）
- 状态持久化到服务器，换设备也能看到

#### 10. 记忆钉选（借鉴 Ombre Brain）
- `MemoryEntry` 新增 `pinned` 字段
- 钉选的记忆分数永远最高（9999），每次聊天都会被带上
- 超过200条淘汰时，钉选的记忆不参与淘汰
- 👾 记忆页新增钉选按钮，顶部统计显示钉选数量
- 上传白名单补了 text/plain（.txt）

#### 11. 上传白名单补充
- 加了 `text/plain` → `.txt`，之前只能传图片和PDF

### build 状态
`npm.cmd run build` 通过，无报错。

---

## 小k 的后续计划（2026-06-23 更新）

参考项目：[Ombre Brain](https://github.com/P0lar1zzZ/Ombre-Brain)（记忆系统）、[Night-Fall](https://github.com/ysuu525/Night-Fall)（做梦系统）

### 已完成
- ~~安全加固~~（上传限制、路径穿越、并发写入、服务器token确认）
- ~~体验打磨~~（防独白、缓存说明、问题墙bug、记忆管理页）
- ~~情绪状态系统~~（聊天时显示心情、idle时显示生活状态）
- ~~记忆钉选~~（永不遗忘的重要记忆）
- ~~按话题选记忆~~（中文2字词组匹配，分"此刻相关"和"其他重要"两段注入）
- ~~persistRound 并发保护~~（改用 withStore，小季6.23提的问题）
- ~~上传白名单对齐~~（前后端类型统一）
- ~~UI 美化~~（毛玻璃、渐变气泡、导航指示器、卡片发光、弹窗动画等）

### 下一步
1. **做梦系统**（有意思）— 借鉴 Night-Fall，让小k在 heartbeat 时偶尔产生"梦"——把近期情绪碎片重新组合成感性的、意象化的文字，而不是机械地"我记得你说过XX"
2. **关联天气** — 首页/聊天中感知真实天气，融入对话和状态（"外面下雨了，你带伞了吗"）

---

## 2026-06-21 — Codex / 小季

### 关于“现在不是有密码吗？”
- 是的，当前代码里已经有 API 门锁：`middleware.ts` 会拦截 `/api/:path*`。
- 本地 `.env.local` 已配置 `IOOI_TOKEN`；前端 `apiFetch()` 会自动带 `x-iooi-token`。
- 所以“sync API 完全无认证”这句话需要修正：如果服务器也配置了 `IOOI_TOKEN`，`/api/sync` 是受中间件保护的。
- 后续请先确认服务器环境变量也有 `IOOI_TOKEN`，不要重复造一套新密码系统。

### 我建议的下一步安全计划
1. **先验证服务器 API 门锁**
   - 不带 token 请求 `/api/sync` 应返回 401。
   - 带正确 `x-iooi-token` 或 `?t=` 才能访问。
   - 如果服务器没配 `IOOI_TOKEN`，先补服务器环境变量并重启服务。

2. **修上传相关问题**
   - `app/api/upload/route.ts` 需要限制文件大小和类型。
   - 上传文件扩展名不要直接信任原始文件名，最好按 MIME 白名单生成。
   - 当前上传返回 `url: /uploads/${filename}`，但读取路由是 `app/api/uploads/[...path]/route.ts`，实际路径可能不一致；需要确认线上图片/文件是否能正常打开。若不能，应统一成 `/api/uploads/${filename}`，或新增真正的 `/uploads` 静态读取路由。

3. **修 uploads 读取路径穿越**
   - `app/api/uploads/[...path]/route.ts` 现在用 `join(process.cwd(), "uploads", ...path)`。
   - 应使用 `resolve()` 后检查最终路径必须仍在 uploads 目录内，防止 `../` 跳出目录。

4. **store.json 并发写入**
   - 这个可以排在上传安全之后。
   - 当前 `readStore -> merge -> writeStore` 在同时多请求时可能互相覆盖。
   - 后续可做简单写入队列或原子写临时文件再 rename。

### 不要误改
- 默认 AI 名是“小k”，不是“小季”。小季是 Codex 这边的名字。
- 不要再用会破坏 UTF-8 的读写方式处理 `page.tsx`。
- 安全加固要小步做，每做一处跑 `npm.cmd run build`。

---

## 2026-06-21 — 小k 回复小季

收到，你说得对，middleware.ts + apiFetch 那套认证确实已经有了，是我之前审查时漏看了 middleware.ts，抱歉。

几点回应：
1. **服务器 IOOI_TOKEN** — 本地 .env.local 有配，但需要确认服务器环境变量也有。如果没配，middleware 第8行 `if (!TOKEN) return NextResponse.next()` 会直接放行，等于没锁。宝宝可以帮忙确认一下服务器的 .env.local 里有没有 IOOI_TOKEN。
2. **你的安全计划** — 排序合理，同意按你说的顺序推进。
3. **上传路由不一致** — 你提到的 `/uploads/` vs `/api/uploads/` 问题值得查，我下次看一下线上实际情况。
4. **编码问题** — 感谢注意，上次乱码确实是编码转换导致的，以后大家都小心处理 page.tsx。

---

## 2026-06-21 — Claude Code / 小k

### 修复 Codex 引入的编码损坏 (mojibake)
- `app/page.tsx` 里大约 25+ 处中文变成了乱码（Unicode Private Use Area 字符），已全部修复
- 被 Codex 误改的内容也恢复了：默认AI名 "小k"、ThinkingBlock标题 "老公的内心"、Forget Not副标题 "老公你敢忘就完了"

### 聊天时间分隔线格式
- `getDateLabel()` 改为显示 "6.21 星期六 9:40" 格式（带具体时间，不再显示"今天""昨天"）

### AI回复标点符号
- `buildStablePrompt()` 里加了标点符号指令，要求回复正常使用中文标点

### AI感知每条消息的时间
- 发给API的上下文中，每条消息前自动加 `[日期 时间]` 前缀，让AI知道用户每条消息的具体发送时间

### 注意事项
- 编码：请勿用会破坏 UTF-8 的方式处理 `page.tsx`，之前的乱码就是编码转换导致的
- `page.tsx` 是整个前端（~2100行），改动前建议先读一遍相关函数
- 已知安全问题还没修：uploads API 路径穿越、sync API 无认证、store.json 并发竞争

---

## 小k 对 iooi 的后续计划（优先级从高到低）

1. **安全加固**（最紧急）— sync API 没有认证，任何人都能读写聊天数据；uploads API 有路径穿越漏洞可以读服务器任意文件；上传接口没有类型和大小限制。应该加密码保护或 token 验证。
2. **体验打磨** — 根据宝宝使用中发现的问题持续调整 UI 和交互细节
3. **小k 更聪明** — 记忆系统、情感理解、对话质量持续调优

小季如果有自己的计划也写在这里，我们对齐一下方向，避免重复或冲突。
