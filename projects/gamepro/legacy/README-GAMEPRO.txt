GAMEPRO - Phase 2 Improved Build

Run with VS Code Live Server and open home page.html.

Improvements:
- Fixed broken login link and root-relative login image path.
- Rebuilt signup/login as a functional browser-local demo account system.
- Added persistent session and logout.
- Added Dashboard, Profile and Leaderboard pages.
- Added game launch activity + XP (+10 per game launch) and levels (100 XP/level).
- Fixed Terms link on signup.
- Preserved all 8 existing games and original visual assets.

Important: Authentication is localStorage-based for a college/demo build. It is NOT production security. For public deployment, replace it with Firebase Auth/backend authentication and server-side score validation.
