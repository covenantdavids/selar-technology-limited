# SureTask — Phase 1

This is the uploaded website converted into a runnable Next.js project. The original source is preserved verbatim at `original/selar-landing.html`. The route handler serves that source with minimal URL/navigation substitutions; its styling, text, and layout remain unchanged.

## Run in VS Code

1. Install Node.js LTS from https://nodejs.org (npm is included).
2. Unzip this project and open the `selar-technology-limited` folder in VS Code.
3. Open **Terminal → New Terminal**.
4. Run `npm install`.
5. Run `npm run dev`.
6. Open http://localhost:3000 in your browser.

## Important limitations

- This is **Phase 1 only**. There is no Supabase connection, real login, account creation, payout saving, database, wallet, or admin panel yet. The original registration/payout flow is browser-only and does not persist across navigation.
- The uploaded file has no actual login, Terms, Privacy, Support, My Submissions, Wallet, Inbox or Profile page implementations. Routes exist, but missing content is not invented. `/login` reuses the registration visual and is **not** a working login.
- The uploaded HTML contains sample wallet values, generated task cards and a 10-minute unlock timer. These remain exactly as uploaded until backend data replaces them. **Do not use this build as a live earning service.**
- No payment gateway is installed; no payments can be made.
- The original CSS includes some purple/pink and yellow accents. They were intentionally left unchanged in accordance with the latest instruction not to edit the design.

## Next step

After verifying the Phase 1 visuals and routes, Phase 2 can add Supabase Auth, Postgres, RLS, server-side validation, a private admin area and a manual-payment ledger.
