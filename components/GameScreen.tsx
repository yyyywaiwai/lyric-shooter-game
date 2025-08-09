
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LyricLine, Enemy, Projectile, Item, MovementPattern, ItemType, SpecialWeapon, EnemyProjectile, ShooterAttackPattern, Explosion, GameStats, EliteShooterType, Mine, FloatingText } from '../types';
import { BombIcon, SpeedUpIcon, DiagonalShotIcon, LaserIcon, OneUpIcon, PlayerShipIcon, SideShotIcon, CancellerShotIcon } from './icons';

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const PLAYER_WIDTH = 36;
const PLAYER_HEIGHT = 36;
const PLAYER_SPEED_PER_SECOND = 420;
const INITIAL_PROJECTILE_SPEED_PER_SECOND = 1080;
const PROJECTILE_WIDTH = 6;
const PROJECTILE_HEIGHT = 20;
const PROJECTILE_HITBOX_PADDING = 8;
const ENEMY_WIDTH = 36;
const ENEMY_HEIGHT = 36;
const ITEM_WIDTH = 32;
const ITEM_HEIGHT = 32;
const ENEMY_SPEED_PER_SECOND = 48;
const ENEMY_PROJECTILE_SPEED_PER_SECOND = 240;
const ENEMY_ACCELERATION_PER_SECOND_SQUARED = 28.8;
const INITIAL_ENEMY_FIRE_CHANCE = 0.05;
const ENEMY_FIRE_COOLDOWN = 2000;
const FIRE_COOLDOWN = 150;
const ITEM_SPAWN_PERCENTAGE = 0.10; // 10%
const INITIAL_LIVES = 5;
const RESPAWN_DURATION = 1500;
const INVINCIBILITY_DURATION = 3000;
const CANCELLER_INVINCIBILITY_DURATION = 500; // 0.5 seconds for canceller shot
const LASER_DURATION = 5000;
const EXPLOSION_DURATION = 400;
const BGM_VOLUME = 0.3;
const DUCKED_BGM_VOLUME = 0.05;
const SKIP_LONG_PRESS_DURATION = 500; // ms
const MINE_WIDTH = 22;
const MINE_HEIGHT = 22;
const MINE_LIFETIME = 9000; // 9 seconds
const FLOATING_TEXT_DURATION = 1000;

interface GameScreenProps {
  audioUrl: string;
  lyrics: LyricLine[];
  onEndGame: (stats: GameStats, status: 'cleared' | 'gameOver') => void;
  superHardMode?: boolean;
  initialItem?: ItemType;
}

// --- Helper Functions ---
const lineIntersectsRect = (line: {p1: {x:number, y:number}, p2: {x:number, y:number}}, rect: {x:number, y:number, width:number, height:number}) => {
    const lineLineIntersection = (p1: {x:number, y:number}, p2: {x:number, y:number}, p3: {x:number, y:number}, p4: {x:number, y:number}) => {
        const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
        if (den === 0) return false;
        const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
        const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    };

    const { x, y, width, height } = rect;
    const { p1, p2 } = line;

    const left = lineLineIntersection(p1, p2, {x, y}, {x, y: y + height});
    const right = lineLineIntersection(p1, p2, {x: x + width, y}, {x: x + width, y: y + height});
    const top = lineLineIntersection(p1, p2, {x, y}, {x: x + width, y});
    const bottom = lineLineIntersection(p1, p2, {x, y: y + height}, {x: x + width, y: y + height});

    return left || right || top || bottom;
};


// --- Helper Components ---
const PlayerComponent = React.memo(({ x, y, isInvincible, isLastStand }: { x: number; y: number; isInvincible: boolean; isLastStand: boolean; }) => (
    <div
        style={{ transform: `translate3d(${x}px, ${y}px, 0)`, width: PLAYER_WIDTH, height: PLAYER_HEIGHT }}
        className={`absolute text-cyan-400 ${isInvincible ? 'opacity-50 animate-pulse' : 'opacity-100'}`}
    >
        <PlayerShipIcon className={`w-full h-full ${isLastStand ? 'drop-shadow-[0_0_8px_#ef4444]' : 'drop-shadow-[0_0_5px_#0ea5e9]'}`} />
    </div>
));

const EnemyComponent = React.memo(({ enemy, isLastStand }: { enemy: Enemy; isLastStand: boolean; }) => {
    let colorClass = 'text-red-400';
    if (enemy.isElite) {
         switch (enemy.eliteType) {
            case 'MAGIC':
                colorClass = 'text-rose-500';
                break;
            case 'GATLING':
                colorClass = 'text-amber-500';
                break;
            case 'LANDMINE':
                colorClass = 'text-lime-500';
                break;
            case 'LASER':
                colorClass = 'text-cyan-300';
                break;
            default:
                colorClass = 'text-purple-400';
        }
    } else if (enemy.isShooter) {
        colorClass = {
            'HOMING': 'text-fuchsia-400',
            'STRAIGHT_DOWN': 'text-yellow-400',
            'DELAYED_HOMING': 'text-orange-400',
            'SPIRAL': 'text-teal-400',
        }[enemy.attackPattern || 'HOMING'];
    }

    const sizeClass = enemy.isElite || enemy.isBig ? 'text-4xl' : 'text-3xl';
    const flashClass = enemy.isFlashing ? 'animate-ping opacity-75' : '';
    const lastStandGlowClass = enemy.isElite && isLastStand ? 'text-shadow-last-stand' : '';

    return (
        <div
            style={{ transform: `translate3d(${enemy.x}px, ${enemy.y}px, 0)`, width: enemy.width, height: enemy.height }}
            className={`absolute font-bold flex items-center justify-center font-orbitron ${colorClass}`}
        >
            <span className={`${sizeClass} ${lastStandGlowClass}`}>{enemy.char}</span>
            {flashClass && <div className={`absolute w-full h-full bg-white rounded-full ${flashClass}`}></div>}
        </div>
    );
});


const ProjectileComponent = React.memo(({ p }: { p: Projectile }) => (
    <div
        style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)`, width: p.width, height: p.height }}
        className="absolute bg-yellow-300 rounded-lg box-shadow-neon"
    ></div>
));

const EnemyProjectileComponent = React.memo(({ p }: { p: EnemyProjectile }) => {
    const projectileColor = {
        'HOMING': 'bg-fuchsia-500',
        'STRAIGHT_DOWN': 'bg-yellow-500',
        'DELAYED_HOMING': 'bg-orange-500',
        'SPIRAL': 'bg-teal-500',
    }[p.attackPattern];
    
    const sizeClass = 'w-2 h-2';
    const opacityClass = p.attackPattern === 'DELAYED_HOMING' && p.isDelayed ? 'opacity-50' : 'opacity-100';

    return (
        <div
            style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)` }}
            className={`absolute rounded-full transition-opacity duration-200 ${p.attackPattern === 'DELAYED_HOMING' && p.isDelayed ? 'animate-pulse' : ''} ${projectileColor} ${sizeClass} ${opacityClass}`}
        ></div>
    );
});

const MineComponent = React.memo(({ mine }: { mine: Mine }) => (
    <div
        style={{ transform: `translate3d(${mine.x}px, ${mine.y}px, 0)`, width: mine.width, height: mine.height }}
        className="absolute bg-red-800 border-2 border-red-500 rounded-full animate-pulse"
    ></div>
));

const ItemComponent = React.memo(({ item }: { item: Item }) => {
    const getIcon = () => {
        const iconProps = { className: "w-8 h-8 drop-shadow-[0_0_8px_rgba(252,211,77,0.8)]" };
        switch (item.type) {
            case 'BOMB': return <BombIcon {...iconProps} />;
            case 'SPEED_UP': return <SpeedUpIcon {...iconProps} />;
            case 'DIAGONAL_SHOT': return <DiagonalShotIcon {...iconProps} />;
            case 'SIDE_SHOT': return <SideShotIcon {...iconProps} />;
            case 'CANCELLER_SHOT': return <CancellerShotIcon {...iconProps} />;
            case 'LASER_BEAM': return <LaserIcon {...iconProps} />;
            case 'ONE_UP': return <OneUpIcon {...iconProps} />;
            default: return null;
        }
    };
    return (
      <div
        style={{ transform: `translate3d(${item.x}px, ${item.y}px, 0)`, width: item.width, height: item.height }}
        className="absolute flex items-center justify-center animate-pulse"
      >
        {getIcon()}
      </div>
    );
});

