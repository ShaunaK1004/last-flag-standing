# v34 — Direct Shield / Revival Chat Trigger Fix

Shield and Revival now trigger directly from a valid chat keyword.

- `SHIELD` = one direct Shield use.
- `REVIVAL` / `REVIVE` / `COMEBACK` = one direct Revival request.
- No 10-message threshold.
- The 10/10 counters represent the maximum available uses for the tournament.
- Shield requires the viewer's own spawned flag.
- Revival requires the viewer's own eliminated flag.
- Invalid/ineligible requests do not consume a use.
- Existing equipment, podium, leaderboard, and tournament logic is retained.


## Verified Podium + Leaderboard Integration
- Restored the supplied verified 9:16 podium presentation and leaderboard presentation as the sole PODIUM/LEADERBOARD visuals.
- Preserved the existing tournament logic for dynamic third place, second place, champion, tournament result stages, commentary, and celebration audio.
- Sequence remains Qualification → Knockout/Elimination stages → Podium (3rd → 2nd → Champion) → Final Tournament Leaderboard → fresh Qualification cycle.
- Tournament result state is cleared at the end of each leaderboard so the next cycle rebuilds the leaderboard dynamically.
