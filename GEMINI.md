# Lyric Shooter Game - Project Context for Qwen Code

## Project Overview

This is a **React/TypeScript** browser-based game called "Lyric Shooter". The core gameplay mechanic involves a player-controlled spaceship shooting down enemies that fall from the top of the screen. The unique twist is that the enemies are generated based on the characters in a provided song's lyrics, and their spawning is synchronized with the audio playback.

The game is built using Vite and React, with TypeScript for type safety. It uses `music-metadata-browser` for parsing audio file metadata.

### Key Technologies & Architecture

- **Frontend Framework:** React (v19.1.1)
- **Language:** TypeScript
- **Build Tool:** Vite (v6.2.0)
- **Styling:** Tailwind CSS (inferred from utility class usage like `text-white`, `bg-slate-900`, etc.)
- **Audio Metadata:** `music-metadata-browser`
- **State Management:** Built-in React `useState`, `useEffect`, `useRef`, `useCallback`.
- **Game Loop:** `requestAnimationFrame` for smooth animation and game logic updates.
- **File Handling:** HTML5 File API for uploading `.m4a` (audio) and `.lrc` (lyrics) files.
- **Audio Playback:** HTML5 `<audio>` element with Web Audio API integration for advanced features like sound effects and volume control.

### Core Concepts

- **Game Flow:**
    1.  User uploads an `.m4a` audio file and a corresponding `.lrc` lyric file.
    2.  The game parses the `.lrc` file to get timed lyrics.
    3.  The user can start the game, triggering audio playback.
    4.  Lyrics are processed line-by-line as the audio plays.
    5.  Characters from the lyrics spawn as enemies at the top of the screen.
    6.  The player controls a ship at the bottom to shoot enemies and avoid projectiles.
    7.  The game ends when the audio finishes ("STAGE CLEAR") or the player runs out of lives ("GAME OVER").
- **Enemies:** Represent characters from the lyrics. They have various movement patterns (straight down, sine wave, zig-zag, drifting, accelerating) and can be "Shooters" that fire projectiles at the player. There are "Normal Shooters" and stronger "Elite Shooters" (appearing after 50% progress or from the start in Super Hard Mode).
- **Player:** Controls a spaceship, moves with arrow keys/WASD, and fires projectiles with the spacebar.
- **Items:** Collectible power-ups that fall from defeated enemies, providing benefits like extra lives, speed boosts, special weapons (Bomb, Laser), or new firing patterns (Diagonal Shot, Side Shot, Canceller Shot).
- **Special Weapons:** "Bomb" destroys all on-screen enemies. "Laser" provides a sustained beam attack.
- **Difficulty Scaling:** The chance of an enemy being a shooter increases as the song progresses. Elite Shooters are introduced after 50% progress (or from the beginning in Super Hard Mode).
- **Super Hard Mode:** Activated by entering the Konami code (↑↑↓↓←→←→BA) at the "READY" screen. It provides initial buffs, increased item drop rates, early elite shooters, and a mid-game buff making enemies stronger.

## File Structure & Descriptions

- **`App.tsx`**: The main application component. Manages overall game state (`loading`, `ready`, `playing`, `gameOver`, `cleared`) and renders the appropriate screen (File Uploader, Game Ready Screen with info, Game Screen, Results Screen).
- **`components/GameScreen.tsx`**: The core game component. Contains the main game loop, rendering logic for all game objects (player, enemies, projectiles, items), collision detection, game state updates (lives, score, items collected), audio synchronization for enemy spawning, and UI elements like score, lives, and progress bars.
- **`components/FileUploader.tsx`**: Handles the initial file upload process. It provides UI for selecting `.m4a` and `.lrc` files, parses the `.lrc` file using `lrcParser.ts`, and uses `music-metadata-browser` to extract song title and cover art from the `.m4a` file. It then passes the audio URL, parsed lyrics, and metadata to the main `App`.
- **`services/lrcParser.ts`**: A utility function to parse `.lrc` (Lyric) files, extracting timing information (minutes:seconds.milliseconds) and associated text lines.
- **`types.ts`**: Centralized TypeScript type definitions for game objects (Enemy, Projectile, Item, etc.), game states, and statistics.
- **`components/icons.tsx`**: Contains SVG React components for in-game icons (Items, Player Ship, Enemy characters).
- **Configuration Files:** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `index.tsx`.

## Building and Running

- **Prerequisites:** Node.js (version not specified, but compatible with the dependencies).
- **Installation:** Run `npm install` in the project root to install all dependencies listed in `package.json`.
- **Development Server:** Run `npm run dev` to start the Vite development server. This typically serves the app at `http://localhost:5173` and provides hot module replacement for development.
- **Environment Variables:** A `GEMINI_API_KEY` needs to be set in a `.env.local` file. *Note: This project does not currently use the Gemini API in its core logic; this might be a leftover from initial setup or for a planned feature.*

## Development Conventions

- **Language:** TypeScript is used for type safety across the application.
- **UI Library:** React is used for component-based UI development.
- **Styling:** Tailwind CSS utility classes are used extensively in `className` attributes for styling components.
- **Game Loop:** The core game logic in `GameScreen.tsx` is driven by `requestAnimationFrame` for smooth performance.
- **State Management:** React's built-in hooks (`useState`, `useRef`, `useEffect`) are used for managing component and game state.
- **Performance:** `React.memo` is used for game object components (`PlayerComponent`, `EnemyComponent`, etc.) to prevent unnecessary re-renders during the game loop.
- **File Parsing:** Dedicated service functions like `parseLRC` are used for parsing external file formats.
