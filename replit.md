# gunsbattle.io

## Overview
A multiplayer .io shooter game built with Node.js, Express, and Socket.io WebSockets.

## Architecture
- **Server**: `server.js` - Express + Socket.io server handling game state, physics, collisions, and player management
- **Client**: `public/` directory
  - `public/index.html` - Main HTML with loading screen, name menu, game canvas, HUD, and death screen
  - `public/css/style.css` - All styling including loading animations, menu, HUD, minimap
  - `public/js/game.js` - Client-side game logic: rendering, input handling, WebSocket communication, interpolation
  - `public/images/` - Game assets (grass.png, player.png)

## Key Features
- WebSocket-based real-time multiplayer (Socket.io with websocket transport)
- Animated loading screen with progress bar
- Name entry menu before joining
- Smooth movement with client-side interpolation (lerp)
- Mouse-aimed shooting with auto-fire on hold
- Health bars, kill feed, leaderboard, minimap
- Death/respawn system
- 4000x4000 game world with grid background

## Running
```
node server.js
```
Runs on port 5000.

## Dependencies
- express
- socket.io
