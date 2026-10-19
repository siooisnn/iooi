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
