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

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

`typecheck` runs `next typegen` first because `tsc` alone fails on the generated route types, which do not exist until Next has written them.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Scheduled jobs

Three POST endpoints, each requiring `CRON_SECRET`. **Nothing schedules them
yet** — they answer 403 until the secret is set, and they only run when
something calls them. Whatever runs them (Supabase cron, a Netlify scheduled
function, an external cron) still has to be set up.

| Endpoint | What it does | Suggested cadence |
|---|---|---|
| `/api/jobs/crypto-watch` | Polls TRON for incoming USDT, credits on confirmations | every 1–2 min |
| `/api/jobs/reminders` | Renewal reminders at 7 and 1 day | daily |
| `/api/jobs/notifications` | P2-506 trade opened/closed and bot-stopped emails | every 5–15 min |

`notifications` only looks back one hour, so a gap longer than that silently
drops the notifications in it. That is deliberate — a trade email is only worth
sending while it is news — but it means the cadence matters: schedule it well
inside the hour, not at it.

Every send is recorded before it is attempted, so running any of these twice at
once cannot double-send. They under-send rather than risk repeating.
