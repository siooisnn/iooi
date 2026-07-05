# iooi 接线记录

## 称呼与协作

- 用户叫我“小季”。
- “季”和 g 同音，也有四季、长久陪伴的意思。
- 用户不熟代码和部署细节，沟通时要直接说人话：改了什么、会影响哪里、下一步怎么做。

## 项目位置

- 桌面原项目：`C:\Users\86158\Desktop\iooi`
- Codex 工作区副本：`C:\Users\86158\Documents\Codex\2026-06-18\new-chat\iooi`
- 优先改桌面原项目。改完后同步到工作区副本，避免后续读到旧版本。

## 部署方式

- 桌面入口脚本：`C:\Users\86158\Desktop\start-deploy-iooi.cmd`
- 实际部署脚本：`C:\Users\86158\Desktop\deploy-iooi.cmd`
- 双击运行后，看到 `password:` 时粘贴服务器密码并回车，通常需要输入两次。
- 部署脚本会先备份服务器上的 `data/store.json` 到 `data/backups/`，不要手动覆盖服务器数据文件。

## 当前状态

- Next.js 项目，核心代码仍主要在 `app/page.tsx`，文件偏大。
- 已新增组件：
  - `app/components/CacheStatusPanel.tsx`
  - `app/components/ContextDebugPanel.tsx`
  - `app/components/NotificationButton.tsx`
- 主动关心 heartbeat 已有设置页开关，默认关闭。
- `/api/care` 在 `settings.proactiveCare !== true` 时只安静检查，不会主动写消息或推送通知。
- 首页显示 heartbeat 日志入口；设置页不再显示旧 heartbeat 日志。
- 缓存命中面板可显示：状态、上下文条数、用户轮数、记忆数、摘要、读取缓存、写入缓存、估算命中率。
- 上下文调试面板可显示：当前会话条数、用户轮数、摘要字数、长期记忆数、上轮实际发送情况。

## 今天已完成

- 修复 `page.tsx` 清理旧残留后暴露的一批语法/乱码问题，`npm.cmd run build` 已通过。
- 修复设置页缓存命中、上下文调试组件的中文显示。
- 修复首页 heartbeat 弹层标题乱码，显示为 `💬 Heartbeat 日志`。
- 修复设置页“上下文调试”标题字体，使其和“缓存命中”一致。
- 修复日记页四个 tab emoji：`🐱 🐶 🐽 👾`。
- 修复聊天页分隔符，把误显示的 `路` 改回 `·`。
- 修复聊天消息里 heartbeat 图标乱码。
- 桌面项目已同步到工作区副本。

## 已验证

本地构建命令：

```bat
npm.cmd run build
```

最近一次构建已通过。

Next.js 会提示 `middleware` 文件约定未来建议换成 `proxy`，这是警告，不影响当前部署。

## 下一步计划

1. 小步拆 `app/page.tsx`，优先拆 `SettingsView`、`DiaryView`、`ChatView`，不要一次性大重构。
2. 继续清理历史乱码和被注释吞掉的旧片段，清一段 build 一次。
3. 观察 cached：Sonnet 稳定后，可以试 Opus，对比回复质感、延迟和缓存表现。
4. 后续可把缓存/上下文调试整理成更适合手机看的小折叠面板。
5. 继续保护服务器上的 `data/store.json`，部署包不要覆盖它。

## 注意

- 不要直接删除或覆盖服务器 `data/store.json`。
- 不要为了“变干净”一次性重构聊天、同步、记忆、缓存主逻辑。
- 如果以后只改了工作区副本，记得同步回桌面原项目再部署。
