FLAGS WAR ARENA — Natural Female Commentary v24

Equipment/chat cycle correction:
- Automatic equipment cycle runs only during qualification battles.
- Automatic equipment loops through the complete equipment list and returns to the first item.
- The automatic cycle pauses completely during all knockout and final stages.
- Chat-triggered equipment, shield/revival powers, Wild Card/Alpha activation, and chat country admissions are blocked from spawning/activating during elimination stages.
- Chat country messages received during elimination stages are retained in the waiting list for the next qualification cycle.
- Elimination order is R32 → R16 → QF (R8) → SF (R4) → Final (R2); there is no separate bronze match. The podium still shows a dynamic 3rd-place semifinal loser, followed by 2nd and champion.
- After the champion reveal, the verified dynamic final leaderboard is displayed for 60 seconds, refreshed continuously from tournament results, then the presentation layer is fully hidden and a fresh qualification tournament starts in a loop.
- 32 base qualification flags remain: 20 fixed + 12 random from the 130-country pool. Chat may add the remaining slots only during qualification.


YouTube API bridge copied from the supplied Circular Ring production setup: api/youtube-auth.js and api/youtube-chat.js. See README_SETUP.md for Vercel/Upstash configuration.
