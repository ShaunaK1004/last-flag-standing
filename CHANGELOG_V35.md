# V35 — Membership / Super Chat Priority

## Priority chat rules

- Normal non-member chat: normal country flag size and normal chat/equipment behaviour.
- Normal member chat: Alpha flag + normal-power shotgun.
- Super Chat or Super Sticker from a non-member: Alpha flag + shield + 2x-pellet shotgun.
- Super Chat or Super Sticker from a member: Alpha flag + shield + 2x-pellet shotgun + 2x-pellet sniper.

## Power / duration design

- Priority Alpha status lasts for a maximum of 10 seconds, then the flag returns to its previous size/level.
- Priority Super Chat/Sticker shield lasts for the same maximum 10-second window.
- Powered shotgun/sniper use finite volleys/shots; they do NOT fire continuously for 10 seconds.
- "2x power" is implemented as 2x projectile opportunities (4 shotgun pellets per volley instead of the normal 2; 2 sniper projectiles per shot instead of the normal 1). This keeps the effect powerful without making a guaranteed win.
- Normal shotgun/sniper behaviour remains unchanged.

## Removed

- The old normal-chat repeated-message / BIG FLAG escalation has been removed from gameplay.
- The old normal-chat giant-flag instruction has been removed from the HUD.

## YouTube event routing

`api/youtube-chat.js` now forwards YouTube Live Chat event metadata so the frontend can distinguish normal messages, members, Super Chats and Super Stickers. It also forwards relevant membership/Super Chat/Super Sticker metadata for future extensions.

Machine Gun is intentionally NOT added in V35; it can be added later as a separate equipment/physics system.

## UI layout update
- Removed the right-side **ENTRIES & POWER** panel entirely.
- Removed the right-side entries/shield/revival counters from the visible HUD.
- Moved the live **Entries: X / 64** counter into the first content line of the left **HOW TO JOIN!** box.
- Kept the country/equipment/member instructions as lines 2–4.
- Increased the left box height to fit the four content lines cleanly.
- Moved the dynamic **QUALIFICATION X OF 32** indicator lower so it clears the enlarged box margin.
