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

dayday is Susu's virtual shop and account. It starts **disabled**, with no products or balance. Control Panel → **day day** controls it; **dayday → 设置** uploads product images, sets categories (including custom categories), prices, available stock and daily-goods consumption. Blank stock means unlimited. Daily goods can specify a whole number of days or calendar months per pack; additional packs queue after existing supplies. Editing a product affects future purchases only. Preview goods and the old local preview bag are not imported into the real account.

`store.dayday` holds the wallet, no-interest bank balance, products, immutable order-line snapshots, ledger, idempotency receipts and heartbeat reservations. Amounts are integer cents. Purchases, stock, money and the `dayday` life-log entry commit together through the shared main-store lock; normal browser sync cannot overwrite this key. Corrupt main JSON stops writes instead of starting a fresh account. Browser writes use `/api/dayday` with the existing iooi authentication; only this human-authenticated route can configure the switch or products. Repeated financial requests must reuse their request ID.

The monthly allowance is **¥2000 on the 15th in Asia/Shanghai**. Leftovers accumulate. Disabled intervals do not accrue allowances, and enabling after the 15th does not backfill earlier payments. Opening on the 15th pays that month once. A heartbeat or command settles an elapsed eligible payday. Bank transfers conserve wallet + bank funds; there are no loans or interest. Food orders cannot be refunded; orders containing no food can be refunded in full within ten minutes, at their original paid amount. Mixed orders containing food cannot be refunded as a whole. Coupons, full-reduction promotions and partial refunds are deferred.

`/api/care` runs dayday on the existing half-hour heartbeat. Defaults are breakfast at 08, lunch at 12, dinner at 18, and browsing at 10, 15, 20 and 22; settings allow 3–12 daily opportunities and independent meal/browsing switches. Missed hours are not replayed in a burst. The model decides to buy, browse, save/withdraw, contact the shopkeeper or skip; code executes and records the outcome, rather than trusting a claim of successful payment. Each slot is reserved before calling the model, and closing/reopening invalidates in-flight decisions. The disabled path makes no model call. Logs appear in **heartbeat → dayday**. Purchases, refunds, insufficient balance (deduplicated for an hour), and customer-service requests use the existing push subscription; browsing/skip only writes the log. Notification errors never roll back a purchase.

MCP adds `dayday_read` (read/life/full), and `dayday_buy`, `dayday_refund`, `dayday_bank`, `dayday_activity` (full only). No MCP tool changes products, prices, stock, allowances or the master switch. Closed dayday refuses catalog access and new activity; eligible existing refunds remain available. `dayday_read` amounts are in cents; `dayday_bank.amount` is yuan. The human page can manage the shop while closed and shows actual orders, balance, inventory and monthly net spending. Its shopping bag/wishlist remain local to the browser.

First funding is an explicit **one-time ¥2000 grant** in dayday → 设置. It is human-only, can be prepared while closed, does not enable dayday, and is separate from recurring allowances. Repeating the request or using a different request ID cannot grant it twice.

Private Claude chats support one `[dayday_money kind="redpacket|transfer" amount="52.00"]message[/dayday_money]` block per reply; the stream hides complete and partial blocks. `dayday_send` provides the same send operation for full MCP clients. Sending saves a real chat card and the hold atomically, to an existing private session only. A deterministic per-round request ID prevents duplicate payments after reconnection. The human card reads authoritative transfer state through `/api/dayday?transfer=ID`; ordinary chat text or message sync cannot settle money. The human may accept or return a pending card even while dayday is closed. Pending amounts are held out of available funds, cannot be spent/deposited/resent, and only become expenses upon acceptance. Returns and 24-hour expiry release the hold without expense. Each transfer settles once under the main store lock; MCP cannot grant funds or accept on the recipient's behalf. Old v1 accounts migrate these new fields in memory without replacing existing balances/orders.

The human has a separate virtual account in **dayday → 设置 → 我的虚拟额度**, with a one-time initial **¥500** and no automatic monthly allowance. Migration credits already accepted legacy Susu-to-human transfers once; an existing human balance (including zero) is never reset. Human sends hold only human funds. Susu receives/returns an incoming transfer through `dayday_receive` (full MCP only), a hidden `[dayday_receive id="..." decision="accepted|returned"][/dayday_receive]` reply block, or an existing scheduled life opportunity. Only `human_to_susu` transfers qualify; the human API cannot decide for him, and MCP cannot spend human funds. Settlement atomically debits the sender and credits the recipient. Human sends are user-side chat cards and the toolbar's **红包/转账** button follows **抖一抖**. Sending triggers a normal private reply while keeping unsent text/attachments intact. A new empty private window can save its first card atomically. Dayday's master switch still gates new activity.

**买来送酥酥** on product details, or **用我的额度买来送酥酥** in the cart, charges the human account and adds goods to Susu's inventory with human-gift provenance. Stock, current prices, consumption and whole-order refund rules remain shared. Gift refunds return to the human payer; Susu cannot refund her gift orders via MCP. The personal account lists incoming/outgoing transfer status and human money movements, including gifts purchased and their refunds. The human setup action `human_initialize` is owner-only and persists the one-time migration without changing Susu's recurring allowance.
