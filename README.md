# Mob Unlocker Challenge

Kill every mob! A Minecraft Bedrock add-on that tracks every mob a player
kills, tells everyone about each new unlock, and shows progress against a
fixed list of every mob in the game.

- Author: PrimeStrat
- Recommended Version: v1.26.50+

## Commands

- `/muc:progress` - shows your progress in chat (the global total when the
  Global Counter is on).
- `/muc:collection [filter]` - opens a list of killed `[X]` and missing `[ ]`
  mobs. The optional `filter` is `all` (default), `collected` (only what you
  killed), or `missing` (only what you still need).
- `/muc:settings` - opens the settings form.
- `/muc:reset` - operators only. Opens a warning form. If you confirm, it wipes
  ALL progress for every player and the global list. Offline players are reset
  when they join next.

## Settings

- Global Counter (default off) - when off, progress is per player. When on, you
  see the shared progress of all players.
- Disable Unlock Sound - no `random.orb` sound on unlock.
- Disable Unlock Message - no chat message on unlock.

## What counts as a kill

- The killer must be a player. Arrows, tridents, and other things you shoot
  count as your kill.
- Kills by pets, other mobs, lava, or falling do not count.
- Each mob type counts once. Variants (wolf types, cat colors, sheep colors,
  and so on) are all one entry.

## License

Copyright (c) 2026 PrimeStrat. All rights reserved.

Videos, streams, and monetized content are welcome. You can run it on your
server or put it in a modpack, as long as you credit PrimeStrat and link back
here. You cannot sell it, reuse the code, or re-upload your own version.

## Thanks

Thank you to [EvidentP](https://www.youtube.com/@EvidentP) for the support.
