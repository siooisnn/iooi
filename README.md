This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## susu’s phone

The XP desktop phone icon opens a read-only, night-blue phone inside the existing XP window. Start still has “回到 2026”. Its shortcuts open the original bookshelf, forum, blog and MSN windows and return to the phone.

Contents come directly from existing stores:

- Today: `store.lifeLog`, chronological in Shanghai time, using the latest mark when a reading sitting crosses midnight. No second heartbeat log is created.
- Collection: his progress in `reading.json`, his recent threads in `surf.json`, and titles from `store.blog.him.posts`. No post bodies are copied.
- Signature: the existing `store.blog.him.motto` field, changed through `blog_set_motto`.

The only new persistent store is `data/phone_settings.json`: a built-in wallpaper, the four dock positions, three card toggles and cat/moon/cloud toggles. Defaults render without creating the file. Notes and albums are deferred.

`GET /api/phone` uses existing iooi token protection and `Cache-Control: no-store`; browser writes are unavailable. The view refreshes while visible and on focus.

The existing MCP connection gains `phone_read` for read/life/full access and `phone_decorate` for full access only. Decoration validates the whole patch before writing and cannot change signatures, posts, reading progress or wardrobe data.

```json
{
  "wallpaper": "moon-mist",
  "icon_order": ["reading", "surf", "blog", "chat"],
  "widgets": { "today": true, "collection": true, "signature": true },
  "ornaments": { "cat": true, "moon": true, "clouds": true }
}
```

Wallpapers: `night-blue`, `moon-mist`, `deep-sea`. Icon order must contain all four apps once. Preview fixtures and screenshots belong only in ignored local `data/phone-qa/` and are excluded from releases. Deployment and GitHub push use the existing release gate with separate user authorization.

## dayday

dayday is being rebuilt as her real-money ledger with a small shop inside. Susu's old virtual wallet, heartbeat shopping, MCP tools, chat red packets and the old wardrobe backend were removed. The window is a placeholder for now. Old `store.dayday` data and old `dayday_card` chat messages are left untouched; old cards show as plain lines in the chat.

# 普通聊天小作品与作品盒

普通私聊（Claude/GPT）中完整的 `html` 围栏代码块会出现“预览小作品”，工作模式和群聊不接入。
单个 HTML 块也可搭配同一回复内的 CSS/JavaScript 围栏，推荐生成一个含内联样式和脚本的完整 HTML。
普通聊天有代码围栏时整条回复保存在同一气泡，保留代码中的空行；流式输出期间不会自动运行。

点开后在 XP 对话框预览，可切源码、手机/电脑尺寸、重新运行和下载 HTML；“存进作品盒”才会保存。
桌面和开始菜单的“作品盒”读取服务器 `data/artworks.json`，支持打开、改名、下载、收起和恢复。
相同源码重复保存会复用原作品；最多100件，每件20万字符，备份随现有 data 目录一起进行。
保存的是源文件，不保存运行中的游戏进度。列表不自动运行代码，打开的 iframe 在关闭窗口后销毁。

预览使用仅允许脚本的 sandbox iframe，不授予 same-origin、表单提交、弹窗、顶层导航或下载权限。
CSP在作品代码前插入，限制资源加载、网络请求和子框架；不支持依赖CDN、外部API或远程图片的作品。
模型只收到生成格式说明，不获得作品盒写工具，保存由她自己点按钮。

# 小砖共享存档与 DeepSeek

服务器私密环境文件中配置下列变量（不提交到 Git）：

```dotenv
CLAWD_DEEPSEEK_API_KEY=填入真实密钥
CLAWD_DEEPSEEK_MODEL=deepseek-flash
```

也兼容已有的 `DEEPSEEK_API_KEY`，小砖专用密钥优先。默认调用 DeepSeek 官方的
`https://api.deepseek.com/chat/completions`，默认模型为 `deepseek-flash`，关闭思考模式，
单次最多 256 输出 tokens、25 秒超时。模型名称可通过环境变量调整。
接口格式参考 [DeepSeek 官方文档](https://api-docs.deepseek.com/)。

按 iooi 受控发布流程上线。不要把 Key 写入网页、本地存储或 MCP 参数；前端仅收到配置是否齐全。
没有 Key 时照顾与换装可用，对话处如实显示尚未接好，睡着时只保存睡眠回应，不请求模型。

发布后先在原来养小砖的设备上打开小砖页面。首次访问把该浏览器的 `iooi-clawd` 和
`iooi-clawd-log` 导入 `data/clawd.json`。后来的设备读同一份服务器记录，不覆盖已经迁入的记录。
原本两个本地存储键不删除、不改写，保留作恢复来源；衣柜此前只是临时试穿，因此没有旧穿戴可迁移。
数据文件与现有 `data` 一起备份，损坏时停止写入。

共用记录保留最近 100 条来访、60 轮对话、200 个照顾操作回执；模型看到最近 12 轮对话和
当前真实状态，不读取 iooi 主聊天、博客、账本或 Summer 记忆。对话中会标明 小姿（妈妈）/酥酥（爸爸），双方都可见。
操作拒绝不计来访。相同操作重试复用 requestId，不重复扣增数值；网络失败后同一句话可重试。

iooi MCP 新增 `clawd_read`、`clawd_action`、`clawd_talk`，私聊 Claude 的工具列表也已接入。
照顾操作和说话固定署名酥酥，网页固定署名你，不能通过参数冒用另一方。
`clawd_action` 支持 feed/pet/play/bath/sleep/wake/wear。
wear 的 slot 为 head/body/hand，id 必须是对应现有饰品 ID，null 表示脱下。
life 连接只开放查看和照顾，不开放付费模型对话。设置中的“小砖”开关控制是否参与已有心跳的自己的时间；不额外增加定时任务或推送。成功照顾会记入“小砖”日志，关闭后会阻止尚未执行的照顾操作。

必要验证：`node --test tests/clawd*.test.mjs`、TypeScript、改动文件 lint。
模型测试使用模拟接口；配置真实 Key 并上线后再做一次真实对话验证。
