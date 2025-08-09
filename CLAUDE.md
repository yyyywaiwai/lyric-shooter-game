# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Lyric Shooter Game** - a React/TypeScript browser-based bullet hell game where enemies spawn based on song lyrics and are synchronized with audio playback. The player controls a spaceship to shoot down character-based enemies falling from the top of the screen.

## Development Commands

- **Start development server**: `npm run dev` (serves at http://localhost:5173 with hot reload)
- **Build for production**: `npm run build`
- **Preview production build**: `npm run preview`
- **Install dependencies**: `npm install`

### Environment Setup
- Requires `.env.local` with `GEMINI_API_KEY` (currently unused in core game logic)
- Node.js required (compatible with React 19.1.1)

## Architecture Overview

### Core Game Flow
1. **File Upload** (`FileUploader.tsx`) - User uploads `.m4a` audio + `.lrc` lyrics files
2. **Ready State** (`App.tsx`) - Shows game info, handles Konami code for Super Hard Mode
3. **Game Loop** (`GameScreen.tsx`) - Main game logic with `requestAnimationFrame`
4. **Results** (`App.tsx`) - Displays stats and handles restart/file change

### Key Technical Components

**State Management**: React hooks (`useState`, `useRef`, `useEffect`) - no external state library
**Game Loop**: `requestAnimationFrame` in `GameScreen.tsx` for 60fps updates
**Audio Sync**: HTML5 `<audio>` element with `currentTime` property for lyric timing
**File Parsing**: Custom `.lrc` parser in `services/lrcParser.ts`
**Collision Detection**: AABB (axis-aligned bounding box) collision system
**Performance**: `React.memo` for game objects to prevent unnecessary re-renders

### Directory Structure
- `App.tsx` - Main component, game state management, UI screens
- `components/GameScreen.tsx` - Core game loop, collision detection, enemy/projectile logic
- `components/FileUploader.tsx` - File upload, metadata extraction with `music-metadata-browser`
- `services/lrcParser.ts` - Parses `.lrc` timing format (mm:ss.ms)
- `types.ts` - TypeScript interfaces for game objects and state
- `components/icons.tsx` - SVG React components for game sprites

### Game Object System

**Enemies**: Spawn from lyric characters with patterns (STRAIGHT_DOWN, SINE_WAVE, ZIG_ZAG, DRIFTING, ACCELERATING)
**Shooters**: Special enemies that fire projectiles (HOMING, STRAIGHT_DOWN, DELAYED_HOMING, SPIRAL)
**Elite Shooters**: Stronger enemies (MAGIC, GATLING, LANDMINE, LASER) appearing after 50% progress
**Items**: Power-ups with various effects (BOMB, LASER_BEAM, SPEED_UP, DIAGONAL_SHOT, etc.)

## Development Conventions

- **TypeScript**: All components and game logic use strict typing
- **Styling**: Tailwind CSS utility classes throughout
- **Game Constants**: Defined at top of `GameScreen.tsx` (speeds, dimensions, cooldowns)
- **Component Optimization**: Use `React.memo` for frequently rendered game objects
- **Event Handling**: Keyboard input via `addEventListener` with cleanup in `useEffect`
- **Audio**: HTML5 `<audio>` element, no Web Audio API complex features

## Key Game Mechanics

**Super Hard Mode**: Activated via Konami code (↑↑↓↓←→←→BA), provides starting item selection
**Last Stand Mode**: Power boost when down to final life
**Difficulty Scaling**: Enemy shooter chance increases with song progress
**Item System**: Seven different power-ups with stacking/non-stacking rules
**Special Weapons**: BOMB (screen clear) and LASER_BEAM (sustained beam) with limited uses

## Technical Notes

- Game runs at fixed 800x600 canvas size
- Uses `transform: translate3d()` for hardware-accelerated positioning
- Collision boxes slightly smaller than visual sprites for better gameplay feel
- Audio synchronization tolerance built into lyric timing system
- No networking or multiplayer components - purely single-player browser game