const LaserBeamComponent = React.memo(({ x, y }: { x: number, y:number }) => (
    <div
        style={{ transform: `translate3d(${x + PLAYER_WIDTH / 2 - 5}px, 0, 0)`, width: 10, height: y }}
        className="absolute bg-gradient-to-t from-red-400 to-orange-300 rounded-t-full animate-pulse"
    ></div>
));

const ExplosionComponent = React.memo(({ explosion }: { explosion: Explosion }) => {
    const sizeClass = explosion.size === 'large' ? 'w-32 h-32' : 'w-16 h-16';
    const colorClass = explosion.size === 'large' ? 'bg-orange-400' : 'bg-yellow-300';
    return (
        <div
            style={{ left: explosion.x, top: explosion.y, transform: 'translate(-50%, -50%)' }}
            className={`explosion ${sizeClass} ${colorClass}`}
        ></div>
    );
});

const FloatingTextComponent = React.memo(({ text, x, y, createdAt }: FloatingText) => {
    const progress = Math.min(1, (Date.now() - createdAt) / FLOATING_TEXT_DURATION);
    const style: React.CSSProperties = {
        position: 'absolute',
        left: x,
        top: y,
        transform: `translateY(${-progress * 20}px)`,
        opacity: 1 - progress,
        color: '#93c5fd', // blue-300
        fontWeight: 'bold',
        fontSize: '0.8rem',
        textShadow: '1px 1px 2px rgba(0,0,0,0.7)',
        pointerEvents: 'none',
        zIndex: 20,
        transition: 'opacity 0.1s linear, transform 0.1s linear'
    };
    return <div style={style}>{text}</div>;
});


