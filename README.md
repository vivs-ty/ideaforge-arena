# IdeaForge Arena

Turn raw ideas into community-polished concepts in minutes.

IdeaForge Arena is an interactive app where users:

1. Submit a rough one-sentence idea.
2. Start a timed 60-second improve round.
3. Submit a challenger version.
4. Vote in A/B battles between champion and challenger.
5. Watch the evolution timeline and contributor leaderboard update in real time.

The app uses local storage for zero-config demos, so anyone can clone and run instantly.

## Features

- Timed improvement rounds
- Head-to-head A/B voting with auto-close
- Champion idea progression
- Evolution timeline for each idea
- Leaderboard based on contributions
- Seed data for immediate exploration

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4

## Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Build

```bash
npm run build
npm run start
```

## Publish On GitHub

```bash
git init
git add .
git commit -m "feat: initial IdeaForge Arena"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

## Deploy

Deploy on Vercel for the fastest setup.

## Next Up

- Add Supabase auth for unique voters
- Add public rooms and share links
- Add moderation and profanity filters
- Add analytics for top improving prompts
