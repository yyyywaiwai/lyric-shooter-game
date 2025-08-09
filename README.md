# 🎵 Lyric Shooter Game

A React/TypeScript bullet hell game where enemies spawn based on song lyrics and are synchronized with audio playback. Control a spaceship to shoot down character-based enemies falling from the top of the screen.

![Game Screenshot](https://img.shields.io/badge/React-19.1.1-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8.2-blue) ![Vite](https://img.shields.io/badge/Vite-6.2.0-purple)

## ✨ Features

### Core Gameplay
- **Lyric-Synchronized Enemies**: Characters from song lyrics become enemies that spawn in real-time
- **Audio Synchronization**: Perfect timing with `.lrc` lyric files and `.m4a` audio
- **Bullet Hell Action**: Fast-paced shooting with multiple enemy types and attack patterns
- **Progressive Difficulty**: Enemy complexity increases as the song progresses

### Game Systems
- **7 Unique Items**: Power-ups including Bomb, Laser Beam, Speed Up, and shot modifiers
- **Enemy Variety**: 
  - Normal enemies with 4 movement patterns (Straight, Sine Wave, Zig-Zag, Drifting, Accelerating)
  - Shooter enemies with 4 attack patterns (Homing, Straight Down, Delayed Homing, Spiral)
  - Elite shooters (Magic, Gatling, Landmine, Laser) appearing after 50% progress
- **Last Stand Mode**: Massive power boost when down to final life
- **Super Hard Mode**: Activated via Konami code (↑↑↓↓←→←→BA) with starting item selection

### Technical Features
- **Metadata Extraction**: Automatic song title and album art extraction from m4a files
- **Real-time Statistics**: Enemy spawn rate, defeat counter, score tracking
- **Visual Effects**: Explosions, particle effects, screen shake, game over sequences
- **Audio Effects**: Dynamic BGM ducking, sound effects, pitch-shifting on game over

## 🚀 Getting Started

### Prerequisites
- Node.js (compatible with React 19.1.1)
- Modern web browser with HTML5 audio support

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yyyywaiwai/lyric-shooter-game.git
cd lyric-shooter-game
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open http://localhost:5173 in your browser

### Building for Production

```bash
npm run build
npm run preview
```

## 🎮 How to Play

### File Requirements
- **Audio File**: `.m4a` format with embedded metadata (title, album art)
- **Lyrics File**: `.lrc` format with timing information (mm:ss.ms)

### Controls
- **Movement**: Arrow keys or WASD
- **Shoot**: Spacebar (hold for continuous fire)
- **Special Items**: Shift or Tab
- **Skip Intro**: Hold Spacebar during intro screen

### Game Modes

#### Normal Mode
- Standard difficulty with progressive enemy spawning
- Items drop every 10% of enemies defeated

#### Super Hard Mode (Konami Code: ↑↑↓↓←→←→BA)
- 15% boost to ship speed and projectile speed
- Choose one starting item
- Increased item drop rate (every ~7%)
- Elite shooters appear from the beginning
- Enhanced enemy mutations after 50% progress

## 🔧 Technical Architecture

### Core Components
- `App.tsx` - Main application state management and UI routing
- `GameScreen.tsx` - Game loop, collision detection, enemy/projectile logic
- `FileUploader.tsx` - File handling and metadata extraction
- `services/lrcParser.ts` - LRC timing format parser
- `types.ts` - TypeScript interfaces for game objects

### Key Technologies
- **React 19.1** with hooks-based state management
- **TypeScript** for type safety
- **Vite** for fast development and building
- **Tailwind CSS** for utility-first styling
- **jsmediatags** for m4a metadata extraction (dynamically loaded from CDN)
- **HTML5 Audio API** for music playback and effects

### Performance Optimizations
- `React.memo` for game objects to prevent unnecessary re-renders
- `requestAnimationFrame` for 60fps game loop
- Hardware-accelerated positioning with `transform: translate3d()`
- Collision detection with AABB (axis-aligned bounding box) system

## 🎨 Game Design

### Enemy Types
- **Normal Enemies**: Basic characters from lyrics (1 hit)
- **Shooter Enemies**: Fire projectiles with different patterns (1 hit)
- **Big Enemies**: Larger variants in Super Hard Mode (3 hits)
- **Elite Shooters**: Powerful enemies with unique abilities (3 hits)

### Items & Power-ups
- **Bomb**: Destroys all on-screen enemies
- **Laser Beam**: 5-second sustained laser
- **Speed Up**: Increases movement and projectile speed (stackable)
- **Diagonal Shot**: Adds diagonal projectiles every 3rd shot
- **Side Shot**: Fires left/right projectiles every 2nd shot
- **Canceller Shot**: Destroys enemy projectiles, grants damage nullification
- **1UP**: Extra life

### Special Mechanics
- **Automatic Enemy Clearing**: All enemies destroyed when player is hit (easier recovery)
- **Item Progress Tracking**: Visual progress bar for next item drop
- **Dynamic Difficulty**: Enemy spawn patterns adapt to song progression
- **Last Stand Bonuses**: Enhanced abilities when down to final life

## 🛠️ Development

### Project Structure
```
lyric-shooter-game/
├── components/
│   ├── GameScreen.tsx      # Main game logic
│   ├── FileUploader.tsx    # File handling
│   └── icons.tsx          # SVG game sprites
├── services/
│   └── lrcParser.ts       # Lyric timing parser
├── types.ts               # Type definitions
├── App.tsx               # Main application
└── CLAUDE.md             # Development notes
```

### Development Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Game Constants
All gameplay parameters (speeds, dimensions, cooldowns) are defined at the top of `GameScreen.tsx` for easy tweaking.

## 🎵 File Format Support

### Supported Audio Formats
- `.m4a` (recommended) - Best metadata support
- Embedded title and album artwork extraction

### Supported Lyric Formats
- `.lrc` files with standard timing format: `[mm:ss.xx]lyric text`

## 🔮 Future Enhancements

- Multiple audio format support (MP3, FLAC, etc.)
- Online multiplayer mode
- Custom theme and visual effect options
- Leaderboard system
- Mobile touch controls
- WebGL rendering for enhanced effects

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -m 'Add feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

## 📜 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- Built with React 19 and modern TypeScript
- Inspired by classic bullet hell games
- Uses jsmediatags for robust metadata extraction
- Tailwind CSS for responsive design

---

**🎮 Ready to shoot some lyrics? Upload your m4a and lrc files and start playing!**
