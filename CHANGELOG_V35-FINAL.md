# V35 Final — Membership / Super Chat / Super Sticker Priority Logic

## Final behavior
- Normal user chat: one live normal flag per user at a time; normal equipment behavior remains available.
- Member normal country chat: creates a NEW Alpha flag owned by that user with a normal-power shotgun; only one live flag for that user under normal/member chat.
- Member normal equipment/Shield/Revival messages continue to work even after the member Alpha exists.
- Super Chat/Super Sticker: always creates a NEW priority Alpha when a country is available; paid priority flags may duplicate under the same user.
- Super Chat/Super Sticker from a member: powered shotgun + powered sniper + shield, 10-second Alpha/protection window.
- Super Chat/Super Sticker from a non-member: powered shotgun + shield, 10-second Alpha/protection window.
- Super Sticker (and paid event) without a country never chooses a random country. A per-user pending reward counter is incremented and the next country typed by that same user consumes one pending reward and spawns that country as the paid Alpha.
- Existing same-country flags are never upgraded/reused for priority spawns.
- Normal/member-chat duplicate prevention checks actual live flags, not only the tracking map.
- When a normal/member-owned flag is eliminated, its user slot is released; if revived, the slot is restored.
- Colombia aliases include colombia, columbia and colambia.
- Paid priority shield is one elimination save during the 10-second window, not permanent invulnerability.
- Machine Gun is not included yet.