// --- Main Game Screen Component ---
export default function GameScreen({ audioUrl, lyrics, onEndGame, superHardMode = false, initialItem }: GameScreenProps): React.ReactNode {
  const gameStateRef = useRef({
      playerX: GAME_WIDTH / 2 - PLAYER_WIDTH / 2,
      playerY: GAME_HEIGHT - PLAYER_HEIGHT - 20,
      lives: INITIAL_LIVES,
      isInvincible: false,
      invincibilityEndTime: 0,
      isRespawning: false,
      respawnEndTime: 0,
      projectiles: [] as Projectile[],
      enemyProjectiles: [] as EnemyProjectile[],
      playerSpeedMultiplier: superHardMode ? 1.15 : 1,
      projectileSpeedMultiplier: superHardMode ? 1.15 : 1,
      speedUpCount: 0,
      hasDiagonalShot: false,
      hasSideShot: false,
      hasCancellerShot: false,
      mainShotCounter: 0,
      stockedItem: null as SpecialWeapon | null,
      isLaserActive: false,
      laserEndTime: 0,
      enemies: [] as Enemy[],
      items: [] as Item[],
      mines: [] as Mine[],
      explosions: [] as Explosion[],
      floatingTexts: [] as FloatingText[],
      score: 0,
      enemiesDefeated: 0,
      itemsCollected: {} as Partial<Record<ItemType, number>>,
      currentLyricIndex: 0,
      baseShooterChance: superHardMode ? INITIAL_ENEMY_FIRE_CHANCE + 0.05 : INITIAL_ENEMY_FIRE_CHANCE,
      difficultyMilestone: 0,
      isGameEnding: false,
      showSkip: true,
      spacePressProgress: 0,
      // Enemy spawn rate tracking
      totalEnemiesSpawned: 0,
      gameStartTime: 0,
      currentEnemySpawnRate: 0,
      lastSpawnRateUpdate: 0,
      // Super Hard Mode state
      isMidGameBuffActive: false,
      enemyProjectileSpeedMultiplier: 1,
      // Game Over delay state
      isGameOverDelayed: false,
      gameOverDelayEndTime: 0,
      shouldHidePlayer: false, // プレイヤーを非表示にするフラグ
      showGameOverText: false, // ゲームオーバーテキスト表示フラグ
  });

  const [, forceUpdate] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const keysPressed = useRef<Record<string, boolean>>({});
  const lastFireTime = useRef(0);
  const lastFrameTime = useRef(performance.now());
  const gameLoopId = useRef<number | null>(null);
  const itemSpawnMilestone = useRef(0);
  const spacebarPressStart = useRef(0);
  
  const totalChars = useMemo(() => lyrics.reduce((acc, line) => acc + line.text.replace(/\s/g, '').length, 0), [lyrics]);
  const totalLyricLines = useMemo(() => lyrics.length, [lyrics]);
  
  const onEndGameRef = useRef(onEndGame);
  onEndGameRef.current = onEndGame;
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const bgmSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const bgmGainRef = useRef<GainNode | null>(null);
  
  useEffect(() => {
    if (initialItem) {
        const state = gameStateRef.current;
        state.itemsCollected[initialItem] = (state.itemsCollected[initialItem] || 0) + 1;
        switch (initialItem) {
            case 'ONE_UP': state.lives++; break;
            case 'SPEED_UP':
                state.playerSpeedMultiplier *= 1.15;
                state.projectileSpeedMultiplier *= 1.15;
                state.speedUpCount++;
                break;
            case 'DIAGONAL_SHOT': if (!state.hasDiagonalShot) { state.hasDiagonalShot = true; state.baseShooterChance += 0.05; } break;
            case 'SIDE_SHOT': if (!state.hasSideShot) { state.hasSideShot = true; } break;
            case 'CANCELLER_SHOT': if (!state.hasCancellerShot) { state.hasCancellerShot = true; } break;
            case 'BOMB': case 'LASER_BEAM': state.stockedItem = initialItem; break;
        }
    }
  }, [initialItem]);

  const setupAudio = useCallback(async () => {
    if (!audioRef.current || audioContextRef.current) return;
    
    try {
      // AudioContextは最初はsuspendedになる可能性があるので、resumeを待つ
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = context;
      
      // ユーザーインタラクション後にresume
      if (context.state === 'suspended') {
        await context.resume();
      }
      
      const source = context.createMediaElementSource(audioRef.current);
      const gainNode = context.createGain();
      bgmSourceRef.current = source;
      bgmGainRef.current = gainNode;
      source.connect(gainNode);
      gainNode.connect(context.destination);
      gainNode.gain.setValueAtTime(BGM_VOLUME, context.currentTime);
      
      // 音声要素のボリュームも設定
      audioRef.current.volume = BGM_VOLUME;
      
      // 音声再生を試行
      await audioRef.current.play();
      console.log("Audio playback started successfully");
    } catch (error) {
      console.error("Audio setup or playback failed:", error);
      // フォールバック: 通常の音声要素のみ使用
      if (audioRef.current) {
        audioRef.current.volume = BGM_VOLUME;
        try {
          await audioRef.current.play();
          console.log("Fallback audio playback started");
        } catch (fallbackError) {
          console.error("Fallback audio playback failed:", fallbackError);
        }
      }
    }
  }, []);
  
  const duckBgm = useCallback((duration: number) => {
      const gainNode = bgmGainRef.current;
      const context = audioContextRef.current;
      if (!gainNode || !context) return;
      const now = context.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.linearRampToValueAtTime(DUCKED_BGM_VOLUME, now + 0.2);
      gainNode.gain.linearRampToValueAtTime(BGM_VOLUME, now + 0.2 + duration / 1000);
  }, []);

  const playShipHitSound = useCallback(() => {
      duckBgm(1500);
      const audioContext = audioContextRef.current;
      if (!audioContext) return;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(120, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.8);
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.2);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 1.2);
  }, [duckBgm]);

  const playBombSound = useCallback(() => {
    duckBgm(2000);
    const audioContext = audioContextRef.current;
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(100, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(20, audioContext.currentTime + 1.5);
    gainNode.gain.setValueAtTime(0.7, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.8);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 1.8);
  }, [duckBgm]);

  const playCancelSound = useCallback(() => {
      const audioContext = audioContextRef.current;
      if (!audioContext) return;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1760, audioContext.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
  }, []);

  const fadeOutBgm = useCallback((duration: number) => {
      const gainNode = bgmGainRef.current;
      const context = audioContextRef.current;
      const audio = audioRef.current;
      if (!gainNode || !context || !audio) return;
      
      const now = context.currentTime;
      
      // Volume fade out
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);
      
      // Pitch fade out (playback rate)
      const startRate = audio.playbackRate;
      const endRate = 0.3; // Final pitch (much lower)
      const steps = 40; // Number of steps for smooth transition
      const stepDuration = (duration * 1000) / steps;
      
      let currentStep = 0;
      const pitchInterval = setInterval(() => {
          if (!audio || currentStep >= steps) {
              clearInterval(pitchInterval);
              return;
          }
          const progress = currentStep / steps;
          audio.playbackRate = startRate - (startRate - endRate) * progress;
          currentStep++;
      }, stepDuration);
  }, []);
    
  const handleSkip = useCallback(() => {
      const audio = audioRef.current;
      if(audio && lyrics.length > 0 && gameStateRef.current.showSkip) {
          if (audioContextRef.current?.state === 'suspended') {
              audioContextRef.current.resume();
          }
          audio.currentTime = Math.max(0, lyrics[0].time - 3);
          gameStateRef.current.showSkip = false;
      }
  }, [lyrics]);

  const endGame = useCallback((status: 'cleared' | 'gameOver') => {
      const state = gameStateRef.current;
      // ゲームオーバー遅延処理から呼ばれた場合は、既にisGameEndingがtrueになっている
      if (status === 'cleared' && state.isGameEnding) return;
      if (status === 'gameOver' && !state.isGameEnding) state.isGameEnding = true;
      if (gameLoopId.current !== null) cancelAnimationFrame(gameLoopId.current);
      if (audioRef.current) audioRef.current.pause();

      const songProgressPercentage = totalLyricLines > 0 ? (state.currentLyricIndex / totalLyricLines) * 100 : 100;

      const stats: GameStats = {
          score: state.score,
          enemiesDefeated: state.enemiesDefeated,
          totalEnemies: totalChars,
          itemsCollected: state.itemsCollected,
          songProgressPercentage,
      };
      onEndGameRef.current(stats, status);
  }, [totalChars, totalLyricLines]);

  const activateSpecialItem = useCallback(() => {
      const state = gameStateRef.current;
      if (!state.stockedItem) return;

      if (state.stockedItem === 'BOMB') {
          playBombSound();
          state.itemsCollected['BOMB'] = (state.itemsCollected['BOMB'] || 0) + 1;
          const onScreenEnemies = state.enemies.filter(e => e.y > -ENEMY_HEIGHT && e.y < GAME_HEIGHT);
          onScreenEnemies.forEach(e => {
            state.explosions.push({ id: Date.now() + e.id, x: e.x + e.width / 2, y: e.y + e.height / 2, size: 'small', createdAt: Date.now() });
            state.score += (e.isElite || e.isBig ? 75 : 10);
            state.enemiesDefeated++;
          });
          const onScreenEnemyIds = new Set(onScreenEnemies.map(e => e.id));
          state.enemies = state.enemies.filter(e => !onScreenEnemyIds.has(e.id));
      } else if (state.stockedItem === 'LASER_BEAM') {
          state.isLaserActive = true;
          state.laserEndTime = Date.now() + LASER_DURATION;
      }
      state.stockedItem = null;
  }, [playBombSound]);


  const gameLoop = useCallback(() => {
    const now = performance.now();
    let dt = (now - lastFrameTime.current) / 1000;
    // Cap delta time to prevent massive jumps if tab is backgrounded, which can cause objects to tunnel
    if (dt > 1 / 30) {
      dt = 1 / 30;
    }
    lastFrameTime.current = now;
    const state = gameStateRef.current;
    const isLastStand = state.lives === 1;

    if (state.isGameEnding) return;

    // --- Super Hard Mode Mid-game Buff ---
    const songProgressPercentage = totalLyricLines > 0 ? (state.currentLyricIndex / totalLyricLines) * 100 : 0;
    if (superHardMode && !state.isMidGameBuffActive && songProgressPercentage >= 50) {
        state.isMidGameBuffActive = true;
        state.enemyProjectileSpeedMultiplier = 1.05;
    }

    // --- Skip Logic ---
    if (state.showSkip && spacebarPressStart.current > 0) {
        const pressDuration = Date.now() - spacebarPressStart.current;
        state.spacePressProgress = Math.min(100, (pressDuration / SKIP_LONG_PRESS_DURATION) * 100);
        if (pressDuration > SKIP_LONG_PRESS_DURATION) {
            handleSkip();
            spacebarPressStart.current = 0;
            state.spacePressProgress = 0;
        }
    } else if (spacebarPressStart.current === 0 && state.spacePressProgress > 0) {
        state.spacePressProgress = 0;
    }

    // --- Update Enemy Spawn Rate (every 1 second) ---
    const spawnRateUpdateTime = Date.now();
    if (spawnRateUpdateTime - state.lastSpawnRateUpdate >= 1000) {
        if (state.gameStartTime > 0) {
            const elapsedTimeSeconds = (spawnRateUpdateTime - state.gameStartTime) / 1000;
            state.currentEnemySpawnRate = elapsedTimeSeconds > 0 ? state.totalEnemiesSpawned / elapsedTimeSeconds : 0;
        }
        state.lastSpawnRateUpdate = spawnRateUpdateTime;
    }
    
    // --- Player Movement ---
    if (!state.isRespawning) {
      const currentPlayerSpeed = PLAYER_SPEED_PER_SECOND * state.playerSpeedMultiplier;
      let newX = state.playerX;
      if (keysPressed.current['ArrowLeft'] || keysPressed.current['a']) newX -= currentPlayerSpeed * dt;
      if (keysPressed.current['ArrowRight'] || keysPressed.current['d']) newX += currentPlayerSpeed * dt;
      state.playerX = Math.max(0, Math.min(GAME_WIDTH - PLAYER_WIDTH, newX));
      let newY = state.playerY;
      if (keysPressed.current['ArrowUp'] || keysPressed.current['w']) newY -= currentPlayerSpeed * dt;
      if (keysPressed.current['ArrowDown'] || keysPressed.current['s']) newY += currentPlayerSpeed * dt;
      state.playerY = Math.max(0, Math.min(GAME_HEIGHT - PLAYER_HEIGHT, newY));
    }

    // --- Player Firing ---
    const currentFireCooldown = FIRE_COOLDOWN;
    
    const canFire = !state.isRespawning && (keysPressed.current[' '] || keysPressed.current['Spacebar']) && !state.isLaserActive && !(state.showSkip && spacebarPressStart.current > 0);
    if (canFire && Date.now() - lastFireTime.current > currentFireCooldown) {
        lastFireTime.current = Date.now();
        state.mainShotCounter++;
        const pX = state.playerX + PLAYER_WIDTH / 2 - PROJECTILE_WIDTH / 2;
        const pY = state.playerY;
        
        let currentProjectileSpeed = INITIAL_PROJECTILE_SPEED_PER_SECOND * state.projectileSpeedMultiplier;
        if (isLastStand) {
            currentProjectileSpeed *= 1.3;
        }

        state.projectiles.push({ id: Date.now(), x: pX, y: pY, width: PROJECTILE_WIDTH, height: PROJECTILE_HEIGHT, speedY: currentProjectileSpeed });
        
        const diagonalInterval = isLastStand ? 2 : 3;
        if(state.hasDiagonalShot && state.mainShotCounter % diagonalInterval === 0) {
            state.projectiles.push({ id: Date.now() + 1, x: pX, y: pY, width: PROJECTILE_WIDTH, height: PROJECTILE_HEIGHT, speedY: currentProjectileSpeed, speedX: currentProjectileSpeed * 0.4 });
            state.projectiles.push({ id: Date.now() - 1, x: pX, y: pY, width: PROJECTILE_WIDTH, height: PROJECTILE_HEIGHT, speedY: currentProjectileSpeed, speedX: -currentProjectileSpeed * 0.4 });
        }

        const sideInterval = isLastStand ? 1 : 2;
        if(state.hasSideShot && state.mainShotCounter % sideInterval === 0) {
            const sideProjectileY = state.playerY + PLAYER_HEIGHT / 2 - PROJECTILE_WIDTH / 2;
            state.projectiles.push({ id: Date.now() + 2, x: state.playerX + PLAYER_WIDTH/2, y: sideProjectileY, width: PROJECTILE_HEIGHT, height: PROJECTILE_WIDTH, speedY: 0, speedX: -currentProjectileSpeed });
            state.projectiles.push({ id: Date.now() - 2, x: state.playerX + PLAYER_WIDTH/2, y: sideProjectileY, width: PROJECTILE_HEIGHT, height: PROJECTILE_WIDTH, speedY: 0, speedX: currentProjectileSpeed });
        }
    }

    // --- Timers & State Updates ---
    const currentTime = Date.now();
    
    // ゲームオーバー遅延チェック
    if (state.isGameOverDelayed && currentTime > state.gameOverDelayEndTime) {
        // App.tsxの状態のみ変更し、ゲームループは停止させない
        const songProgressPercentage = totalLyricLines > 0 ? (state.currentLyricIndex / totalLyricLines) * 100 : 100;
        const stats = {
            score: state.score,
            enemiesDefeated: state.enemiesDefeated,
            totalEnemies: totalChars,
            itemsCollected: state.itemsCollected,
            songProgressPercentage,
        };
        if (audioRef.current) audioRef.current.pause();
        onEndGameRef.current(stats, 'gameOver');
        return;
    }
    
    
    if (state.isRespawning && currentTime > state.respawnEndTime) {
        state.isRespawning = false;
        state.isInvincible = true;
        state.invincibilityEndTime = currentTime + INVINCIBILITY_DURATION;
        state.playerX = GAME_WIDTH / 2 - PLAYER_WIDTH / 2;
        state.playerY = GAME_HEIGHT - PLAYER_HEIGHT - 20;
    }
    if (state.isInvincible && currentTime > state.invincibilityEndTime) state.isInvincible = false;
    if (state.isLaserActive && currentTime > state.laserEndTime) state.isLaserActive = false;
    state.enemies.forEach(e => { if (e.isFlashing && currentTime > e.flashEndTime!) e.isFlashing = false; });
    state.mines = state.mines.filter(m => currentTime - m.createdAt < MINE_LIFETIME);
    state.floatingTexts = state.floatingTexts.filter(ft => currentTime - ft.createdAt < FLOATING_TEXT_DURATION);

    // --- Object Movement ---
    state.projectiles = state.projectiles.map(p => ({ ...p, y: p.y - p.speedY * dt, x: p.x + (p.speedX || 0) * dt })).filter(p => p.y > -p.height && p.y < GAME_HEIGHT && p.x > -p.width && p.x < GAME_WIDTH);
    
    const currentEnemyProjectileSpeed = ENEMY_PROJECTILE_SPEED_PER_SECOND * state.enemyProjectileSpeedMultiplier;

    state.enemyProjectiles = state.enemyProjectiles.map(p => {
        const updatedProjectile = { ...p };

        if (updatedProjectile.attackPattern === 'DELAYED_HOMING' && updatedProjectile.isDelayed && currentTime > updatedProjectile.delayEndTime!) {
            updatedProjectile.isDelayed = false;
            const angle = Math.atan2((state.playerY + PLAYER_HEIGHT / 2) - updatedProjectile.y, (state.playerX + PLAYER_WIDTH / 2) - updatedProjectile.x);
            updatedProjectile.speedX = Math.cos(angle) * currentEnemyProjectileSpeed * 1.5;
            updatedProjectile.speedY = Math.sin(angle) * currentEnemyProjectileSpeed * 1.5;
            updatedProjectile.x += updatedProjectile.speedX * dt;
            updatedProjectile.y += updatedProjectile.speedY * dt;
        } else if (!(updatedProjectile.attackPattern === 'DELAYED_HOMING' && updatedProjectile.isDelayed)) {
            updatedProjectile.x += updatedProjectile.speedX * dt;
            updatedProjectile.y += updatedProjectile.speedY * dt;
        }

        return updatedProjectile;
    }).filter(p => p.y < GAME_HEIGHT + 20 && p.y > -20 && p.x > -20 && p.x < GAME_WIDTH + 20);

    state.items = state.items.map(i => ({ ...i, y: i.y + i.speedY * dt })).filter(i => i.y < GAME_HEIGHT);
    state.enemies = state.enemies.map(e => {
        let { x: newX, y: newY, speedX: newSpeedX, speedY: newSpeedY } = e;
        if(e.movementPattern === 'ACCELERATING' && e.accelerationY) newSpeedY += e.accelerationY * dt;
        newY += newSpeedY * dt;
        switch (e.movementPattern) {
            case 'SINE_WAVE': newX = e.initialX! + Math.sin(newY * e.frequency!) * e.amplitude!; break;
            case 'ZIG_ZAG': if ((newX + newSpeedX! * dt <= 0) || (newX + newSpeedX! * dt >= GAME_WIDTH - e.width)) newSpeedX = -(e.speedX!); newX += newSpeedX! * dt; break;
            case 'DRIFTING': newX += newSpeedX! * dt; break;
        }
        newX = Math.max(0, Math.min(GAME_WIDTH - e.width, newX));
        return { ...e, x: newX, y: newY, speedY: newSpeedY, speedX: newSpeedX };
    }).filter(e => e.y < GAME_HEIGHT);

    // Enemy state machines
    state.enemies.forEach(e => {
        if (e.eliteType === 'LASER') {
            switch(e.laserState) {
                case 'AIMING':
                    if (currentTime > e.laserStateChangeTime! + 1000) { // 1s aim time
                        e.laserState = 'FIRING';
                        e.laserStateChangeTime = currentTime;
                    }
                    break;
                case 'FIRING':
                    if (currentTime > e.laserStateChangeTime! + 300) { // 0.3s fire time
                        e.laserState = 'COOLDOWN';
                        e.laserStateChangeTime = currentTime;
                    }
                    break;
                case 'COOLDOWN':
                    if (currentTime > e.laserStateChangeTime! + 2000) { // 2s cooldown
                        e.laserState = 'IDLE';
                    }
                    break;
            }
        }
    });

    // --- Enemy Firing ---
    state.enemies.forEach(enemy => {
        if (!enemy.isShooter) return;
        const cooldown = enemy.isElite && enemy.eliteType === 'MAGIC' ? ENEMY_FIRE_COOLDOWN / 3.5 : ENEMY_FIRE_COOLDOWN;
        if (currentTime - (enemy.lastShotTime || 0) > cooldown && !enemy.gatlingCooldown) {
            
            if (enemy.isElite) {
                switch(enemy.eliteType) {
                    case 'LASER':
                        if (enemy.laserState === 'IDLE') {
                            enemy.laserState = 'AIMING';
                            enemy.laserStateChangeTime = currentTime;
                            enemy.laserTarget = { x: state.playerX + PLAYER_WIDTH / 2, y: state.playerY + PLAYER_HEIGHT / 2 };
                            enemy.lastShotTime = currentTime;
                        }
                        break;
                    case 'LANDMINE':
                        enemy.lastShotTime = currentTime;
                        state.mines.push({ id: currentTime + enemy.id, x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height, width: MINE_WIDTH, height: MINE_HEIGHT, createdAt: currentTime });
                        break;
                    case 'MAGIC': {
                        enemy.lastShotTime = currentTime;
                        const patterns: ShooterAttackPattern[] = ['HOMING', 'STRAIGHT_DOWN', 'DELAYED_HOMING', 'SPIRAL'];
                        enemy.attackPattern = patterns[Math.floor(Math.random() * patterns.length)];
                    }
                    // Fallthrough for MAGIC to fire immediately
                    case 'GATLING': {
                        enemy.lastShotTime = currentTime;
                        const projectileBase = { id: currentTime + enemy.id, x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height, width: 8, height: 8 };
                        let patternToFire = enemy.attackPattern!;
                        if (enemy.eliteType === 'GATLING') {
                            patternToFire = 'STRAIGHT_DOWN';
                            enemy.gatlingBurstCount = 5;
                            enemy.gatlingLastBurstTime = currentTime;
                            enemy.gatlingCooldown = true;
                        }

                        switch(patternToFire) {
                            case 'HOMING': {
                                const angle = Math.atan2((state.playerY + PLAYER_HEIGHT/2) - projectileBase.y, (state.playerX + PLAYER_WIDTH/2) - projectileBase.x);
                                state.enemyProjectiles.push({ ...projectileBase, attackPattern: 'HOMING', speedX: Math.cos(angle) * currentEnemyProjectileSpeed, speedY: Math.sin(angle) * currentEnemyProjectileSpeed });
                                break;
                            }
                            case 'STRAIGHT_DOWN':
                                state.enemyProjectiles.push({ ...projectileBase, attackPattern: 'STRAIGHT_DOWN', speedX: 0, speedY: currentEnemyProjectileSpeed });
                                break;
                            case 'DELAYED_HOMING':
                                state.enemyProjectiles.push({ ...projectileBase, attackPattern: 'DELAYED_HOMING', speedX: 0, speedY: 0, isDelayed: true, delayEndTime: currentTime + 500 });
                                break;
                            case 'SPIRAL': {
                                enemy.spiralAngle = (enemy.spiralAngle || 0) + 0.5;
                                for (let i = 0; i < 4; i++) {
                                    const angle = enemy.spiralAngle + (i * Math.PI / 2);
                                    state.enemyProjectiles.push({
                                        ...projectileBase,
                                        id: projectileBase.id + i,
                                        attackPattern: 'SPIRAL',
                                        speedX: Math.cos(angle) * currentEnemyProjectileSpeed * 0.7,
                                        speedY: Math.sin(angle) * currentEnemyProjectileSpeed * 0.7
                                    });
                                }
                                break;
                            }
                        }
                        break;
                    }
                }

            } else { // Normal shooters
                enemy.lastShotTime = currentTime;
                const projectileBase = { id: currentTime + enemy.id, x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height, width: 8, height: 8 };
                switch(enemy.attackPattern) {
                    case 'HOMING': {
                        const angle = Math.atan2((state.playerY + PLAYER_HEIGHT/2) - projectileBase.y, (state.playerX + PLAYER_WIDTH/2) - projectileBase.x);
                        state.enemyProjectiles.push({ ...projectileBase, attackPattern: 'HOMING', speedX: Math.cos(angle) * currentEnemyProjectileSpeed, speedY: Math.sin(angle) * currentEnemyProjectileSpeed });
                        break;
                    }
                    case 'STRAIGHT_DOWN':
                        state.enemyProjectiles.push({ ...projectileBase, attackPattern: 'STRAIGHT_DOWN', speedX: 0, speedY: currentEnemyProjectileSpeed });
                        break;
                    case 'DELAYED_HOMING':
                        state.enemyProjectiles.push({ ...projectileBase, attackPattern: 'DELAYED_HOMING', speedX: 0, speedY: 0, isDelayed: true, delayEndTime: currentTime + 500 });
                        break;
                    case 'SPIRAL': {
                        const randomAngle = Math.random() * Math.PI * 2;
                        state.enemyProjectiles.push({
                            ...projectileBase,
                            attackPattern: 'SPIRAL',
                            speedX: Math.cos(randomAngle) * currentEnemyProjectileSpeed * 0.7,
                            speedY: Math.sin(randomAngle) * currentEnemyProjectileSpeed * 0.7,
                        });
                        break;
                    }
                }
            }
        }

        // Handle Gatling Burst
        if (enemy.gatlingCooldown && enemy.gatlingBurstCount! > 0 && currentTime - enemy.gatlingLastBurstTime! > 100) {
            enemy.gatlingBurstCount!--;
            enemy.gatlingLastBurstTime = currentTime;
            const projectileBase = { id: currentTime + enemy.id, x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height, width: 8, height: 8 };
            state.enemyProjectiles.push({ ...projectileBase, attackPattern: 'STRAIGHT_DOWN', speedX: 0, speedY: currentEnemyProjectileSpeed });
            if(enemy.gatlingBurstCount === 0) {
                 setTimeout(() => { enemy.gatlingCooldown = false; }, ENEMY_FIRE_COOLDOWN);
            }
        }
    });

    // --- Lyric Syncing and Enemy Spawning ---
    const audio = audioRef.current;
    if (audio) {
      if(audio.ended) {
          endGame('cleared');
          return;
      }

      if (!state.showSkip && state.currentLyricIndex < lyrics.length && audio.currentTime >= lyrics[state.currentLyricIndex].time) {
        const line = lyrics[state.currentLyricIndex].text.replace(/\s/g, '');
        let charIndex = 0;
        const spawnInterval = 100 / Math.max(1, line.length);
        const spawnChar = () => {
          if (charIndex < line.length) {
            const char = line[charIndex];
            
            const movementPatterns: MovementPattern[] = ['STRAIGHT_DOWN', 'SINE_WAVE', 'ZIG_ZAG', 'DRIFTING', 'ACCELERATING'];
            const movementPattern = movementPatterns[Math.floor(Math.random() * movementPatterns.length)];
            
            const shooterAttackPatterns: ShooterAttackPattern[] = ['HOMING', 'STRAIGHT_DOWN', 'DELAYED_HOMING', 'SPIRAL'];
            const attackPattern = shooterAttackPatterns[Math.floor(Math.random() * shooterAttackPatterns.length)];

            let shooterChance = state.baseShooterChance;

            // Song progress difficulty scaling
            const progress = state.currentLyricIndex / totalLyricLines;
            if (progress > 0.75) shooterChance += 0.15;
            else if (progress > 0.50) shooterChance += 0.10;
            else if (progress > 0.25) shooterChance += 0.05;

            const isShooter = Math.random() < shooterChance;

            let isElite = false;
            let eliteType: EliteShooterType | undefined = undefined;

            const eliteShooterProgressThreshold = superHardMode ? 0 : 0.5;
            const eliteShooterChance = superHardMode ? 0.20 : 0.15;

            if (isShooter && progress >= eliteShooterProgressThreshold && Math.random() < eliteShooterChance) {
                isElite = true;
                const eliteTypes: EliteShooterType[] = ['MAGIC', 'GATLING', 'LANDMINE', 'LASER'];
                eliteType = eliteTypes[Math.floor(Math.random() * eliteTypes.length)];
            }

            const enemy: Enemy = {
              id: Date.now() + charIndex,
              char,
              x: Math.random() * (GAME_WIDTH - ENEMY_WIDTH),
              y: -ENEMY_HEIGHT,
              width: ENEMY_WIDTH,
              height: ENEMY_HEIGHT,
              speedY: ENEMY_SPEED_PER_SECOND,
              movementPattern,
              isShooter,
              attackPattern: isShooter ? attackPattern : undefined,
              // Elite props
              isElite,
              eliteType,
              hp: isElite ? 3 : 1,
              isFlashing: false,
              // Super Hard Mode Props
              isBig: superHardMode && state.isMidGameBuffActive && !isElite,
            };

            if(enemy.isBig) enemy.hp = 3;

            switch(movementPattern) {
                case 'SINE_WAVE':
                    enemy.initialX = enemy.x;
                    enemy.amplitude = 50 + Math.random() * 100;
                    enemy.frequency = (0.005 + Math.random() * 0.005) * (Math.random() > 0.5 ? 1 : -1);
                    break;
                case 'ZIG_ZAG':
                    enemy.speedX = (60 + Math.random() * 60) * (Math.random() > 0.5 ? 1 : -1);
                    break;
                case 'DRIFTING':
                    enemy.speedX = (30 + Math.random() * 30) * (Math.random() > 0.5 ? 1 : -1);
                    break;
                case 'ACCELERATING':
                    enemy.accelerationY = ENEMY_ACCELERATION_PER_SECOND_SQUARED;
                    break;
            }

            if(enemy.isElite) {
                enemy.width *= 1.5;
                enemy.height *= 1.5;
                if(enemy.eliteType === 'LASER') {
                    enemy.laserState = 'IDLE';
                }
            }
            if(enemy.isBig) {
                enemy.width *= 1.3;
                enemy.height *= 1.3;
            }

            state.enemies.push(enemy);
            charIndex++;
            setTimeout(spawnChar, spawnInterval);
          }
        };
        // Track enemy spawn rate
        const enemyCount = line.length;
        state.totalEnemiesSpawned += enemyCount;
        
        // Initialize game start time
        const now = Date.now();
        if (state.gameStartTime === 0) {
          state.gameStartTime = now;
        }
        
        spawnChar();
        state.currentLyricIndex++;
      }
    }
    
    // --- Collision Detection ---
    const newProjectiles: Projectile[] = [];
    const newEnemies: Enemy[] = [];
    const enemiesHitThisFrame = new Set<number>();

    const handleItemCollection = (item: Item) => {
        state.itemsCollected[item.type] = (state.itemsCollected[item.type] || 0) + 1;
        switch (item.type) {
            case 'BOMB':
            case 'LASER_BEAM':
                if (state.stockedItem) { // If holding an item, convert new one to score
                    state.score += 500;
                    state.floatingTexts.push({ id: Date.now(), x: item.x, y: item.y, text: '+500', createdAt: Date.now() });
                } else {
                    state.stockedItem = item.type;
                }
                break;
            case 'SPEED_UP':
                state.floatingTexts.push({ id: Date.now(), x: state.playerX, y: state.playerY, text: 'SPEED UP!', createdAt: Date.now() });
                state.playerSpeedMultiplier *= 1.15;
                state.projectileSpeedMultiplier *= 1.15;
                state.speedUpCount++;
                break;
            case 'DIAGONAL_SHOT':
                if (!state.hasDiagonalShot) {
                    state.hasDiagonalShot = true;
                    state.baseShooterChance += 0.05;
                } else {
                    state.score += 1000;
                    state.floatingTexts.push({ id: Date.now(), x: item.x, y: item.y, text: '+1000', createdAt: Date.now() });
                }
                break;
            case 'SIDE_SHOT':
                if (!state.hasSideShot) {
                    state.hasSideShot = true;
                } else {
                    state.score += 1000;
                    state.floatingTexts.push({ id: Date.now(), x: item.x, y: item.y, text: '+1000', createdAt: Date.now() });
                }
                break;
            case 'CANCELLER_SHOT':
                if (!state.hasCancellerShot) {
                    state.hasCancellerShot = true;
                } else {
                    state.score += 1000;
                    state.floatingTexts.push({ id: Date.now(), x: item.x, y: item.y, text: '+1000', createdAt: Date.now() });
                }
                break;
            case 'ONE_UP':
                state.lives++;
                break;
        }
    };

    // Projectiles vs Enemies
    state.projectiles.forEach(p => {
        let projectileHit = false;
        state.enemies.forEach(e => {
            if (projectileHit || enemiesHitThisFrame.has(e.id)) return;
            if (p.x < e.x + e.width && p.x + p.width > e.x && p.y < e.y + e.height && p.y + p.height > e.y) {
                projectileHit = true;
                e.hp!--;
                e.isFlashing = true;
                e.flashEndTime = Date.now() + 100;
                
                if (e.hp! <= 0) {
                    enemiesHitThisFrame.add(e.id);
                    state.score += (e.isElite || e.isBig ? 75 : 10);
                    state.enemiesDefeated++;
                    state.explosions.push({ id: Date.now() + e.id, x: e.x + e.width / 2, y: e.y + e.height / 2, size: (e.isElite || e.isBig) ? 'large' : 'small', createdAt: Date.now() });
                }
            }
        });
        if (!projectileHit) newProjectiles.push(p);
    });
    state.projectiles = newProjectiles;
    state.enemies.forEach(e => { if (!enemiesHitThisFrame.has(e.id)) newEnemies.push(e); });
    state.enemies = newEnemies;

    // Laser vs Enemies
    if (state.isLaserActive) {
        const laserX = state.playerX + PLAYER_WIDTH / 2;
        const laserLine = { p1: {x: laserX, y: 0}, p2: {x: laserX, y: state.playerY} };
        state.enemies = state.enemies.filter(e => {
            const enemyRect = { x: e.x, y: e.y, width: e.width, height: e.height };
            if (lineIntersectsRect(laserLine, enemyRect)) {
                state.score += 5;
                state.explosions.push({ id: Date.now() + Math.random(), x: e.x + e.width / 2, y: e.y + e.height / 2, size: 'small', createdAt: Date.now() });
                return false; // Enemy destroyed
            }
            return true;
        });
    }

    const playerHitbox = {
      x: state.playerX,
      y: state.playerY,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
    };

    const takeHit = () => {
        if (state.isInvincible || state.isRespawning || state.isGameEnding || state.isGameOverDelayed) return;
        
        // Canceller Shot damage nullification
        let cancellerNullified = false;
        const cancellerChance = isLastStand ? 0.35 : 0.15;
        if (state.hasCancellerShot && Math.random() < cancellerChance) {
             cancellerNullified = true;
             playCancelSound();
             state.floatingTexts.push({ id: Date.now(), x: state.playerX, y: state.playerY, text: 'GUARD!', createdAt: Date.now() });
             
             // Add 0.5 second invincibility after canceller activation
             state.isInvincible = true;
             state.invincibilityEndTime = Date.now() + CANCELLER_INVINCIBILITY_DURATION;
        }

        if(cancellerNullified) return;

        state.lives--;
        playShipHitSound();
        state.explosions.push({ id: Date.now() + 1, x: state.playerX + PLAYER_WIDTH/2, y: state.playerY + PLAYER_HEIGHT/2, size: 'large', createdAt: Date.now() });
        
        // Activate bomb effect when player is destroyed (clear all on-screen enemies)
        playBombSound();
        const onScreenEnemies = state.enemies.filter(e => e.y > -ENEMY_HEIGHT && e.y < GAME_HEIGHT);
        onScreenEnemies.forEach(e => {
            state.explosions.push({ id: Date.now() + e.id, x: e.x + e.width / 2, y: e.y + e.height / 2, size: 'small', createdAt: Date.now() });
            state.score += (e.isElite || e.isBig ? 75 : 10);
            state.enemiesDefeated++;
        });
        const onScreenEnemyIds = new Set(onScreenEnemies.map(e => e.id));
        state.enemies = state.enemies.filter(e => !onScreenEnemyIds.has(e.id));
        
        if (state.lives === 1 && !state.stockedItem) {
            state.stockedItem = Math.random() > 0.5 ? 'BOMB' : 'LASER_BEAM';
            state.floatingTexts.push({ id: Date.now(), x: state.playerX, y: state.playerY, text: 'LAST STAND!', createdAt: Date.now() });
        }
        
        if (state.lives <= 0) {
            // ゲームオーバー遅延状態に設定
            state.isGameOverDelayed = true;
            state.gameOverDelayEndTime = Date.now() + 5000; // 5秒後にリザルト画面へ
            state.shouldHidePlayer = true; // 撃墜直後にプレイヤーを非表示
            state.showGameOverText = true; // ゲームオーバーテキストを即座に表示
            fadeOutBgm(4); // 4秒かけてBGMフェードアウト
        } else {
            state.isRespawning = true;
            state.respawnEndTime = Date.now() + RESPAWN_DURATION;
        }
    };
    
    // Enemy Projectiles vs Player
    state.enemyProjectiles = state.enemyProjectiles.filter(p => {
        if (p.x < playerHitbox.x + playerHitbox.width && p.x + p.width > playerHitbox.x && p.y < playerHitbox.y + playerHitbox.height && p.y + p.height > playerHitbox.y) {
            takeHit();
            return false;
        }
        return true;
    });

    // Enemy Lasers vs Player
    state.enemies.forEach(e => {
        if (e.eliteType === 'LASER' && e.laserState === 'FIRING' && e.laserTarget) {
            const laserLine = { p1: {x: e.x + e.width / 2, y: e.y + e.height}, p2: {x: e.laserTarget.x, y: e.laserTarget.y} };
            if (lineIntersectsRect(laserLine, playerHitbox)) {
                takeHit();
            }
        }
    });

    // Mines vs Player
    state.mines = state.mines.filter(m => {
        if (m.x < playerHitbox.x + playerHitbox.width && m.x + m.width > playerHitbox.x && m.y < playerHitbox.y + playerHitbox.height && m.y + m.height > playerHitbox.y) {
            takeHit();
            return false;
        }
        return true;
    });

    // Player Projectiles vs Enemy Projectiles (Canceller Shot)
    if (state.hasCancellerShot) {
        state.projectiles = state.projectiles.filter(playerP => {
            let hitEnemyP = false;
            state.enemyProjectiles = state.enemyProjectiles.filter(enemyP => {
                 if (playerP.x < enemyP.x + enemyP.width && playerP.x + playerP.width > enemyP.x && playerP.y < enemyP.y + enemyP.height && playerP.y + playerP.height > enemyP.y) {
                    hitEnemyP = true;
                    return false;
                 }
                 return true;
            });
            return !hitEnemyP;
        });
    }

    // Player Projectiles vs Mines
    state.projectiles = state.projectiles.filter(p => {
        let hitMine = false;
        state.mines = state.mines.filter(m => {
            if (p.x < m.x + m.width && p.x + p.width > m.x && p.y < m.y + m.height && p.y + p.height > m.y) {
                hitMine = true;
                // Explode mine into burst
                for (let i = 0; i < 5; i++) {
                    const angle = (i * Math.PI * 2 / 5) - (Math.PI / 2); // 5-way spread, starting downwards
                    state.enemyProjectiles.push({
                        id: Date.now() + i,
                        x: m.x,
                        y: m.y,
                        width: 8, height: 8,
                        attackPattern: 'STRAIGHT_DOWN', // Visually different maybe?
                        speedX: Math.cos(angle) * currentEnemyProjectileSpeed * 0.8,
                        speedY: Math.sin(angle) * currentEnemyProjectileSpeed * 0.8,
                    });
                }
                state.explosions.push({ id: Date.now() + m.id, x: m.x + m.width/2, y: m.y + m.height/2, size: 'small', createdAt: Date.now() });
                return false;
            }
            return true;
        });
        return !hitMine;
    });
    
    // Enemies vs Player
    state.enemies.forEach(e => {
        if (e.x < playerHitbox.x + playerHitbox.width && e.x + e.width > playerHitbox.x && e.y < playerHitbox.y + playerHitbox.height && e.y + e.height > playerHitbox.y) {
            takeHit();
        }
    });
    
    // Items vs Player
    state.items = state.items.filter(item => {
        if (item.x < playerHitbox.x + playerHitbox.width && item.x + item.width > playerHitbox.x && item.y < playerHitbox.y + playerHitbox.height && item.y + item.height > playerHitbox.y) {
            handleItemCollection(item);
            return false;
        }
        return true;
    });

    // Item Spawning
    const itemSpawnThreshold = superHardMode ? 0.07 : ITEM_SPAWN_PERCENTAGE;
    if (totalChars > 0 && state.enemiesDefeated / totalChars >= itemSpawnMilestone.current + itemSpawnThreshold) {
        itemSpawnMilestone.current += itemSpawnThreshold;
        
        let availableItemTypes: ItemType[] = ['SPEED_UP', 'DIAGONAL_SHOT', 'SIDE_SHOT', 'CANCELLER_SHOT', 'BOMB', 'LASER_BEAM', 'ONE_UP'];
        
        if (state.hasDiagonalShot) {
            availableItemTypes = availableItemTypes.filter(t => t !== 'DIAGONAL_SHOT');
        }
        if (state.hasSideShot) {
            availableItemTypes = availableItemTypes.filter(t => t !== 'SIDE_SHOT');
        }
        if (state.hasCancellerShot) {
            availableItemTypes = availableItemTypes.filter(t => t !== 'CANCELLER_SHOT');
        }

        if (availableItemTypes.length > 0) {
            const type = availableItemTypes[Math.floor(Math.random() * availableItemTypes.length)];
            state.items.push({
                id: Date.now(),
                type,
                x: Math.random() * (GAME_WIDTH - ITEM_WIDTH),
                y: -ITEM_HEIGHT,
                width: ITEM_WIDTH,
                height: ITEM_HEIGHT,
                speedY: ENEMY_SPEED_PER_SECOND * 1.5,
            });
        }
    }

    // Force re-render
    forceUpdate(c => c + 1);
    gameLoopId.current = requestAnimationFrame(gameLoop);
  }, [lyrics, totalChars, totalLyricLines, endGame, superHardMode, handleSkip, playShipHitSound, playCancelSound, playBombSound, activateSpecialItem, fadeOutBgm]);

  useEffect(() => {
    let hasSetupAudio = false;
    
    const handleKeyDown = (e: KeyboardEvent) => {
        keysPressed.current[e.key] = true;
        keysPressed.current[e.code] = true;
        
        // 最初のキー押下時に音声を初期化
        if (!hasSetupAudio) {
            hasSetupAudio = true;
            setupAudio();
        }
        
        if ((e.key === ' ' || e.code === 'Spacebar') && gameStateRef.current.showSkip && spacebarPressStart.current === 0) {
            spacebarPressStart.current = Date.now();
        }
        if (e.key === 'Shift' || e.code === 'Tab') {
            e.preventDefault();
            activateSpecialItem();
        }
        if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        keysPressed.current[e.key] = false;
        keysPressed.current[e.code] = false;
        if ((e.key === ' ' || e.code === 'Spacebar') && gameStateRef.current.showSkip) {
            spacebarPressStart.current = 0;
            if(gameStateRef.current.spacePressProgress < 100) {
                handleSkip();
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // ゲームループ開始（音声はユーザーインタラクション後に初期化）
    gameLoopId.current = requestAnimationFrame(gameLoop);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        if (gameLoopId.current) cancelAnimationFrame(gameLoopId.current);
        if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [gameLoop, setupAudio, activateSpecialItem, handleSkip]);
  
  const { playerX, playerY, projectiles, enemies, items, isInvincible, isRespawning, stockedItem, isLaserActive, enemyProjectiles, lives, score, enemiesDefeated, itemsCollected, explosions, mines, floatingTexts, shouldHidePlayer, currentEnemySpawnRate, showGameOverText } = gameStateRef.current;
  const isLastStand = lives === 1;

  const getStockedItemIcon = (itemType: SpecialWeapon) => {
    const props = { className: "w-10 h-10" };
    switch (itemType) {
        case 'BOMB': return <BombIcon {...props} />;
        case 'LASER_BEAM': return <LaserIcon {...props} />;
        default: return null;
    }
  };

  const songProgressPercentage = totalLyricLines > 0 ? (gameStateRef.current.currentLyricIndex / totalLyricLines) * 100 : 0;
  let progressColorClass = 'bg-sky-400';
  if(songProgressPercentage > 95) progressColorClass = 'bg-rose-500';
  else if (songProgressPercentage > 75) progressColorClass = 'bg-red-500';
  else if (songProgressPercentage > 50) progressColorClass = 'bg-orange-500';
  else if (songProgressPercentage > 25) progressColorClass = 'bg-yellow-400';

  const collectedItemIcons = useMemo(() => {
    const state = gameStateRef.current;
    const icons = [];
    if (state.hasDiagonalShot) icons.push(<DiagonalShotIcon key="diag" className="w-5 h-5 text-green-400"/>);
    if (state.hasSideShot) icons.push(<SideShotIcon key="side" className="w-5 h-5 text-cyan-400"/>);
    if (state.hasCancellerShot) icons.push(<CancellerShotIcon key="cancel" className="w-5 h-5 text-purple-400"/>);
    
    if (state.speedUpCount > 0) {
        icons.push(
            <div key="speed" className="flex items-center space-x-0.5 text-blue-400">
                <SpeedUpIcon className="w-5 h-5"/>
                <span className="text-xs font-bold">x{state.speedUpCount}</span>
            </div>
        );
    }

    return icons;
  }, [
      gameStateRef.current.hasDiagonalShot, 
      gameStateRef.current.hasSideShot,
      gameStateRef.current.hasCancellerShot,
      gameStateRef.current.speedUpCount
    ]);

    const itemSpawnThreshold = superHardMode ? 0.07 : ITEM_SPAWN_PERCENTAGE;
    const currentDefeatRatio = totalChars > 0 ? gameStateRef.current.enemiesDefeated / totalChars : 0;
    const lastSpawnMilestone = itemSpawnMilestone.current;
    let itemProgressPercentage = 0;
    if (totalChars > 0 && itemSpawnThreshold > 0) {
        const progressSinceLastItem = currentDefeatRatio - lastSpawnMilestone;
        itemProgressPercentage = Math.max(0, Math.min(100, (progressSinceLastItem / itemSpawnThreshold) * 100));
    }


  return (
    <div className="relative bg-slate-900 border-4 border-slate-700" style={{ width: GAME_WIDTH, height: GAME_HEIGHT, userSelect: 'none', cursor: 'none', overflow: 'hidden' }}>
      <audio 
        ref={audioRef} 
        src={audioUrl}
        preload="auto"
        crossOrigin="anonymous"
        onError={(e) => console.error("Audio load error:", e)}
        onCanPlay={() => console.log("Audio can play")}
      />
      
      {/* Game Objects */}
      {!isRespawning && !shouldHidePlayer && <PlayerComponent x={playerX} y={playerY} isInvincible={isInvincible} isLastStand={isLastStand} />}
      {enemies.map(e => <EnemyComponent key={e.id} enemy={e} isLastStand={isLastStand}/>)}
      {projectiles.map(p => <ProjectileComponent key={p.id} p={p} />)}
      {enemyProjectiles.map(p => <EnemyProjectileComponent key={p.id} p={p} />)}
      {items.map(i => <ItemComponent key={i.id} item={i} />)}
      {mines.map(m => <MineComponent key={m.id} mine={m} />)}
      {explosions.map(ex => <ExplosionComponent key={ex.id} explosion={ex} />)}
      {isLaserActive && <LaserBeamComponent x={playerX} y={playerY} />}
      {floatingTexts.map(ft => <FloatingTextComponent key={ft.id} {...ft} />)}

      {/* Enemy Lasers */}
      {enemies.map(e => {
        if (e.eliteType === 'LASER' && e.laserState === 'AIMING' && e.laserTarget) {
            const start = { x: e.x + e.width / 2, y: e.y + e.height };
            const end = e.laserTarget;
            const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
            const distance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            return <div key={`laser-aim-${e.id}`} style={{ position: 'absolute', left: start.x, top: start.y, width: distance, height: 2, background: 'rgba(255,0,0,0.3)', transformOrigin: 'left center', transform: `rotate(${angle}deg)`}}/>
        }
        if (e.eliteType === 'LASER' && e.laserState === 'FIRING' && e.laserTarget) {
            const start = { x: e.x + e.width / 2, y: e.y + e.height };
            const end = e.laserTarget;
            const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
            const distance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            return <div key={`laser-fire-${e.id}`} style={{ position: 'absolute', left: start.x, top: start.y, width: distance, height: 6, background: 'linear-gradient(90deg, rgba(255,100,100,1) 0%, rgba(255,200,100,1) 50%, rgba(255,100,100,1) 100%)', transformOrigin: 'left center', transform: `rotate(${angle}deg)`}}/>
        }
        return null;
      })}

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 right-0 p-3 text-white font-orbitron text-shadow-md flex justify-between items-start">
        <div className="text-left">
            <div className="flex items-center">
                {[...Array(Math.max(0, lives - 1))].map((_, i) => <PlayerShipIcon key={i} className={`w-6 h-6 mr-1 ${isLastStand ? 'text-red-500' : 'text-cyan-400'}`} />)}
            </div>
            <div className="flex items-center mt-2 space-x-1 h-6">
                {collectedItemIcons}
            </div>
            {/* Special Item Slot with Progress Bar */}
            <div className="mt-3 flex items-center space-x-2">
                {/* Item Slot */}
                <div className="w-12 h-12 bg-slate-800 border-2 border-slate-600 rounded-lg flex items-center justify-center" title="Special Item (SHIFT or TAB)">
                    {stockedItem && getStockedItemIcon(stockedItem)}
                </div>
                {/* Vertical Progress Bar */}
                <div className="w-1 h-12 bg-slate-600 rounded-full relative" title="Progress to next item drop">
                    <div 
                        className="absolute bottom-0 w-full bg-amber-400 transition-all duration-200 rounded-full"
                        style={{ height: `${itemProgressPercentage}%` }}
                    />
                </div>
            </div>
        </div>
        <div className="text-right">
            <p className="text-xl">SCORE: {score}</p>
            <p className="text-sm">DEFEATED: {enemiesDefeated} / {totalChars}</p>
            <p className="text-sm">E.RATE: {currentEnemySpawnRate.toFixed(1)}/s</p>
        </div>
      </div>
      
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1/2">
        <div className="relative w-full bg-slate-700 rounded-full h-4 border-2 border-slate-500 overflow-hidden">
            <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-400 opacity-50 z-10"></div>
            <div className={`${progressColorClass} h-full rounded-full transition-all duration-200`} style={{ width: `${songProgressPercentage}%` }}></div>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white text-shadow-md">
                {Math.floor(songProgressPercentage)}%
            </div>
        </div>
      </div>

      
      {gameStateRef.current.showSkip && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center">
            <div className="text-center">
                <p className="text-white text-3xl font-orbitron mb-4">SKIP INTRO</p>
                <p className="text-sky-300 text-xl font-bold">[PRESS & HOLD SPACEBAR]</p>
            </div>
             <div className="absolute bottom-1/4 w-1/2 bg-gray-600 rounded-full h-2.5">
                <div className="bg-sky-400 h-2.5 rounded-full" style={{width: `${gameStateRef.current.spacePressProgress}%`}}></div>
            </div>
        </div>
      )}

      {isLastStand && <div className="absolute inset-0 border-4 border-red-500 rounded-none pointer-events-none animate-pulse box-shadow-last-stand"></div>}

      {/* Game Over Display */}
      {showGameOverText && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
          <h1 className="text-8xl font-orbitron font-bold text-red-500 animate-pulse text-center drop-shadow-2xl">
            GAME OVER
          </h1>
        </div>
      )}

    </div>
  );
}
