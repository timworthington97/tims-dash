# Tim's Dash

This app helps you track your total money in AUD.

## Supabase setup for private sync

1. Create a Supabase project.
2. In Supabase SQL Editor, run [`supabase/schema.sql`](/Users/timworthington/Documents/Codex financial app v1/supabase/schema.sql).
3. In Supabase Auth, enable email magic links.
4. Put these in `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL=...`
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...`

## The easiest way to open it on a Mac

1. Double-click [Launch Lattice Wealth.command](/Users/timworthington/Documents/Codex financial app v1/Launch Lattice Wealth.command).
2. Wait for the browser tab to open.
3. Keep that Terminal window open while you use the app.
4. When you are finished, close the Terminal window.

The first launch may take a minute because it installs what the app needs and prepares the app for use.

## If macOS blocks the launcher the first time

1. Right-click `Launch Lattice Wealth.command`
2. Choose `Open`
3. Click `Open` again

After that, you can usually double-click it normally.

## How to use the app

1. Open the app.
2. Click `Load Sample Data` if you want to try it quickly.
3. Add or edit your own cash, ETFs, crypto, and debts.
4. Use the tabs to switch between Dashboard, Holdings, Income & Expenses, Projections, and History.
5. On the dashboard, switch the forward view between `Liquid View` and `Bank Cash View`.
6. In History, add old month-end bank balances if you want a bank balance trend.
7. Click `Refresh` to pull current ETF and crypto prices.
8. Manual values recalculate instantly as you edit them. You only need `Refresh` for new market prices.
9. The main dashboard number shows your liquid money only: cash, ETFs, and crypto.
10. Sign in with a magic link if you want private syncing across devices.
11. Your holdings, cashflow entries, bank history, and refresh history are saved to your signed-in Supabase account. If you stay signed out, the app still works locally in your browser.

## Optional: better ETF reliability with your own free API key

The app already has a free fallback for Australian ETFs.

If you want an extra live ETF source:

1. Open the file `.env.local`
2. Add your free Twelve Data API key after `TWELVE_DATA_API_KEY=`
3. Save the file
4. Launch the app again

## If something looks wrong

- If an ETF shows `Delayed market data`, the price still worked, but it came from a delayed public market source.
- If a holding shows `Saved last price`, the latest refresh failed and the app kept the previous good price.
- If a holding shows `Unavailable`, the app could not get a live price for that symbol on the last refresh. Check the ticker or symbol and try again.

## Vercel deploy

1. Import this project into Vercel.
2. Add the same `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` environment variables in Vercel.
3. Deploy.
