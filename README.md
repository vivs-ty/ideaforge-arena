# IdeaForge Arena

Turn raw ideas into community-polished concepts in minutes.

IdeaForge Arena now includes:

1. Supabase authentication (magic link email sign-in).
2. Real multi-user A/B voting stored in Postgres.
3. Shareable public room URLs (`/room/<slug>`).
4. Timed rounds, champion progression, evolution timeline, leaderboard.

## Deploy To Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vivs-ty/ideaforge-arena&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY&envDescription=Supabase%20project%20URL%20and%20anon%20key)

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase (Auth + Postgres)

## Local Setup

1. Install dependencies.

```bash
npm install
```

2. Create your local environment file.

```bash
cp .env.example .env.local
```

3. Add values in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

4. In Supabase SQL Editor, run `supabase/schema.sql`.

5. Run the app.

```bash
npm run dev
```

Open http://localhost:3000.

## Supabase Auth Settings

In your Supabase project:

1. Go to Authentication -> URL Configuration.
2. Set Site URL to your app URL.
3. Add redirect URLs for local and production:

- `http://localhost:3000`
- `https://<your-vercel-domain>`

Magic-link sign-in uses these URLs for return flow.

## Production Env On Vercel

In Vercel Project Settings -> Environment Variables, add:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Then redeploy.

## Room Sharing

- Create a room from the homepage.
- Share the generated room URL (`/room/<slug>`).
- Anyone can view; authenticated users can post and vote.

## Build

```bash
npm run build
npm run start
```
