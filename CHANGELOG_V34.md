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
- Sequence is Qualification → R32 → R16 → QF (R8) → SF (R4) → Final (R2) → Winner Reveal → Podium (3rd → 2nd → Champion) → Final Tournament Leaderboard → fresh Qualification cycle.
- Tournament result state is cleared at the end of each leaderboard so the next cycle rebuilds the leaderboard dynamically.


## Cycle / Leaderboard Fix
- Fixed the final leaderboard being rendered underneath the still-visible podium presentation.
- The verified leaderboard DOM is now the authoritative visual during the 60-second leaderboard phase.
- Leaderboard rows/stats are rebuilt continuously from the current tournament result state.
- Fixed the leaderboard-to-qualification boundary: podium audio/presentation is stopped, the overlay is hidden, and a new qualification round is spawned. A transient startup error retries instead of freezing the stream.
- Elimination structure is now Qualification → R32 → R16 → QF (R8) → SF (R4) → Final (R2) → Winner Reveal → Podium → Dynamic Final Leaderboard → new Qualification.
- Removed the separate bronze match; 3rd place is selected from the semifinal losers using qualification survival as the deterministic tiebreak.


## Equipment Cycle / Chat Trigger Fix
- Guaranteed 5 default-cycle equipment spawns at the start of every battle round.
- Default automatic equipment cycle continues sequentially and is capped at 13 default spawns per round.
- Default cycle timer resets for every qualification/knockout battle round, preventing later rounds from inheriting a stale timer.
- Chat-driven equipment is independent of the default cap and has no default-spawn minimum/maximum restriction.
- Added direct chat triggers for KATANA and ELECTRIC.
- Fixed FLAME SWORD being incorrectly detected as generic SWORD/KNIFE.
- Fixed KATANA being incorrectly detected as generic SWORD/KNIFE.
- Removed the final-leaderboard background audio playback and deleted `podium_audio/final_leaderboard_kulakovka_first_60s.wav`. The final leaderboard remains visual-only; podium third/second/champion audio is unchanged.
