# gunsbattle.io

## Overview
A multiplayer .io shooter game (like swordbattle.io but with guns) built with Node.js, Express, Socket.io, and PostgreSQL.

## Architecture
- **Server**: `server.js` - Express + Socket.io server with auth, shop, game state, physics, collisions, map objects
- **Client**: `public/` directory
  - `public/index.html` - Main HTML with loading screen, auth forms, menu, shop, leaderboard, game canvas, HUD, death screen
  - `public/css/style.css` - Full styling with dark green theme, shop UI, auth forms, ping display, gun selector
  - `public/js/game.js` - Client game logic: rendering, input, WebSocket, interpolation, shop/auth UI, map objects, pickups
  - `public/images/` - 2D game assets (grass_tile, gun sprites, rocks, bushes, trees, crates, healthpack, coin, crown)

## Database (PostgreSQL)
- `users` - Account data: username, password_hash, coins, selected_skin/gun, stats
- `user_skins` - Purchased skins per user
- `user_guns` - Purchased guns per user
- `session` - Express sessions (auto-created by connect-pg-simple)

## Key Features
- WebSocket-based real-time multiplayer (Socket.io)
- Account system (register/login/logout) with bcrypt password hashing
- Guest play (no account needed)
- Shop with 12 skins and 4 guns (pistol, rifle, shotgun, sniper)
- Coins earned per kill (25 coins), persisted to database
- 2D map objects: rocks (collision), bushes (decorative), trees (collision), crates (collision)
- Health pickups that respawn every 15 seconds
- Bullets collide with map objects
- Ping display in HUD
- Gun switching with 1-4 keys (server-validated ownership)
- Gun stats shown in shop (damage, speed, fire rate)
- Loading screen with progress bar
- Smooth movement with client-side interpolation (lerp)
- Different gun mechanics (shotgun spread, sniper high damage, rifle rapid fire)
- Player eyes on character sprites
- Health bars, kill feed, leaderboard, minimap, HP bar HUD
- Death/respawn system with spawn collision avoidance
- Global leaderboard (database-backed)
- 5000x5000 game world with seeded map generation

## Map Objects
- 60 rocks (2 variants, collide with players/bullets)
- 80 bushes (2 variants, decorative only)
- 30 trees (collide with players/bullets)
- 15 crates (collide with players/bullets)
- 20 health pickups (heal 30 HP, respawn after 15s)

## Running
```
node server.js
```
Runs on port 5000.

## Dependencies
- express, socket.io
- pg, connect-pg-simple, express-session
- bcryptjs
