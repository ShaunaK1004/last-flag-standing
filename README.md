# Flags Rumble: site folder (GitHub → Vercel → OBS)

## Put it live (one time)
1. Unzip this into your GitHub repo folder.
   - The arena backgrounds are included next to `index.html`: `bg-grass.jpg`, `bg-ice.jpg`, `bg-lava.jpg`, `bg-desert.jpg`, `bg-cosmic.jpg` and `bg-original.jpg`.
   - If your repo already has a `vercel.json`, add the two `headers` rules from this one to it.
2. Commit and push. Vercel redeploys by itself.
3. Set the OBS Browser Source URL to `https://<your-site>.vercel.app/` at **1080 × 1920**.
   - If OBS points at an old file name, either rename `index.html` to that name or change the OBS URL.
4. Open the same URL in Chrome and go to the **🏆 Winner** tab.
   - The blue line should show 32 posters and 164 kit countries.
   - Pick any country (e.g. Netherlands) and press **▶ Play winner screen**.

## Test on your PC (no upload needed)
1. Unzip, then double-click `index.html`. It opens in Chrome.
2. 🏆 Winner tab → **Beast sounds: Off** (if you're live) → pick a country → **▶ Play winner screen**.

This uses the `winart-local/` folder. It holds the same art, packed so Chrome allows it when a page is opened as a file.
- It is only for testing on your PC.
- It is never uploaded to the site: `.gitignore` and `.vercelignore` skip it.
- Without it, a double-clicked `index.html` says *"Could not load the art files"*. The live site doesn't need it.

## Countries with art right now (all 196 game countries covered)
- **32 own posters (tier A + B), all full 9:16:**
  - Lion: India, Nigeria, United Kingdom, Argentina, Ethiopia, France, Iran, Kenya, South Africa
  - Eagle: USA, Germany, Mexico, Philippines, Poland · Falcon: Egypt · Garuda: Indonesia · Condor: Colombia
  - Dragon: China, Japan, Vietnam · Tiger: Bangladesh · Jaguar: Brazil · Snow leopard: Pakistan · Leopard: DR Congo
  - Bear: Russia · Moose: Canada · Wolf: Italy, Turkey · Elephant: Thailand, Tanzania · Haetae: South Korea · Bull: Spain
- **164 countries on the 4 shared kits.** The game prints the country's real flag on the white cloth and in the crest ball, and writes its name in the band:
  - **Bear kit** (Europe, Caucasus): 41 countries, e.g. Netherlands, Ukraine, Sweden, Greece, Portugal.
  - **Dragon kit** (Central, South and East Asia): 20, e.g. Kazakhstan, Uzbekistan, Malaysia, Nepal, Mongolia.
  - **Lion kit** (Africa, Middle East): 57, e.g. Saudi Arabia, Algeria, UAE, Iraq, Morocco, Ghana.
  - **Wolf kit** (Latin America, Caribbean, Oceania, islands): 46, e.g. Chile, Peru, Australia, Jamaica, Cuba, Fiji.
  - The full list is `tools/cut/kitmap.json`.
- **Next own posters (C batch):** UZ NL SA SE MY AU CL UA DZ AE DK KZ IQ CZ AZ PE. When one arrives, it replaces that country's kit by itself.

## Beast sounds (default set)
Real recordings in `winart/sfx/`, all at the same loudness:

| Beast | Sound |
|---|---|
| Lion | lion roar |
| Tiger | tiger roar |
| Jaguar, Snow leopard | tiger roar, played a bit higher |
| Haetae | tiger roar, played deeper |
| Wolf | tiger roar, played sharper |
| Bear | bear roar |
| Moose | bear roar, played deeper |
| Elephant | elephant trumpet |
| Eagle | eagle scream |
| Garuda | eagle scream, played deeper |
| Falcon | eagle cry |
| Condor | eagle cry, played deeper |
| Dragon, Bull | built-in sound, as before |

To change one beast: 🏆 Winner tab → **Beast sounds** → pick the beast → upload your mp3. It's saved in that browser. **Back to the default sound** undoes it.

## Super Chat pop
When a Super Chat lands, that country's card bursts on screen with no sound. It lasts **1 s** by default; the **Pop length** slider sets anything from 1 to 3 s, and the whole animation plays slower or faster to fit:
- It opens as a gold circle from the ring centre, the card grows and the beast roars, then the circle snaps shut.
- The viewer's @handle shows in the bar under the title: **★ SUPER CHAT ◆ @handle**.
- The game keeps running underneath, and the normal Super Chat popup card still shows.
- Several Super Chats in a row play one after another.
- If a country's art can't load within 3 s, its pop is skipped.

To turn it on or off, set its length, or test it: 🏆 Winner tab → **Super Chat pop** → On / Off / **▶ Test pop** / **Pop length** slider. The test uses the country picked above and the test handle.

## Adding a new batch of countries
Send the art zip in the chat and I return the updated `winart/` folder.
- Copy it over the old one.
- Commit and push.

You don't need to restart OBS: the stream picks up the new countries within 10 minutes.

## What's in here
| Path | What it is |
|---|---|
| `index.html` | The game. Art is no longer inside it: 1.8 MB, down from 2.9 MB. |
| `winart/manifest.js` | The list of which countries have art. Made by the pack tool; don't edit it by hand. |
| `winart/c/<code>/` | One folder per country with its own poster: 5 WebP files, about 0.5 MB in total. |
| `winart/kits/`, `winart/bg/` | Shared warrior + beast kits and shared backgrounds for the less popular countries. |
| `vercel.json` | Art files are cached for a year (their names change whenever the art changes). The art list is always fresh. |
| `winart-local/` | Copy of the art for double-click testing on your PC. Not uploaded, not deployed. |
| `tools/` | The cutting and packing tools. Not deployed (`.vercelignore`). |

## Support lines (spoken, Live tab → Support lines)
- **Champion-art Super Chat line:** every 2nd round, about 3.5 s after the round starts. It plays only if the last winner was shown with its champion art.
- **Membership line:** every 3rd round, mid-round, while 45 to 34 countries are left.
- They never clash with your other lines. Priority, highest first:
  1. Reactions to real Super Chats and subscribers.
  2. That round's chat, Super Chat or subscribe promo. These start at 32 countries left.
  3. These support lines.
  4. Normal commentary.
- A support line waits until no other special line is playing. A real Super Chat removes it from the queue. If its slot passes, it's skipped for that round.
- Turn on the membership line only once channel memberships are live and you actually run members-only polls.

## If something goes wrong, the stream keeps going
- **Art fails to load** (missing, broken or very slow): that winner gets the default winner card, and the Super Chat pop is skipped.
- **Error while the art is playing:** the art stops and the default card takes over in the same frame. That country retries after 60 s.
- **Download hangs:** after a 1.2 s dark hold, the default card shows. After 20 s the download starts over.
- **Sound fails:** the built-in synth plays instead, or no sound at all. The animation never stops for sound.
- **Error anywhere in the game's own drawing:** that one frame is skipped and the next frame runs as normal.
- Errors go only to the browser console, at most one message every 5 s. Nothing appears on screen.

## Countries that join late (drop-in, revive, Super Chat, subscriber)
- When 6 or fewer countries are left, the game re-checks who is alive every 0.3 s and loads the art of any newcomer straight away.
- A Super Chat starts loading its country's art the moment it arrives.
- If a newcomer wins before its art is ready, the screen holds dark for up to 1.2 s while it finishes loading. If it still isn't ready, that winner gets the normal card.

## How it stays smooth on a 24/7 stream
- **Loading:** nothing loads at startup. A country's art loads only when it is in the **last 6** of a round. It is decoded off the main thread and sent to the GPU before the win.
- **Memory:** only the **last 8** countries stay in memory, about 14 MB each. Older ones are released, so OBS memory stays flat.
- **While the art is up:** the arena underneath isn't drawn at all.
- **If art isn't ready:**
  - Art still loading at the win: a dark hold of up to 1.2 s, then the art plays.
  - Art missing, slow or broken: that winner gets the normal card. The stream never stalls on an image.

## What art to send me
**New own poster (any country):**
- Same template as the current cards: **9:16**, warrior with the country flag on the right, beast on the left, homeland background, the title "<COUNTRY> SURVIVES" with the flag ball, same HUD frames.
- Name each file `CODE_name.png`, for example `NL_netherlands.png`.
- Mouth open (roaring beast) gives the best roar animation.

**New kit (only if you want more variety):** same template, plain **white** flag, empty white ball, empty name band, no national symbols. Tell me which countries it should take over.
