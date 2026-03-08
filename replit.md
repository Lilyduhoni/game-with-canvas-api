# gunsbattle.io

## Overview
A multiplayer .io shooter game (like swordbattle.io but with guns) built with Node.js, Express, Socket.io, and PostgreSQL.

## Architecture
- **Server**: `server.js` - Express + Socket.io server with auth, shop, game state, physics, collisions
- **Client**: `public/` directory
  - `public/index.html` - Main HTML with loading screen, auth forms, menu, shop, leaderboard, game canvas, HUD, death screen
  - `public/css/style.css` - Full styling with green grass theme, shop UI, auth forms
  - `public/js/game.js` - Client game logic: rendering, input, WebSocket, interpolation, shop/auth UI logic
  - `public/images/` - Game assets (grass_tile, gun sprites, coin, crown)

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
- Grass texture background (like swordbattle.io)
- Loading screen with grass bg and progress bar
- Smooth movement with client-side interpolation (lerp)
- Different gun mechanics (shotgun spreads, sniper high damage, rifle rapid fire)
- Health bars, kill feed, leaderboard, minimap, HP bar HUD
- Death/respawn system
- Global leaderboard (database-backed)
- 4000x4000 game world

## Running
```
node server.js
```
Runs on port 5000.

## Dependencies
- express, socket.io
- pg, connect-pg-simple, express-session
- bcryptjs
