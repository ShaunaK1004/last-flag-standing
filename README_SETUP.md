# FLAGS WAR ARENA — shared realtime YouTube chat

This build changes the YouTube chat architecture so **desktop, mobile and OBS do not each poll YouTube**.

## Architecture

```text
YouTube Live Chat
       |
       |  ONE liveChatMessages.list poll (>= 10s)
       v
Vercel /api/youtube-chat
       |
       v
   Upstash Redis
       |
       +---- Desktop
       +---- Mobile
       +---- OBS/browser
```

The browser clients poll the shared Redis feed every ~1 second. Those requests do **not** call YouTube. Only the elected server leader calls YouTube, so opening 2, 5 or 20 browser clients does not multiply YouTube quota usage.

## Why 10 seconds?

The build deliberately enforces a **10-second minimum server-side YouTube poll interval** and also respects YouTube's returned `pollingIntervalMillis`.

Planning conservatively at 5 quota units per live-chat read:

- 5 hours × 3600 / 10 = 1,800 YouTube reads
- 1,800 × 5 = 9,000 quota units
- 10,000 daily default leaves ~1,000 units for broadcast resolution/recovery and safety

Chat messages are batched. A chat message does **not** cost one YouTube request; many messages can arrive in one `liveChatMessages.list` response (up to 2,000 requested here).

## Required Vercel environment variables

Keep the existing YouTube variables:

- `YOUTUBE_OAUTH_CLIENT_ID`
- `YOUTUBE_OAUTH_CLIENT_SECRET`
- `YOUTUBE_OAUTH_REFRESH_TOKEN`
- `YOUTUBE_API_KEY` (keep if already configured)

Add these two from Upstash Redis:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

## Add Upstash Redis

In Vercel:

1. Open your project.
2. Open **Marketplace / Storage**.
3. Select **Upstash Redis**.
4. Create/link a Redis database to this project.
5. Let the integration inject the Redis environment variables.
6. Redeploy the project.

Vercel's current Marketplace supports Upstash Redis and automatically injects the required environment variables into the linked project.

## Important

Do not restore the previous 1–2 second YouTube API polling code. The **1-second interval is only the browser-to-shared-feed check**. YouTube itself is read by the server at >=10 seconds.

## Realtime behavior

A YouTube message follows:

```text
YouTube message
   -> shared server poll
   -> Redis event buffer
   -> every connected browser
   -> ingest()
   -> current qualifying round immediately
```

There is no delayed country-join queue. Messages fetched in a batch are processed immediately and in chronological order. A message can never be intentionally carried into a later round.

## New live stream

When the previous chat ends, the shared state is marked offline and the next sync resolves the new active broadcast. The event buffer is cleared when a genuinely new broadcast is detected, preventing yesterday's chat from spawning flags in today's stream.


## Current Vercel/Upstash setup

The Vercel Upstash integration creates these variables automatically:
- KV_REST_API_URL
- KV_REST_API_TOKEN
- KV_REST_API_READ_ONLY_TOKEN
- KV_URL
- REDIS_URL

The API uses KV_REST_API_URL + KV_REST_API_TOKEN.

## Realtime / quota design

- Browsers read the shared Redis feed every 5 seconds.
- Only the shared server leader polls YouTube.
- The server never polls YouTube faster than 10 seconds and never faster than
  YouTube's returned pollingIntervalMillis.
- Desktop and mobile therefore do not independently consume YouTube live-chat
  quota.
- Chat messages are processed in the current active round and are not queued
  into future rounds.


## Square Ring edition

`index.html` is the uploaded Square Ring simulation. Its arena geometry,
physics, equipment, commentary, tournament stages, and visual rendering are
kept from the supplied Square Ring file. Only the live-chat transport is
quota-managed using the shared server poller + Vercel/Upstash Redis bridge.

Use the Redis variables already created by Vercel:
- KV_REST_API_URL
- KV_REST_API_TOKEN

Keep the existing YouTube OAuth variables unchanged.
