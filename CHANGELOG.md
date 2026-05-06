# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Branch: `feat/ui`

### Added
- Add UIUX enhancement design spec — round table layout, card visual upgrade, chat bubbles, throw items, house rules info card, game log, mobile FAB (7d6d68e)

### Changed
- Migrate all styles to TailwindCSS v4 with unified dark theme (d9102ea)
- Remove unnecessary .js extensions from TypeScript imports (4b41cbc)

## [0.1.0] - 2026-05-06

Initial release of UNO Online multiplayer card game.

### Added
- Initial commit: UNO Online multiplayer card game with React client, Node.js server, and shared game logic (67fe2ca)
- Add dev mode: skip GitHub OAuth with username-only login (d5a68a4)
- Auto-sync database schema on server startup (c0ff7ea)
- Preserve room URL through login redirect (6d0dcf5)
- Polish game interactions and UX feedback (d224f93)

### Fixed
- 修复 UNO 游戏逻辑、状态同步与手牌显示问题 (46db68f)
- Fix user state lost on page refresh (7191a7f)
- Fix game reconnection and card play guards (c5cf0ff)
- Fix room state bugs: house rules disabled for owner, refresh loses players (85a9c66)
- Fix Caddy routing: distinguish auth API from SPA callback page (77e0fb4)
- Fix Caddy config: use CADDY_SITE_ADDRESS for HTTP/HTTPS flexibility (19e328d)

### Changed
- Default to HTTPS for all deployments (c8b2f0c)
- Derive CLIENT_URL from DOMAIN, remove redundant env var (2bbafee)

### Infrastructure
- Replace nginx with Caddy for automatic SSL (9b8af83)
- Remove unused nginx.conf (56e8bac)
