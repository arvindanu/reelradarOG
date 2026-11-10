# REELRADAR — OTT discovery app

A responsive Next.js app for discovering recent movies and series across ten original languages, checking regional streaming providers, ratings, posters and YouTube trailers.

## Stack
- Next.js 15 App Router + React + TypeScript
- Tailwind CSS (with a custom cinematic responsive design system)
- TMDB API for discovery, metadata, ratings, artwork, trailers and watch-provider availability
- Vercel-ready API route with server-side token handling and 30-minute caching

## Run locally

1. Install Node.js 20.9+.
2. Create a TMDB account and request an API key / API Read Access Token: https://www.themoviedb.org/settings/api
3. Copy `.env.example` to `.env.local` and add your token:

   ```env
   TMDB_ACCESS_TOKEN=your_tmdb_api_read_access_token
   ```

4. Install and run:

   ```bash
   npm install
   npm run dev
   ```

5. Open http://localhost:3000.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. Import the repository at https://vercel.com/new.
3. In Project Settings → Environment Variables, add `TMDB_ACCESS_TOKEN` (Production, Preview and Development as desired).
4. Deploy.

Do not put the TMDB token in a `NEXT_PUBLIC_` variable. The API route keeps it on the server.

## Current capabilities
- Responsive desktop, tablet and mobile layouts.
- Discover, Movies, Series and Documentaries sections.
- Language filters: Malayalam, Tamil, Telugu, Kannada, English, Spanish, German, Japanese, Chinese and Korean.
- Region selector: India, US, UK, Germany, Canada and Australia.
- Search titles; display poster, year, original language and TMDB rating.
- Regional streaming provider logos and JustWatch availability link when TMDB returns them.
- Trailer thumbnail and YouTube trailer link when a trailer exists in TMDB.
- Documentary filter uses TMDB's Documentary genre (genre ID 99).
- Server-side API proxy, 30-minute cache and responsive loading/error/empty states.

## Data notes
- “Latest” is based on TMDB release/air dates in the last 120 days. It is a discovery feed, not a guarantee that every title is newly added to a streaming service.
- Streaming availability is country-specific and depends on TMDB's Watch Providers coverage. A missing provider result means no data was returned, not necessarily that the title is unavailable everywhere.
- YouTube trailer thumbnails are available only when TMDB has a YouTube video key. The modal falls back to a YouTube search link if no trailer key is available.
- TMDB attribution and branding requirements apply. This is an unofficial project and is not endorsed or certified by TMDB.
- For production/commercial use, review TMDB API terms and any third-party provider data licensing requirements.
