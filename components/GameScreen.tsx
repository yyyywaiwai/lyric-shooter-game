
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LyricLine, Enemy, Projectile, Item, MovementPattern, ItemType, SpecialWeapon, EnemyProjectile, ShooterAttackPattern, Explosion, GameStats, EliteShooterType, Mine, FloatingText } from '../types';
import { BombIcon, SpeedUpIcon, DiagonalShotIcon, LaserIcon, OneUpIcon, PlayerShipIcon, SideShotIcon, CancellerShotIcon, RicochetShotIcon, PhaseShieldIcon } from './icons';
import ProgressCircle from './ProgressCircle';

// Object pools for performance
class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;

  constructor(createFn: () => T, resetFn: (obj: T) => void, initialSize = 50) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createFn());
    }
  }

  get(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  release(obj: T): void {
    this.resetFn(obj);
    if (this.pool.length < 200) { // Prevent unlimited growth
      this.pool.push(obj);
    }
  }

  releaseAll(objects: T[]): void {
    objects.forEach(obj => this.release(obj));
  }
}

// Spatial grid for collision optimization
class SpatialGrid {
  private cellSize: number;
  private cols: number;
  private rows: number;
  private grid: Set<any>[][];

  constructor(width: number, height: number, cellSize = 64) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.clear();
  }

  clear(): void {
    this.grid = [];
    for (let row = 0; row < this.rows; row++) {
      this.grid[row] = [];
      for (let col = 0; col < this.cols; col++) {
        this.grid[row][col] = new Set();
      }
    }
  }

  insert(obj: any): void {
    const minCol = Math.max(0, Math.floor(obj.x / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((obj.x + obj.width) / this.cellSize));
    const minRow = Math.max(0, Math.floor(obj.y / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((obj.y + obj.height) / this.cellSize));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        this.grid[row][col].add(obj);
      }
    }
  }

  queryNearby(obj: any): Set<any> {
    const nearby = new Set<any>();
    const minCol = Math.max(0, Math.floor((obj.x - this.cellSize) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((obj.x + obj.width + this.cellSize) / this.cellSize));
    const minRow = Math.max(0, Math.floor((obj.y - this.cellSize) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((obj.y + obj.height + this.cellSize) / this.cellSize));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        this.grid[row][col].forEach(item => nearby.add(item));
      }
    }
    return nearby;
  }
}

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
const RICOCHET_SPEED_FACTOR = 0.3; // 70% slower after each bounce (disabled during Last Stand)
const RICOCHET_DIAMETER = 10; // visual/collision size for bounced bullets
const PHASE_SHIELD_DURATION = 3000; // ms
const BEAT_SPEED_MIN_INTERVAL = 2000;
const BEAT_SPEED_MAX_INTERVAL = 8000;
const BEAT_MAX_SPEED_MULTIPLIER = 3;
const BEAT_TARGET_OFFSET = PLAYER_WIDTH;
const DECELERATE_INITIAL_MULTIPLIER = 2;
const DECELERATE_FINAL_MULTIPLIER = 0.4;
const CIRCLE_TRIGGER_RADIUS = 120;
const CIRCLE_ORBIT_LOOPS = 1;
const CIRCLE_ORBIT_ANGULAR_SPEED = Math.PI; // radians per second
const CIRCLE_MIN_ORBIT_RADIUS = 40;
const CIRCLE_GUIDE_DURATION = 400; // ms
const CIRCLE_GUIDE_SEGMENTS = 48;

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


// Pre-rendered enemy color styles
const ENEMY_COLORS = {
  ELITE_MAGIC: '#f43f5e',
  ELITE_GATLING: '#f59e0b',
  ELITE_LANDMINE: '#84cc16',
  ELITE_LASER: '#67e8f9',
  ELITE_DEFAULT: '#a855f7',
  SHOOTER_HOMING: '#e879f9',
  SHOOTER_STRAIGHT_DOWN: '#facc15',
  SHOOTER_DELAYED_HOMING: '#fb923c',
  SHOOTER_SPIRAL: '#2dd4bf',
  DEFAULT: '#f87171'
};

// Restore original DOM components with optimizations
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
            case 'CIRCLE':
                colorClass = 'text-sky-400';
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
            'BEAT': 'text-indigo-400',
            'SIDE': 'text-amber-400',
            'DECELERATE': 'text-rose-400',
            'CIRCLE': 'text-cyan-400',
        }[enemy.attackPattern || 'HOMING'] || 'text-fuchsia-400';
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

const ProjectileComponent = React.memo(({ p }: { p: Projectile }) => {
    const isRico = p.isRicochetPrimary || p.hasBounced;
    const color = isRico ? 'bg-rose-400' : 'bg-yellow-300';
    const style: React.CSSProperties = {
        transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
        width: p.width,
        height: p.height,
    };
    const shapeClass = p.hasBounced ? 'rounded-full' : 'rounded-lg';
    return (
        <div style={style} className={`absolute ${color} ${shapeClass} box-shadow-neon`}></div>
    );
});

const EnemyProjectileComponent = React.memo(({ p }: { p: EnemyProjectile }) => {
    const projectileColors: Record<ShooterAttackPattern, string> = {
        'HOMING': 'bg-fuchsia-500',
        'STRAIGHT_DOWN': 'bg-yellow-500',
        'DELAYED_HOMING': 'bg-orange-500',
        'SPIRAL': 'bg-teal-500',
        'BEAT': 'bg-indigo-500',
        'SIDE': 'bg-amber-500',
        'DECELERATE': 'bg-rose-500',
        'CIRCLE': 'bg-cyan-400',
    };
    const projectileColor = projectileColors[p.attackPattern] || 'bg-slate-400';
    
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

const LaserBeamComponent = React.memo(({ x, y }: { x: number, y:number }) => (
    <div
        style={{ transform: `translate3d(${x + PLAYER_WIDTH / 2 - 5}px, 0, 0)`, width: 10, height: y }}
        className="absolute bg-gradient-to-t from-red-400 to-orange-300 rounded-t-full animate-pulse"
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
            case 'RICOCHET_SHOT': return <RicochetShotIcon {...iconProps} />;
            case 'LASER_BEAM': return <LaserIcon {...iconProps} />;
            case 'PHASE_SHIELD': return <PhaseShieldIcon {...iconProps} />;
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

// Keep minimal DOM components for special effects only
const PlayerComponent = React.memo(({ x, y, isInvincible, isLastStand, hasPhaseShield }: { x: number; y: number; isInvincible: boolean; isLastStand: boolean; hasPhaseShield: boolean; }) => (
    <div
        style={{ transform: `translate3d(${x}px, ${y}px, 0)`, width: PLAYER_WIDTH, height: PLAYER_HEIGHT, position: 'absolute' }}
        className={`text-cyan-400 ${isInvincible ? 'opacity-50 animate-pulse' : 'opacity-100'}`}
    >
        {hasPhaseShield && (
            <div
                style={{
                    position: 'absolute',
                    left: -6,
                    top: -6,
                    width: PLAYER_WIDTH + 12,
                    height: PLAYER_HEIGHT + 12,
                    borderRadius: '9999px',
                    boxShadow: '0 0 12px rgba(250,204,21,0.95), 0 0 24px rgba(250,204,21,0.6)',
                    pointerEvents: 'none',
                }}
                className="animate-pulse"
            />
        )}
        <PlayerShipIcon className={`w-full h-full ${isLastStand ? 'drop-shadow-[0_0_8px_#ef4444]' : 'drop-shadow-[0_0_5px_#0ea5e9]'}`} />
    </div>
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
  // Unique ID generator for projectiles
  const nextId = useRef(1);
  const generateId = useCallback(() => {
    return nextId.current++;
  }, []);

  // Object pools for performance
  const projectilePool = useRef(new ObjectPool<Projectile>(
    () => ({ id: 0, x: 0, y: 0, width: PROJECTILE_WIDTH, height: PROJECTILE_HEIGHT, speedY: 0 }),
    (obj) => { obj.id = 0; obj.x = 0; obj.y = 0; obj.width = PROJECTILE_WIDTH; obj.height = PROJECTILE_HEIGHT; obj.speedY = 0; obj.speedX = undefined; }
  ));
  
  const enemyProjectilePool = useRef(new ObjectPool<EnemyProjectile>(
    () => ({ id: 0, x: 0, y: 0, width: 8, height: 8, speedX: 0, speedY: 0, attackPattern: 'STRAIGHT_DOWN' }),
    (obj) => {
      obj.id = 0;
      obj.x = 0;
      obj.y = 0;
      obj.width = 8;
      obj.height = 8;
      obj.speedX = 0;
      obj.speedY = 0;
      obj.attackPattern = 'STRAIGHT_DOWN';
      obj.isDelayed = false;
      obj.delayEndTime = undefined;
      obj.beatTargetSide = undefined;
      obj.initialSpeed = undefined;
      obj.slowSpeed = undefined;
      obj.circleMode = undefined;
      obj.orbitCenterX = undefined;
      obj.orbitCenterY = undefined;
      obj.orbitRadius = undefined;
      obj.orbitAngle = undefined;
      obj.orbitAngularSpeed = undefined;
      obj.orbitAccumulatedAngle = undefined;
      obj.orbitDirection = undefined;
      obj.directionX = undefined;
      obj.directionY = undefined;
      obj.decelerateInitialDistance = undefined;
      obj.circleGuideUntil = undefined;
    }
  ));
  
  const explosionPool = useRef(new ObjectPool<Explosion>(
    () => ({ id: 0, x: 0, y: 0, size: 'small', createdAt: 0 }),
    (obj) => { obj.id = 0; obj.x = 0; obj.y = 0; obj.size = 'small'; obj.createdAt = 0; }
  ));
  
  const spatialGrid = useRef(new SpatialGrid(GAME_WIDTH, GAME_HEIGHT));
  
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
      hasRicochetShot: false,
      ricochetStacks: 0,
      mainShotCounter: 0,
      stockedItem: null as SpecialWeapon | null,
      stockedItemActiveUntil: 0,
      isLaserActive: false,
      laserEndTime: 0,
      isPhaseShieldActive: false,
      phaseShieldEndTime: 0,
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
      // Backspace key long press for restart
      backspacePressStart: 0,
      backspacePressProgress: 0,
  });

  const [, forceUpdate] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const keysPressed = useRef<Record<string, boolean>>({});
  const lastFireTime = useRef(0);
  const lastFrameTime = useRef(performance.now());
  const gameLoopId = useRef<number | null>(null);
  const itemSpawnMilestone = useRef(0);
  const spacebarPressStart = useRef(0);
  const initialItemAppliedRef = useRef(false);
  const loopStartedRef = useRef(false);
  
  const totalChars = useMemo(() => lyrics.reduce((acc, line) => acc + line.text.replace(/\s/g, '').length, 0), [lyrics]);
  const totalLyricLines = useMemo(() => lyrics.length, [lyrics]);
  
  const onEndGameRef = useRef(onEndGame);
  onEndGameRef.current = onEndGame;
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const bgmSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const bgmGainRef = useRef<GainNode | null>(null);
  
  useEffect(() => {
    if (initialItem) {
        if (!initialItemAppliedRef.current) {
            initialItemAppliedRef.current = true;
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
                case 'RICOCHET_SHOT':
                    state.hasRicochetShot = true;
                    state.ricochetStacks = (state.ricochetStacks || 0) + 1;
                    break;
                case 'BOMB': case 'LASER_BEAM': case 'PHASE_SHIELD': state.stockedItem = initialItem; break;
            }
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
          gameStateRef.current.spacePressProgress = 0;
          spacebarPressStart.current = 0;
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
      if (!state.stockedItem || state.isGameOverDelayed) return;
      // Prevent re-activation while a duration-based item is active and held in the slot
      if (state.stockedItemActiveUntil && Date.now() < state.stockedItemActiveUntil) return;

      if (state.stockedItem === 'BOMB') {
          playBombSound();
          state.itemsCollected['BOMB'] = (state.itemsCollected['BOMB'] || 0) + 1;
          const onScreenEnemies = state.enemies.filter(e => e.y > -ENEMY_HEIGHT && e.y < GAME_HEIGHT);
          onScreenEnemies.forEach(e => {
            const explosion = explosionPool.current.get();
            explosion.id = generateId();
            explosion.x = e.x + e.width / 2;
            explosion.y = e.y + e.height / 2;
            explosion.size = 'small';
            explosion.createdAt = Date.now();
            state.explosions.push(explosion);
            state.score += (e.isElite || e.isBig ? 75 : 10);
            state.enemiesDefeated++;
          });
          const onScreenEnemyIds = new Set(onScreenEnemies.map(e => e.id));
          state.enemies = state.enemies.filter(e => !onScreenEnemyIds.has(e.id));
      } else if (state.stockedItem === 'LASER_BEAM') {
          state.isLaserActive = true;
          state.laserEndTime = Date.now() + LASER_DURATION;
          state.stockedItemActiveUntil = state.laserEndTime;
          playCancelSound();
          return; // keep icon in slot semi-transparent while active
      } else if (state.stockedItem === 'PHASE_SHIELD') {
          state.isPhaseShieldActive = true;
          state.phaseShieldEndTime = Date.now() + PHASE_SHIELD_DURATION;
          state.isInvincible = true;
          state.invincibilityEndTime = state.phaseShieldEndTime;
          state.stockedItemActiveUntil = state.phaseShieldEndTime;
          state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: 'PHASE SHIELD!', createdAt: Date.now() });
          playCancelSound();
          return; // keep icon in slot semi-transparent while active
      }
      // Non-duration items are consumed immediately
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

    // --- Backspace Restart Logic ---
    if (state.backspacePressStart > 0) {
        const pressDuration = Date.now() - state.backspacePressStart;
        state.backspacePressProgress = Math.min(100, (pressDuration / 1500) * 100);
        if (pressDuration > 1500) {
            // 1.5秒経過した場合、ゲームを終了してREADY画面に戻る
            // App.tsxの状態を変更してREADY画面に戻るために、特別なステータスでendGameを呼び出す
            if (audioRef.current) audioRef.current.pause();
            onEndGameRef.current({ 
                score: 0, 
                enemiesDefeated: 0, 
                totalEnemies: 0, 
                itemsCollected: {}, 
                songProgressPercentage: 0 
            }, 'gameOver');
            return;
        }
    } else if (state.backspacePressStart === 0 && state.backspacePressProgress > 0) {
        state.backspacePressProgress = 0;
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
    
    const canFire = !state.isRespawning && !state.isGameOverDelayed && (keysPressed.current[' '] || keysPressed.current['Spacebar']) && !state.isLaserActive && !(state.showSkip && spacebarPressStart.current > 0);
    if (canFire && Date.now() - lastFireTime.current > currentFireCooldown) {
        lastFireTime.current = Date.now();
        state.mainShotCounter++;
        const pX = state.playerX + PLAYER_WIDTH / 2 - PROJECTILE_WIDTH / 2;
        const pY = state.playerY;
        
        let currentProjectileSpeed = INITIAL_PROJECTILE_SPEED_PER_SECOND * state.projectileSpeedMultiplier;
        if (isLastStand) {
            currentProjectileSpeed *= 1.3;
        }

        // Create new projectile object for proper React re-rendering
        // Ricochet triggers every shot during Last Stand, otherwise every other shot
        const isRicochetPrimary = state.hasRicochetShot && (isLastStand || state.mainShotCounter % 2 === 0);
        state.projectiles.push({ 
            id: generateId(), 
            x: pX, 
            y: pY, 
            width: PROJECTILE_WIDTH, 
            height: PROJECTILE_HEIGHT, 
            speedY: currentProjectileSpeed,
            isRicochetPrimary,
            remainingBounces: isRicochetPrimary ? state.ricochetStacks : 0,
        });
        
        const diagonalInterval = isLastStand ? 2 : 3;
        if(state.hasDiagonalShot && state.mainShotCounter % diagonalInterval === 0) {
            state.projectiles.push({ 
                id: generateId(), 
                x: pX, 
                y: pY, 
                width: PROJECTILE_WIDTH, 
                height: PROJECTILE_HEIGHT, 
                speedY: currentProjectileSpeed, 
                speedX: currentProjectileSpeed * 0.4 
            });
            state.projectiles.push({ 
                id: generateId(), 
                x: pX, 
                y: pY, 
                width: PROJECTILE_WIDTH, 
                height: PROJECTILE_HEIGHT, 
                speedY: currentProjectileSpeed, 
                speedX: -currentProjectileSpeed * 0.4 
            });
        }

        const sideInterval = isLastStand ? 1 : 2;
        if(state.hasSideShot && state.mainShotCounter % sideInterval === 0) {
            const sideProjectileY = state.playerY + PLAYER_HEIGHT / 2 - PROJECTILE_WIDTH / 2;
            
            state.projectiles.push({ 
                id: generateId(), 
                x: state.playerX + PLAYER_WIDTH/2, 
                y: sideProjectileY, 
                width: PROJECTILE_HEIGHT, 
                height: PROJECTILE_WIDTH, 
                speedY: 0, 
                speedX: -currentProjectileSpeed 
            });
            state.projectiles.push({ 
                id: generateId(), 
                x: state.playerX + PLAYER_WIDTH/2, 
                y: sideProjectileY, 
                width: PROJECTILE_HEIGHT, 
                height: PROJECTILE_WIDTH, 
                speedY: 0, 
                speedX: currentProjectileSpeed 
            });
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
    if (state.isLaserActive && currentTime > state.laserEndTime) { state.isLaserActive = false; playCancelSound(); }
    if (state.isPhaseShieldActive && currentTime > state.phaseShieldEndTime) { state.isPhaseShieldActive = false; playCancelSound(); state.isInvincible = true; state.invincibilityEndTime = currentTime + 500; }
    // Clear duration-based item from slot when its effect ends
    if (state.stockedItemActiveUntil && currentTime > state.stockedItemActiveUntil) {
        state.stockedItemActiveUntil = 0;
        state.stockedItem = null;
    }
    state.enemies.forEach(e => { if (e.isFlashing && currentTime > e.flashEndTime!) e.isFlashing = false; });
    state.mines = state.mines.filter(m => currentTime - m.createdAt < MINE_LIFETIME);
    state.floatingTexts = state.floatingTexts.filter(ft => currentTime - ft.createdAt < FLOATING_TEXT_DURATION);
    
    // Clean up expired explosions and return to pool
    const expiredExplosions = state.explosions.filter(ex => currentTime - ex.createdAt > EXPLOSION_DURATION);
    explosionPool.current.releaseAll(expiredExplosions);
    state.explosions = state.explosions.filter(ex => currentTime - ex.createdAt <= EXPLOSION_DURATION);

    // --- Object Movement (Optimized) ---
    // Update projectiles in-place and filter out-of-bounds
    state.projectiles = state.projectiles.map(p => ({ ...p, y: p.y - p.speedY * dt, x: p.x + (p.speedX || 0) * dt })).filter(p => p.y > -p.height && p.y < GAME_HEIGHT && p.x > -p.width && p.x < GAME_WIDTH);
    
    const currentEnemyProjectileSpeed = ENEMY_PROJECTILE_SPEED_PER_SECOND * state.enemyProjectileSpeedMultiplier;
    const fireBeatShooters = (triggerTime: number) => {
        const baseSpeed = ENEMY_PROJECTILE_SPEED_PER_SECOND * state.enemyProjectileSpeedMultiplier;
        const playerCenterX = state.playerX + PLAYER_WIDTH / 2;
        const playerCenterY = state.playerY + PLAYER_HEIGHT / 2;
        state.enemies.forEach(enemy => {
            if (!enemy.isShooter || enemy.attackPattern !== 'BEAT') return;
            if (enemy.y + enemy.height < 0) return;
            const enemyCenterX = enemy.x + enemy.width / 2;
            const enemyMuzzleY = enemy.y + enemy.height;
            const lastShot = enemy.lastShotTime ?? (triggerTime - BEAT_SPEED_MIN_INTERVAL);
            const interval = Math.max(0, triggerTime - lastShot);
            const clampedInterval = Math.min(BEAT_SPEED_MAX_INTERVAL, Math.max(BEAT_SPEED_MIN_INTERVAL, interval));
            const t = (clampedInterval - BEAT_SPEED_MIN_INTERVAL) / (BEAT_SPEED_MAX_INTERVAL - BEAT_SPEED_MIN_INTERVAL);
            const speedMultiplier = 1 + t * (BEAT_MAX_SPEED_MULTIPLIER - 1);
            const projectileSpeed = baseSpeed * speedMultiplier;
            [-BEAT_TARGET_OFFSET, BEAT_TARGET_OFFSET].forEach(offset => {
                const targetX = playerCenterX + offset;
                const targetY = playerCenterY;
                const dx = targetX - enemyCenterX;
                const dy = targetY - enemyMuzzleY;
                const distance = Math.hypot(dx, dy) || 1;
                const proj = enemyProjectilePool.current.get();
                proj.id = generateId();
                proj.x = enemyCenterX;
                proj.y = enemyMuzzleY;
                proj.width = 8;
                proj.height = 8;
                proj.attackPattern = 'BEAT';
                proj.speedX = (dx / distance) * projectileSpeed;
                proj.speedY = (dy / distance) * projectileSpeed;
                proj.beatTargetSide = offset < 0 ? 'LEFT' : 'RIGHT';
                state.enemyProjectiles.push(proj);
            });
            enemy.lastShotTime = triggerTime;
        });
    };

    // Update enemy projectiles
    const playerCenterX = state.playerX + PLAYER_WIDTH / 2;
    const playerCenterY = state.playerY + PLAYER_HEIGHT / 2;
    state.enemyProjectiles = state.enemyProjectiles.map(p => {
        const updatedProjectile = { ...p };

        switch (updatedProjectile.attackPattern) {
            case 'DELAYED_HOMING': {
                if (updatedProjectile.isDelayed) {
                    if (currentTime > (updatedProjectile.delayEndTime || 0)) {
                        updatedProjectile.isDelayed = false;
                        const angle = Math.atan2(playerCenterY - updatedProjectile.y, playerCenterX - updatedProjectile.x);
                        updatedProjectile.speedX = Math.cos(angle) * currentEnemyProjectileSpeed * 1.5;
                        updatedProjectile.speedY = Math.sin(angle) * currentEnemyProjectileSpeed * 1.5;
                        updatedProjectile.x += updatedProjectile.speedX * dt;
                        updatedProjectile.y += updatedProjectile.speedY * dt;
                    }
                } else {
                    updatedProjectile.x += updatedProjectile.speedX * dt;
                    updatedProjectile.y += updatedProjectile.speedY * dt;
                }
                break;
            }
            case 'DECELERATE': {
                let directionX = updatedProjectile.directionX;
                let directionY = updatedProjectile.directionY;
                if (directionX === undefined || directionY === undefined) {
                    const currentLen = Math.hypot(updatedProjectile.speedX, updatedProjectile.speedY) || 1;
                    directionX = updatedProjectile.speedX / currentLen;
                    directionY = updatedProjectile.speedY / currentLen;
                    updatedProjectile.directionX = directionX;
                    updatedProjectile.directionY = directionY;
                }

                const initialSpeed = updatedProjectile.initialSpeed ?? (currentEnemyProjectileSpeed * DECELERATE_INITIAL_MULTIPLIER);
                const finalSpeed = updatedProjectile.slowSpeed ?? (currentEnemyProjectileSpeed * DECELERATE_FINAL_MULTIPLIER);

                const initialDistance = updatedProjectile.decelerateInitialDistance
                    ?? Math.max(1, Math.hypot(playerCenterX - updatedProjectile.x, playerCenterY - updatedProjectile.y));
                updatedProjectile.decelerateInitialDistance = initialDistance;

                const distanceToPlayer = Math.hypot(playerCenterX - updatedProjectile.x, playerCenterY - updatedProjectile.y);
                const clampedDistance = Math.min(Math.max(distanceToPlayer, 0), initialDistance);
                const progress = initialDistance > 0 ? 1 - (clampedDistance / initialDistance) : 1;
                const easedProgress = Math.min(Math.max(progress, 0), 1);
                const targetSpeed = initialSpeed - (initialSpeed - finalSpeed) * easedProgress;

                updatedProjectile.speedX = (directionX || 0) * targetSpeed;
                updatedProjectile.speedY = (directionY || 0) * targetSpeed;
                updatedProjectile.x += updatedProjectile.speedX * dt;
                updatedProjectile.y += updatedProjectile.speedY * dt;
                break;
            }
            case 'CIRCLE': {
                const mode = updatedProjectile.circleMode || 'APPROACH';
                if (mode === 'APPROACH') {
                    updatedProjectile.x += updatedProjectile.speedX * dt;
                    updatedProjectile.y += updatedProjectile.speedY * dt;
                    const distanceToPlayer = Math.hypot(playerCenterX - updatedProjectile.x, playerCenterY - updatedProjectile.y);
                    if (distanceToPlayer <= CIRCLE_TRIGGER_RADIUS) {
                        updatedProjectile.circleMode = 'GUIDE_ORBIT';
                        updatedProjectile.circleGuideUntil = currentTime + CIRCLE_GUIDE_DURATION;
                        updatedProjectile.orbitCenterX = playerCenterX;
                        updatedProjectile.orbitCenterY = playerCenterY;
                        updatedProjectile.orbitRadius = Math.max(
                          CIRCLE_MIN_ORBIT_RADIUS,
                          Math.hypot(updatedProjectile.x - playerCenterX, updatedProjectile.y - playerCenterY)
                        );
                        updatedProjectile.orbitAngle = Math.atan2(
                          updatedProjectile.y - playerCenterY,
                          updatedProjectile.x - playerCenterX
                        );
                        updatedProjectile.orbitAngularSpeed = CIRCLE_ORBIT_ANGULAR_SPEED;
                        updatedProjectile.orbitAccumulatedAngle = 0;
                        updatedProjectile.orbitDirection = updatedProjectile.orbitDirection || (Math.random() > 0.5 ? 1 : -1);
                        updatedProjectile.speedX = 0;
                        updatedProjectile.speedY = 0;
                    }
                } else if (mode === 'GUIDE_ORBIT') {
                    if (currentTime >= (updatedProjectile.circleGuideUntil || 0)) {
                        updatedProjectile.circleMode = 'ORBIT';
                        updatedProjectile.circleGuideUntil = undefined;
                    }
                } else if (mode === 'ORBIT') {
                    const angularSpeed = (updatedProjectile.orbitAngularSpeed || CIRCLE_ORBIT_ANGULAR_SPEED) * (updatedProjectile.orbitDirection || 1);
                    updatedProjectile.orbitAngle = (updatedProjectile.orbitAngle || 0) + angularSpeed * dt;
                    updatedProjectile.orbitAccumulatedAngle = (updatedProjectile.orbitAccumulatedAngle || 0) + Math.abs(angularSpeed * dt);
                    const radius = updatedProjectile.orbitRadius || CIRCLE_MIN_ORBIT_RADIUS;
                    updatedProjectile.x = (updatedProjectile.orbitCenterX || playerCenterX) + Math.cos(updatedProjectile.orbitAngle!) * radius;
                    updatedProjectile.y = (updatedProjectile.orbitCenterY || playerCenterY) + Math.sin(updatedProjectile.orbitAngle!) * radius;
                    if ((updatedProjectile.orbitAccumulatedAngle || 0) >= Math.PI * 2 * CIRCLE_ORBIT_LOOPS) {
                        updatedProjectile.circleMode = 'GUIDE_DROP';
                        updatedProjectile.circleGuideUntil = currentTime + CIRCLE_GUIDE_DURATION;
                        updatedProjectile.speedX = 0;
                        updatedProjectile.speedY = 0;
                    }
                } else if (mode === 'GUIDE_DROP') {
                    if (currentTime >= (updatedProjectile.circleGuideUntil || 0)) {
                        updatedProjectile.circleMode = 'DROP';
                        updatedProjectile.circleGuideUntil = currentTime + CIRCLE_GUIDE_DURATION;
                        updatedProjectile.speedX = 0;
                        updatedProjectile.speedY = currentEnemyProjectileSpeed;
                    }
                } else { // DROP
                    if (updatedProjectile.circleGuideUntil !== undefined && currentTime >= updatedProjectile.circleGuideUntil) {
                        updatedProjectile.circleGuideUntil = undefined;
                    }
                    updatedProjectile.x += updatedProjectile.speedX * dt;
                    updatedProjectile.y += updatedProjectile.speedY * dt;
                }
                break;
            }
            default: {
                updatedProjectile.x += updatedProjectile.speedX * dt;
                updatedProjectile.y += updatedProjectile.speedY * dt;
            }
        }

        return updatedProjectile;
    }).filter(p => p.y < GAME_HEIGHT + 20 && p.y > -20 && p.x > -20 && p.x < GAME_WIDTH + 20);

    // Update items with new objects for React re-rendering
    state.items = state.items.map(item => ({ ...item, y: item.y + item.speedY * dt })).filter(item => item.y < GAME_HEIGHT);
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
        if (enemy.attackPattern === 'BEAT') return;
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
                    case 'CIRCLE': {
                        enemy.lastShotTime = currentTime;
                        enemy.attackPattern = 'CIRCLE';
                        const projectileBase = { id: currentTime + enemy.id, x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height, width: 8, height: 8 };
                        const angle = Math.atan2((state.playerY + PLAYER_HEIGHT/2) - projectileBase.y, (state.playerX + PLAYER_WIDTH/2) - projectileBase.x);
                        const approachSpeed = currentEnemyProjectileSpeed;
                        const proj = enemyProjectilePool.current.get();
                        proj.id = generateId();
                        proj.x = projectileBase.x;
                        proj.y = projectileBase.y;
                        proj.width = projectileBase.width;
                        proj.height = projectileBase.height;
                        proj.attackPattern = 'CIRCLE';
                        proj.speedX = Math.cos(angle) * approachSpeed;
                        proj.speedY = Math.sin(angle) * approachSpeed;
                        proj.circleMode = 'APPROACH';
                        proj.circleGuideUntil = undefined;
                        proj.orbitCenterX = undefined;
                        proj.orbitCenterY = undefined;
                        proj.orbitRadius = undefined;
                        proj.orbitAngle = undefined;
                        proj.orbitAngularSpeed = CIRCLE_ORBIT_ANGULAR_SPEED;
                        proj.orbitAccumulatedAngle = 0;
                        proj.orbitDirection = Math.random() > 0.5 ? 1 : -1;
                        state.enemyProjectiles.push(proj);
                        break;
                    }
                    case 'LANDMINE':
                        enemy.lastShotTime = currentTime;
                        state.mines.push({ id: generateId(), x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height, width: MINE_WIDTH, height: MINE_HEIGHT, createdAt: currentTime });
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
                                state.enemyProjectiles.push({
                                    id: generateId(),
                                    x: projectileBase.x,
                                    y: projectileBase.y,
                                    width: projectileBase.width,
                                    height: projectileBase.height,
                                    attackPattern: 'HOMING',
                                    speedX: Math.cos(angle) * currentEnemyProjectileSpeed,
                                    speedY: Math.sin(angle) * currentEnemyProjectileSpeed
                                });
                                break;
                            }
                            case 'STRAIGHT_DOWN': {
                                state.enemyProjectiles.push({
                                    id: generateId(),
                                    x: projectileBase.x,
                                    y: projectileBase.y,
                                    width: projectileBase.width,
                                    height: projectileBase.height,
                                    attackPattern: 'STRAIGHT_DOWN',
                                    speedX: 0,
                                    speedY: currentEnemyProjectileSpeed
                                });
                                break;
                            }
                            case 'DELAYED_HOMING': {
                                const proj = enemyProjectilePool.current.get();
                                proj.id = generateId();
                                proj.x = projectileBase.x;
                                proj.y = projectileBase.y;
                                proj.width = projectileBase.width;
                                proj.height = projectileBase.height;
                                proj.attackPattern = 'DELAYED_HOMING';
                                proj.speedX = 0;
                                proj.speedY = 0;
                                proj.isDelayed = true;
                                proj.delayEndTime = currentTime + 500;
                                state.enemyProjectiles.push(proj);
                                break;
                            }
                            case 'SPIRAL': {
                                enemy.spiralAngle = (enemy.spiralAngle || 0) + 0.5;
                                for (let i = 0; i < 4; i++) {
                                    const angle = enemy.spiralAngle + (i * Math.PI / 2);
                                    const proj = enemyProjectilePool.current.get();
                                    proj.id = generateId();
                                    proj.x = projectileBase.x;
                                    proj.y = projectileBase.y;
                                    proj.width = projectileBase.width;
                                    proj.height = projectileBase.height;
                                    proj.attackPattern = 'SPIRAL';
                                    proj.speedX = Math.cos(angle) * currentEnemyProjectileSpeed * 0.7;
                                    proj.speedY = Math.sin(angle) * currentEnemyProjectileSpeed * 0.7;
                                    state.enemyProjectiles.push(proj);
                                }
                                break;
                            }
                            case 'CIRCLE': {
                                const angle = Math.atan2((state.playerY + PLAYER_HEIGHT/2) - projectileBase.y, (state.playerX + PLAYER_WIDTH/2) - projectileBase.x);
                                const approachSpeed = currentEnemyProjectileSpeed;
                                const proj = enemyProjectilePool.current.get();
                                proj.id = generateId();
                                proj.x = projectileBase.x;
                                proj.y = projectileBase.y;
                                proj.width = projectileBase.width;
                                proj.height = projectileBase.height;
                                proj.attackPattern = 'CIRCLE';
                                proj.speedX = Math.cos(angle) * approachSpeed;
                                proj.speedY = Math.sin(angle) * approachSpeed;
                                proj.circleMode = 'APPROACH';
                                proj.circleGuideUntil = undefined;
                                proj.orbitCenterX = undefined;
                                proj.orbitCenterY = undefined;
                                proj.orbitRadius = undefined;
                                proj.orbitAngle = undefined;
                                proj.orbitAngularSpeed = CIRCLE_ORBIT_ANGULAR_SPEED;
                                proj.orbitAccumulatedAngle = 0;
                                proj.orbitDirection = Math.random() > 0.5 ? 1 : -1;
                                state.enemyProjectiles.push(proj);
                                break;
                            }
                            default: {
                                const proj = enemyProjectilePool.current.get();
                                proj.id = generateId();
                                proj.x = projectileBase.x;
                                proj.y = projectileBase.y;
                                proj.width = projectileBase.width;
                                proj.height = projectileBase.height;
                                proj.attackPattern = 'STRAIGHT_DOWN';
                                proj.speedX = 0;
                                proj.speedY = currentEnemyProjectileSpeed;
                                state.enemyProjectiles.push(proj);
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
                        const proj = enemyProjectilePool.current.get();
                        proj.id = generateId();
                        proj.x = projectileBase.x;
                        proj.y = projectileBase.y;
                        proj.width = projectileBase.width;
                        proj.height = projectileBase.height;
                        proj.attackPattern = 'HOMING';
                        proj.speedX = Math.cos(angle) * currentEnemyProjectileSpeed;
                        proj.speedY = Math.sin(angle) * currentEnemyProjectileSpeed;
                        state.enemyProjectiles.push(proj);
                        break;
                    }
                    case 'STRAIGHT_DOWN': {
                        const proj = enemyProjectilePool.current.get();
                        proj.id = generateId();
                        proj.x = projectileBase.x;
                        proj.y = projectileBase.y;
                        proj.width = projectileBase.width;
                        proj.height = projectileBase.height;
                        proj.attackPattern = 'STRAIGHT_DOWN';
                        proj.speedX = 0;
                        proj.speedY = currentEnemyProjectileSpeed;
                        state.enemyProjectiles.push(proj);
                        break;
                    }
                    case 'DELAYED_HOMING': {
                        const proj = enemyProjectilePool.current.get();
                        proj.id = generateId();
                        proj.x = projectileBase.x;
                        proj.y = projectileBase.y;
                        proj.width = projectileBase.width;
                        proj.height = projectileBase.height;
                        proj.attackPattern = 'DELAYED_HOMING';
                        proj.speedX = 0;
                        proj.speedY = 0;
                        proj.isDelayed = true;
                        proj.delayEndTime = currentTime + 500;
                        state.enemyProjectiles.push(proj);
                        break;
                    }
                    case 'SPIRAL': {
                        const randomAngle = Math.random() * Math.PI * 2;
                        const proj = enemyProjectilePool.current.get();
                        proj.id = generateId();
                        proj.x = projectileBase.x;
                        proj.y = projectileBase.y;
                        proj.width = projectileBase.width;
                        proj.height = projectileBase.height;
                        proj.attackPattern = 'SPIRAL';
                        proj.speedX = Math.cos(randomAngle) * currentEnemyProjectileSpeed * 0.7;
                        proj.speedY = Math.sin(randomAngle) * currentEnemyProjectileSpeed * 0.7;
                        state.enemyProjectiles.push(proj);
                        break;
                    }
                    case 'SIDE': {
                        const horizontalSpeed = currentEnemyProjectileSpeed * 0.75;
                        const verticalSpeed = currentEnemyProjectileSpeed * 0.85;

                        const leftProj = enemyProjectilePool.current.get();
                        leftProj.id = generateId();
                        leftProj.x = enemy.x;
                        leftProj.y = projectileBase.y;
                        leftProj.width = projectileBase.width;
                        leftProj.height = projectileBase.height;
                        leftProj.attackPattern = 'SIDE';
                        leftProj.speedX = -horizontalSpeed;
                        leftProj.speedY = verticalSpeed;
                        state.enemyProjectiles.push(leftProj);

                        const rightProj = enemyProjectilePool.current.get();
                        rightProj.id = generateId();
                        rightProj.x = enemy.x + enemy.width;
                        rightProj.y = projectileBase.y;
                        rightProj.width = projectileBase.width;
                        rightProj.height = projectileBase.height;
                        rightProj.attackPattern = 'SIDE';
                        rightProj.speedX = horizontalSpeed;
                        rightProj.speedY = verticalSpeed;
                        state.enemyProjectiles.push(rightProj);
                        break;
                    }
                    case 'DECELERATE': {
                        const angle = Math.atan2((state.playerY + PLAYER_HEIGHT/2) - projectileBase.y, (state.playerX + PLAYER_WIDTH/2) - projectileBase.x);
                        const fastSpeed = currentEnemyProjectileSpeed * DECELERATE_INITIAL_MULTIPLIER;
                        const dirX = Math.cos(angle);
                        const dirY = Math.sin(angle);
                        const slowSpeed = currentEnemyProjectileSpeed * DECELERATE_FINAL_MULTIPLIER;
                        const initialDistance = Math.max(1, Math.hypot(
                          (state.playerX + PLAYER_WIDTH / 2) - projectileBase.x,
                          (state.playerY + PLAYER_HEIGHT / 2) - projectileBase.y
                        ));
                        const proj = enemyProjectilePool.current.get();
                        proj.id = generateId();
                        proj.x = projectileBase.x;
                        proj.y = projectileBase.y;
                        proj.width = projectileBase.width;
                        proj.height = projectileBase.height;
                        proj.attackPattern = 'DECELERATE';
                        proj.directionX = dirX;
                        proj.directionY = dirY;
                        proj.speedX = dirX * fastSpeed;
                        proj.speedY = dirY * fastSpeed;
                        proj.initialSpeed = fastSpeed;
                        proj.slowSpeed = slowSpeed;
                        proj.decelerateInitialDistance = initialDistance;
                        state.enemyProjectiles.push(proj);
                        break;
                    }
                    case 'CIRCLE': {
                        const angle = Math.atan2((state.playerY + PLAYER_HEIGHT/2) - projectileBase.y, (state.playerX + PLAYER_WIDTH/2) - projectileBase.x);
                        const approachSpeed = currentEnemyProjectileSpeed;
                        const proj = enemyProjectilePool.current.get();
                        proj.id = generateId();
                        proj.x = projectileBase.x;
                        proj.y = projectileBase.y;
                        proj.width = projectileBase.width;
                        proj.height = projectileBase.height;
                        proj.attackPattern = 'CIRCLE';
                        proj.speedX = Math.cos(angle) * approachSpeed;
                        proj.speedY = Math.sin(angle) * approachSpeed;
                        proj.circleMode = 'APPROACH';
                        proj.circleGuideUntil = undefined;
                        proj.orbitCenterX = undefined;
                        proj.orbitCenterY = undefined;
                        proj.orbitRadius = undefined;
                        proj.orbitAngle = undefined;
                        proj.orbitAngularSpeed = CIRCLE_ORBIT_ANGULAR_SPEED;
                        proj.orbitAccumulatedAngle = 0;
                        proj.orbitDirection = Math.random() > 0.5 ? 1 : -1;
                        state.enemyProjectiles.push(proj);
                        break;
                    }
                    default: {
                        // Fallback to straight down if pattern not handled
                        const proj = enemyProjectilePool.current.get();
                        proj.id = generateId();
                        proj.x = projectileBase.x;
                        proj.y = projectileBase.y;
                        proj.width = projectileBase.width;
                        proj.height = projectileBase.height;
                        proj.attackPattern = 'STRAIGHT_DOWN';
                        proj.speedX = 0;
                        proj.speedY = currentEnemyProjectileSpeed;
                        state.enemyProjectiles.push(proj);
                        break;
                    }
                }
            }
        }

        // Handle Gatling Burst
        if (enemy.gatlingCooldown && enemy.gatlingBurstCount! > 0 && currentTime - enemy.gatlingLastBurstTime! > 100) {
            enemy.gatlingBurstCount!--;
            enemy.gatlingLastBurstTime = currentTime;
            
            const proj = enemyProjectilePool.current.get();
            proj.id = generateId();
            proj.x = enemy.x + enemy.width / 2;
            proj.y = enemy.y + enemy.height;
            proj.width = 8;
            proj.height = 8;
            proj.attackPattern = 'STRAIGHT_DOWN';
            proj.speedX = 0;
            proj.speedY = currentEnemyProjectileSpeed;
            state.enemyProjectiles.push(proj);
            
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
        fireBeatShooters(currentTime);
        const spawnChar = () => {
          if (charIndex < line.length) {
            const char = line[charIndex];
            
            const movementPatterns: MovementPattern[] = ['STRAIGHT_DOWN', 'SINE_WAVE', 'ZIG_ZAG', 'DRIFTING', 'ACCELERATING'];
            const movementPattern = movementPatterns[Math.floor(Math.random() * movementPatterns.length)];
            
            const normalShooterPatterns: ShooterAttackPattern[] = ['HOMING', 'STRAIGHT_DOWN', 'DELAYED_HOMING', 'SPIRAL', 'BEAT', 'SIDE', 'DECELERATE'];
            const legacyShooterPatterns: ShooterAttackPattern[] = ['HOMING', 'STRAIGHT_DOWN', 'DELAYED_HOMING', 'SPIRAL'];
            let attackPattern: ShooterAttackPattern | undefined = undefined;

            let shooterChance = state.baseShooterChance;

            // Song progress difficulty scaling
            const progress = state.currentLyricIndex / totalLyricLines;
            if (progress > 0.75) shooterChance += 0.15;
            else if (progress > 0.50) shooterChance += 0.10;
            else if (progress > 0.25) shooterChance += 0.05;

            const isShooter = Math.random() < shooterChance;
            if (isShooter) {
                attackPattern = normalShooterPatterns[Math.floor(Math.random() * normalShooterPatterns.length)];
            }

            let isElite = false;
            let eliteType: EliteShooterType | undefined = undefined;

            const eliteShooterProgressThreshold = superHardMode ? 0 : 0.5;
            const eliteShooterChance = superHardMode ? 0.20 : 0.15;

            if (isShooter && progress >= eliteShooterProgressThreshold && Math.random() < eliteShooterChance) {
                isElite = true;
                const eliteTypes: EliteShooterType[] = ['MAGIC', 'GATLING', 'LANDMINE', 'LASER', 'CIRCLE'];
                eliteType = eliteTypes[Math.floor(Math.random() * eliteTypes.length)];
                attackPattern = legacyShooterPatterns[Math.floor(Math.random() * legacyShooterPatterns.length)];
                if (eliteType === 'CIRCLE') {
                    attackPattern = 'CIRCLE';
                }
            }

            const enemy: Enemy = {
              id: generateId(),
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
              isBig: superHardMode && state.isMidGameBuffActive && !isElite && isShooter,
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
    
    // --- Optimized Collision Detection with Spatial Grid ---
    spatialGrid.current.clear();
    
    // Insert all objects into spatial grid
    state.enemies.forEach(e => spatialGrid.current.insert(e));
    state.projectiles.forEach(p => spatialGrid.current.insert(p));
    state.enemyProjectiles.forEach(p => spatialGrid.current.insert(p));
    state.items.forEach(i => spatialGrid.current.insert(i));
    state.mines.forEach(m => spatialGrid.current.insert(m));
    
    const hitProjectiles = new Set<Projectile>();
    const enemiesHitThisFrame = new Set<number>();

    const handleItemCollection = (item: Item) => {
        state.itemsCollected[item.type] = (state.itemsCollected[item.type] || 0) + 1;
        // 効果音を再生
        playCancelSound();
        
        switch (item.type) {
            case 'BOMB':
                if (state.stockedItem) { // If holding an item, convert new one to score
                    state.score += 500;
                    state.floatingTexts.push({ id: generateId(), x: item.x, y: item.y, text: '+500', createdAt: Date.now() });
                } else {
                    state.stockedItem = item.type;
                    state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: 'BOMB!', createdAt: Date.now() });
                }
                break;
            case 'LASER_BEAM':
                if (state.stockedItem) { // If holding an item, convert new one to score
                    state.score += 500;
                    state.floatingTexts.push({ id: generateId(), x: item.x, y: item.y, text: '+500', createdAt: Date.now() });
                } else {
                    state.stockedItem = item.type;
                    state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: 'LASER!', createdAt: Date.now() });
                }
                break;
            case 'PHASE_SHIELD':
                if (state.stockedItem) {
                    state.score += 500;
                    state.floatingTexts.push({ id: generateId(), x: item.x, y: item.y, text: '+500', createdAt: Date.now() });
                } else {
                    state.stockedItem = item.type;
                    state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: 'SHIELD!', createdAt: Date.now() });
                }
                break;
            case 'SPEED_UP':
                state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: 'SPEED UP!', createdAt: Date.now() });
                state.playerSpeedMultiplier *= 1.15;
                state.projectileSpeedMultiplier *= 1.15;
                state.speedUpCount++;
                break;
            case 'DIAGONAL_SHOT':
                if (!state.hasDiagonalShot) {
                    state.hasDiagonalShot = true;
                    state.baseShooterChance += 0.05;
                    state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: 'DIAGONAL!', createdAt: Date.now() });
                } else {
                    state.score += 1000;
                    state.floatingTexts.push({ id: generateId(), x: item.x, y: item.y, text: '+1000', createdAt: Date.now() });
                }
                break;
            case 'SIDE_SHOT':
                if (!state.hasSideShot) {
                    state.hasSideShot = true;
                    state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: 'SIDE!', createdAt: Date.now() });
                } else {
                    state.score += 1000;
                    state.floatingTexts.push({ id: generateId(), x: item.x, y: item.y, text: '+1000', createdAt: Date.now() });
                }
                break;
            case 'CANCELLER_SHOT':
                if (!state.hasCancellerShot) {
                    state.hasCancellerShot = true;
                    state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: 'CANCELLER!', createdAt: Date.now() });
                } else {
                    state.score += 1000;
                    state.floatingTexts.push({ id: generateId(), x: item.x, y: item.y, text: '+1000', createdAt: Date.now() });
                }
                break;
            case 'RICOCHET_SHOT':
                state.hasRicochetShot = true;
                state.ricochetStacks = (state.ricochetStacks || 0) + 1;
                state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: `RICOCHET x${state.ricochetStacks}` , createdAt: Date.now() });
                break;
            case 'ONE_UP':
                state.lives++;
                state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: '1UP!', createdAt: Date.now() });
                break;
        }
    };

    // Helper: find nearest enemy to a point, optionally excluding one id
    const findNearestEnemy = (x: number, y: number, excludeId?: number) => {
        let best: Enemy | null = null;
        let bestDist = Infinity;
        for (const e of state.enemies) {
            if (excludeId && e.id === excludeId) continue;
            const cx = e.x + e.width / 2;
            const cy = e.y + e.height / 2;
            const dx = cx - x;
            const dy = cy - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) {
                bestDist = d2;
                best = e;
            }
        }
        return best;
    };

    // Optimized Projectiles vs Enemies collision
    state.projectiles.forEach(p => {
        if (hitProjectiles.has(p)) return;
        
        const nearbyEnemies = spatialGrid.current.queryNearby(p);
        for (const e of nearbyEnemies) {
            if (e.constructor.name !== 'Object' || !e.char || enemiesHitThisFrame.has(e.id)) continue;
            
            // AABB collision check
            if (p.x < e.x + e.width && p.x + p.width > e.x && p.y < e.y + e.height && p.y + p.height > e.y) {
                hitProjectiles.add(p);
                e.hp!--;
                e.isFlashing = true;
                e.flashEndTime = Date.now() + 100;
                
                // Ricochet bounce trigger: when bullet has remaining bounces
                if ((p.remainingBounces || 0) > 0) {
                    const impactX = p.x + p.width / 2;
                    const impactY = p.y + p.height / 2;
                    const target = findNearestEnemy(impactX, impactY, e.id);
                    if (target) {
                        // calculate steering toward target
                        const tx = target.x + target.width / 2;
                        const ty = target.y + target.height / 2;
                        const dx = tx - impactX;
                        const dy = ty - impactY;
                        const mag = Math.hypot(dx, dy) || 1;
                        const baseSpeed = Math.hypot(p.speedX || 0, p.speedY) || (INITIAL_PROJECTILE_SPEED_PER_SECOND * state.projectileSpeedMultiplier);
                        const nextSpeed = baseSpeed * (isLastStand ? 1 : RICOCHET_SPEED_FACTOR);
                        const vx = (dx / mag) * nextSpeed;
                        const vy = (dy / mag) * nextSpeed; // positive is downward
                        const rot = Math.atan2(vy, vx) * 180 / Math.PI;
                        state.projectiles.push({
                            id: generateId(),
                            x: impactX - RICOCHET_DIAMETER / 2,
                            y: impactY - RICOCHET_DIAMETER / 2,
                            width: RICOCHET_DIAMETER,
                            height: RICOCHET_DIAMETER,
                            speedX: vx,
                            // convert to internal sign convention (y -= speedY*dt)
                            speedY: -vy,
                            hasBounced: true,
                            remainingBounces: (p.remainingBounces || 0) - 1,
                        });
                    }
                }

                if (e.hp! <= 0) {
                    enemiesHitThisFrame.add(e.id);
                    state.score += (e.isElite || e.isBig ? 75 : 10);
                    state.enemiesDefeated++;
                    
                    const explosion = explosionPool.current.get();
                    explosion.id = generateId();
                    explosion.x = e.x + e.width / 2;
                    explosion.y = e.y + e.height / 2;
                    explosion.size = (e.isElite || e.isBig) ? 'large' : 'small';
                    explosion.createdAt = Date.now();
                    state.explosions.push(explosion);
                }
                break;
            }
        }
    });
    
    // Remove hit projectiles
    state.projectiles = state.projectiles.filter(p => !hitProjectiles.has(p));
    
    // Remove destroyed enemies
    state.enemies = state.enemies.filter(e => !enemiesHitThisFrame.has(e.id));

    // Laser vs Enemies
    if (state.isLaserActive) {
        const laserX = state.playerX + PLAYER_WIDTH / 2;
        const laserLine = { p1: {x: laserX, y: 0}, p2: {x: laserX, y: state.playerY} };
        state.enemies = state.enemies.filter(e => {
            const enemyRect = { x: e.x, y: e.y, width: e.width, height: e.height };
            if (lineIntersectsRect(laserLine, enemyRect)) {
                state.score += 5;
                state.explosions.push({ id: generateId(), x: e.x + e.width / 2, y: e.y + e.height / 2, size: 'small', createdAt: Date.now() });
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
             state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: 'GUARD!', createdAt: Date.now() });
             
             // Add 0.5 second invincibility after canceller activation
             state.isInvincible = true;
             state.invincibilityEndTime = Date.now() + CANCELLER_INVINCIBILITY_DURATION;
        }

        if(cancellerNullified) return;

        state.lives--;
        playShipHitSound();
        state.explosions.push({ id: generateId(), x: state.playerX + PLAYER_WIDTH/2, y: state.playerY + PLAYER_HEIGHT/2, size: 'large', createdAt: Date.now() });
        
        // Activate bomb effect when player is destroyed (clear all on-screen enemies)
        playBombSound();
        const onScreenEnemies = state.enemies.filter(e => e.y > -ENEMY_HEIGHT && e.y < GAME_HEIGHT);
        onScreenEnemies.forEach(e => {
            state.explosions.push({ id: generateId(), x: e.x + e.width / 2, y: e.y + e.height / 2, size: 'small', createdAt: Date.now() });
            state.score += (e.isElite || e.isBig ? 75 : 10);
            state.enemiesDefeated++;
        });
        const onScreenEnemyIds = new Set(onScreenEnemies.map(e => e.id));
        state.enemies = state.enemies.filter(e => !onScreenEnemyIds.has(e.id));
        
        if (state.lives === 1 && !state.stockedItem) {
            state.stockedItem = Math.random() > 0.5 ? 'BOMB' : 'LASER_BEAM';
            state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: 'LAST STAND!', createdAt: Date.now() });
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
            if (state.isPhaseShieldActive) {
                // With Canceller, reflect the projectile back
                if (state.hasCancellerShot) {
                    const proj = projectilePool.current.get();
                    proj.id = generateId();
                    proj.x = state.playerX + PLAYER_WIDTH / 2 - PROJECTILE_WIDTH / 2;
                    proj.y = state.playerY;
                    proj.width = PROJECTILE_WIDTH;
                    proj.height = PROJECTILE_HEIGHT;
                    proj.speedX = -(p.speedX);
                    // Ensure upward travel; if incoming was upward, invert to downward then upward min speed
                    const baseUp = Math.max(INITIAL_PROJECTILE_SPEED_PER_SECOND * 0.7, -p.speedY);
                    proj.speedY = baseUp;
                    state.projectiles.push(proj);
                    playCancelSound();
                }
                return false; // absorbed by shield
            } else {
                takeHit();
                return false;
            }
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

    // Player Projectiles vs Enemy Projectiles (Canceller Shot) - optimized
    if (state.hasCancellerShot) {
        const playerProjsToRemove: Projectile[] = [];
        const enemyProjsToRemove: EnemyProjectile[] = [];
        
        state.projectiles.forEach(playerP => {
            if (playerProjsToRemove.includes(playerP)) return;
            
            const nearbyEnemyProj = spatialGrid.current.queryNearby(playerP);
            for (const enemyP of nearbyEnemyProj) {
                if (!enemyP.attackPattern || enemyProjsToRemove.includes(enemyP)) continue;
                
                if (playerP.x < enemyP.x + enemyP.width && playerP.x + playerP.width > enemyP.x && playerP.y < enemyP.y + enemyP.height && playerP.y + playerP.height > enemyP.y) {
                    // If this bullet still has ricochets remaining, trigger a bounce on cancel
                    if ((playerP.remainingBounces || 0) > 0) {
                        const impactX = playerP.x + playerP.width / 2;
                        const impactY = playerP.y + playerP.height / 2;
                        const target = findNearestEnemy(impactX, impactY);
                        if (target) {
                            const tx = target.x + target.width / 2;
                            const ty = target.y + target.height / 2;
                            const dx = tx - impactX;
                            const dy = ty - impactY;
                            const mag = Math.hypot(dx, dy) || 1;
                            const baseSpeed = Math.hypot(playerP.speedX || 0, playerP.speedY) || (INITIAL_PROJECTILE_SPEED_PER_SECOND * state.projectileSpeedMultiplier);
                            const nextSpeed = baseSpeed * (isLastStand ? 1 : RICOCHET_SPEED_FACTOR);
                            const vx = (dx / mag) * nextSpeed;
                            const vy = (dy / mag) * nextSpeed;
                            const rot = Math.atan2(vy, vx) * 180 / Math.PI;
                            state.projectiles.push({
                                id: generateId(),
                                x: impactX - RICOCHET_DIAMETER / 2,
                                y: impactY - RICOCHET_DIAMETER / 2,
                                width: RICOCHET_DIAMETER,
                                height: RICOCHET_DIAMETER,
                                speedX: vx,
                                speedY: -vy,
                                hasBounced: true,
                                remainingBounces: (playerP.remainingBounces || 0) - 1,
                            });
                        }
                    }
                    playerProjsToRemove.push(playerP);
                    enemyProjsToRemove.push(enemyP);
                    break;
                }
            }
        });
        
        // Remove collided projectiles
        state.projectiles = state.projectiles.filter(p => !playerProjsToRemove.includes(p));
        state.enemyProjectiles = state.enemyProjectiles.filter(p => !enemyProjsToRemove.includes(p));
        
        // Projectiles removed above
    }

    // Player Projectiles vs Mines (optimized)
    const mineProjsToRemove: Projectile[] = [];
    const minesToRemove: Mine[] = [];
    
    state.projectiles.forEach(p => {
        if (mineProjsToRemove.includes(p)) return;
        
        const nearbyMines = spatialGrid.current.queryNearby(p);
        for (const m of nearbyMines) {
            if (!m.createdAt || minesToRemove.includes(m)) continue;
            
            if (p.x < m.x + m.width && p.x + p.width > m.x && p.y < m.y + m.height && p.y + p.height > m.y) {
                mineProjsToRemove.push(p);
                minesToRemove.push(m);
                
                // Explode mine into burst using pool
                for (let i = 0; i < 5; i++) {
                    const angle = (i * Math.PI * 2 / 5) - (Math.PI / 2);
                    const burstProj = enemyProjectilePool.current.get();
                    burstProj.id = generateId();
                    burstProj.x = m.x;
                    burstProj.y = m.y;
                    burstProj.width = 8;
                    burstProj.height = 8;
                    burstProj.attackPattern = 'STRAIGHT_DOWN';
                    burstProj.speedX = Math.cos(angle) * currentEnemyProjectileSpeed * 0.8;
                    burstProj.speedY = Math.sin(angle) * currentEnemyProjectileSpeed * 0.8;
                    state.enemyProjectiles.push(burstProj);
                }
                
                const explosion = explosionPool.current.get();
                explosion.id = generateId();
                explosion.x = m.x + m.width/2;
                explosion.y = m.y + m.height/2;
                explosion.size = 'small';
                explosion.createdAt = Date.now();
                state.explosions.push(explosion);
                break;
            }
        }
    });
    
    state.projectiles = state.projectiles.filter(p => !mineProjsToRemove.includes(p));
    state.mines = state.mines.filter(m => !minesToRemove.includes(m));
    projectilePool.current.releaseAll(mineProjsToRemove);
    
    // Enemies vs Player
    state.enemies.forEach(e => {
        if (e.x < playerHitbox.x + playerHitbox.width && e.x + e.width > playerHitbox.x && e.y < playerHitbox.y + playerHitbox.height && e.y + e.height > playerHitbox.y) {
            if (state.isPhaseShieldActive) {
                const scored = (e.isElite || e.isBig) ? 75 : 10;
                state.score += scored;
                state.enemiesDefeated++;
                state.explosions.push({ id: generateId(), x: e.x + e.width / 2, y: e.y + e.height / 2, size: e.isElite || e.isBig ? 'large' : 'small', createdAt: Date.now() });
                enemiesHitThisFrame.add(e.id);
            } else {
                takeHit();
            }
        }
    });
    // Remove enemies destroyed by shield contact in this frame
    if (enemiesHitThisFrame.size > 0) {
        state.enemies = state.enemies.filter(e => !enemiesHitThisFrame.has(e.id));
    }
    
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
        
        let availableItemTypes: ItemType[] = ['SPEED_UP', 'DIAGONAL_SHOT', 'SIDE_SHOT', 'CANCELLER_SHOT', 'RICOCHET_SHOT', 'BOMB', 'LASER_BEAM', 'PHASE_SHIELD', 'ONE_UP'];
        
        if (state.hasDiagonalShot) {
            availableItemTypes = availableItemTypes.filter(t => t !== 'DIAGONAL_SHOT');
        }
        if (state.hasSideShot) {
            availableItemTypes = availableItemTypes.filter(t => t !== 'SIDE_SHOT');
        }
        if (state.hasCancellerShot) {
            availableItemTypes = availableItemTypes.filter(t => t !== 'CANCELLER_SHOT');
        }
        // Ricochet is stackable; keep it in the pool

        if (availableItemTypes.length > 0) {
            const type = availableItemTypes[Math.floor(Math.random() * availableItemTypes.length)];
            state.items.push({
                id: generateId(),
                type,
                x: Math.random() * (GAME_WIDTH - ITEM_WIDTH),
                y: -ITEM_HEIGHT,
                width: ITEM_WIDTH,
                height: ITEM_HEIGHT,
                speedY: ENEMY_SPEED_PER_SECOND * 1.5,
            });
        }
    }

    // Force re-render for smooth gameplay
    forceUpdate(c => c + 1);
    
    gameLoopId.current = requestAnimationFrame(gameLoop);
  }, [lyrics, totalChars, totalLyricLines, endGame, superHardMode, handleSkip, playShipHitSound, playCancelSound, playBombSound, activateSpecialItem, fadeOutBgm, generateId]);
  
  // Cleanup pools on unmount
  useEffect(() => {
    return () => {
      // Clear all pools to free memory
      projectilePool.current = new ObjectPool<Projectile>(
        () => ({ id: 0, x: 0, y: 0, width: PROJECTILE_WIDTH, height: PROJECTILE_HEIGHT, speedY: 0 }),
        (obj) => { obj.id = 0; obj.x = 0; obj.y = 0; obj.width = PROJECTILE_WIDTH; obj.height = PROJECTILE_HEIGHT; obj.speedY = 0; obj.speedX = undefined; }
      );
      enemyProjectilePool.current = new ObjectPool<EnemyProjectile>(
        () => ({ id: 0, x: 0, y: 0, width: 8, height: 8, speedX: 0, speedY: 0, attackPattern: 'STRAIGHT_DOWN' }),
        (obj) => { obj.id = 0; obj.x = 0; obj.y = 0; obj.width = 8; obj.height = 8; obj.speedX = 0; obj.speedY = 0; obj.attackPattern = 'STRAIGHT_DOWN'; obj.isDelayed = false; obj.delayEndTime = undefined; }
      );
      explosionPool.current = new ObjectPool<Explosion>(
        () => ({ id: 0, x: 0, y: 0, size: 'small', createdAt: 0 }),
        (obj) => { obj.id = 0; obj.x = 0; obj.y = 0; obj.size = 'small'; obj.createdAt = 0; }
      );
    };
  }, []);

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
        if ((e.key === 'Shift' || e.code === 'Tab') && !gameStateRef.current.isGameOverDelayed) {
            e.preventDefault();
            activateSpecialItem();
        }
        // Backspace key long press for restart
        if (e.key === 'Backspace' && gameStateRef.current.backspacePressStart === 0) {
            gameStateRef.current.backspacePressStart = Date.now();
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
            gameStateRef.current.spacePressProgress = 0;
            if(gameStateRef.current.spacePressProgress < 100) {
                handleSkip();
            }
        }
        // Reset backspace press on key up
        if (e.key === 'Backspace') {
            gameStateRef.current.backspacePressStart = 0;
            gameStateRef.current.backspacePressProgress = 0;
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // ゲームループ開始（音声はユーザーインタラクション後に初期化）
    if (!loopStartedRef.current) {
        loopStartedRef.current = true;
        gameLoopId.current = requestAnimationFrame(gameLoop);
    }

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        if (gameLoopId.current) cancelAnimationFrame(gameLoopId.current);
        if (audioContextRef.current) audioContextRef.current.close();
        loopStartedRef.current = false;
    };
  }, [gameLoop, setupAudio, activateSpecialItem, handleSkip]);
  
  const { playerX, playerY, projectiles, enemies, items, isInvincible, isRespawning, stockedItem, isLaserActive, isPhaseShieldActive, stockedItemActiveUntil, laserEndTime, phaseShieldEndTime, enemyProjectiles, lives, score, enemiesDefeated, itemsCollected, explosions, mines, floatingTexts, shouldHidePlayer, currentEnemySpawnRate, showGameOverText } = gameStateRef.current;
  const isLastStand = lives === 1;

  const renderGuideLine = (start: { x: number; y: number }, end: { x: number; y: number }, key: string, thickness = 2, opacity = 0.45) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return null;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    return (
      <div
        key={key}
        style={{
          position: 'absolute',
          left: start.x,
          top: start.y,
          width: distance,
          height: thickness,
          background: `rgba(255,80,80,${opacity})`,
          transformOrigin: 'left center',
          transform: `rotate(${angle}deg)`
        }}
      />
    );
  };

  const renderNow = Date.now();
  const circleGuideElements = enemyProjectiles.flatMap((p) => {
    if (p.attackPattern !== 'CIRCLE') return [];
    const centerDefined = p.orbitCenterX !== undefined && p.orbitCenterY !== undefined && p.orbitRadius !== undefined && p.orbitAngle !== undefined;
    const results: React.ReactNode[] = [];
    if (centerDefined && (p.circleMode === 'GUIDE_ORBIT' || p.circleMode === 'ORBIT')) {
      const centerX = p.orbitCenterX!;
      const centerY = p.orbitCenterY!;
      const radius = p.orbitRadius!;
      const direction = p.orbitDirection || 1;
      const totalSegments = Math.max(12, CIRCLE_ORBIT_LOOPS * CIRCLE_GUIDE_SEGMENTS);
      const progress = p.circleMode === 'ORBIT'
        ? Math.max(0, Math.min(1, (p.orbitAccumulatedAngle || 0) / (Math.PI * 2 * CIRCLE_ORBIT_LOOPS)))
        : 0;
      const baseOpacity = p.circleMode === 'GUIDE_ORBIT' ? 0.45 : 0.45 * Math.max(0, 1 - progress);
      let prevAngle = p.orbitAngle!;
      let prevPoint = { x: centerX + Math.cos(prevAngle) * radius, y: centerY + Math.sin(prevAngle) * radius };
      for (let i = 1; i <= totalSegments; i++) {
        const angle = p.orbitAngle! + direction * (i * (2 * Math.PI / CIRCLE_GUIDE_SEGMENTS));
        const nextPoint = { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
        const seg = renderGuideLine(prevPoint, nextPoint, `circle-guide-${p.id}-${i}`, 2, baseOpacity);
        if (seg) results.push(seg);
        prevPoint = nextPoint;
      }
    }
    if (p.circleMode === 'GUIDE_DROP' || (p.circleMode === 'DROP' && p.circleGuideUntil !== undefined)) {
      const start = { x: p.x, y: p.y };
      const end = { x: p.x, y: GAME_HEIGHT };
      const fadeBase = p.circleGuideUntil !== undefined
        ? Math.max(0, Math.min(1, (p.circleGuideUntil - renderNow) / CIRCLE_GUIDE_DURATION))
        : 1;
      const opacity = (p.circleMode === 'GUIDE_DROP' ? 0.55 : 0.45) * fadeBase;
      if (opacity > 0.01) {
        const seg = renderGuideLine(start, end, `circle-drop-guide-${p.id}`, 3, opacity);
        if (seg) results.push(seg);
      }
    }
    return results;
  });

  const getStockedItemIcon = (itemType: SpecialWeapon) => {
    const props = { className: "w-10 h-10" };
    switch (itemType) {
        case 'BOMB': return <BombIcon {...props} />;
        case 'LASER_BEAM': return <LaserIcon {...props} />;
        case 'PHASE_SHIELD': return <PhaseShieldIcon {...props} />;
        default: return null;
    }
  };

  const songProgressPercentage = totalLyricLines > 0 ? (gameStateRef.current.currentLyricIndex / totalLyricLines) * 100 : 0;
  let progressColorClass = 'bg-sky-400';
  if(songProgressPercentage > 95) progressColorClass = 'bg-rose-500';
  else if (songProgressPercentage > 75) progressColorClass = 'bg-red-500';
  else if (songProgressPercentage > 50) progressColorClass = 'bg-orange-500';
  else if (songProgressPercentage > 25) progressColorClass = 'bg-yellow-400';

  const allPassiveItemIcons = useMemo(() => {
    const state = gameStateRef.current;
    
    // Diagonal Shot (unify with InfoPanel: use text-* color)
    const diagonalShotIcon = state.hasDiagonalShot ? (
      <DiagonalShotIcon key="diag" className="w-5 h-5 text-green-400"/>
    ) : (
      <DiagonalShotIcon key="diag" className="w-5 h-5 !text-gray-500 opacity-50"/>
    );
    
    // Side Shot
    const sideShotIcon = state.hasSideShot ? (
      <SideShotIcon key="side" className="w-5 h-5 text-cyan-400"/>
    ) : (
      <SideShotIcon key="side" className="w-5 h-5 !text-gray-500 opacity-50"/>
    );
    
    // Canceller Shot
    const cancellerShotIcon = state.hasCancellerShot ? (
      <CancellerShotIcon key="cancel" className="w-5 h-5 text-purple-400"/>
    ) : (
      <CancellerShotIcon key="cancel" className="w-5 h-5 !text-gray-500 opacity-50"/>
    );
    
    // Ricochet Shot (stackable) shows count like SpeedUp
    const ricochetIcon = state.ricochetStacks > 0 ? (
      <div key="rico" className="flex items-center space-x-0.5">
        <RicochetShotIcon className="w-5 h-5 text-rose-400"/>
        <span className="text-xs font-bold text-rose-400">x{state.ricochetStacks}</span>
      </div>
    ) : (
      <div key="rico" className="flex items-center space-x-0.5">
        <RicochetShotIcon className="w-5 h-5 !text-gray-500 opacity-50"/>
        <span className="text-xs font-bold text-gray-500 opacity-50">x0</span>
      </div>
    );
    
    // Speed Up
    const speedUpIcon = state.speedUpCount > 0 ? (
      <div key="speed" className="flex items-center space-x-0.5">
        <SpeedUpIcon className="w-5 h-5 text-blue-400"/>
        <span className="text-xs font-bold text-blue-400">x{state.speedUpCount}</span>
      </div>
    ) : (
      <div key="speed" className="flex items-center space-x-0.5">
        <SpeedUpIcon className="w-5 h-5 !text-gray-500 opacity-50"/>
        <span className="text-xs font-bold text-gray-500 opacity-50">x0</span>
      </div>
    );

    return [diagonalShotIcon, sideShotIcon, cancellerShotIcon, ricochetIcon, speedUpIcon];
  }, [
      gameStateRef.current.hasDiagonalShot, 
      gameStateRef.current.hasSideShot,
      gameStateRef.current.hasCancellerShot,
      gameStateRef.current.hasRicochetShot,
      gameStateRef.current.ricochetStacks,
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


  // Active item progress for circular timer around slot
  const nowTs = Date.now();
  let activeItemProgress = 0; // remaining ratio 0..1
  if (stockedItem && stockedItemActiveUntil > nowTs) {
    const total = stockedItem === 'LASER_BEAM' ? LASER_DURATION : stockedItem === 'PHASE_SHIELD' ? PHASE_SHIELD_DURATION : 0;
    if (total > 0) activeItemProgress = Math.max(0, Math.min(1, (stockedItemActiveUntil - nowTs) / total));
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
      {!isRespawning && !shouldHidePlayer && <PlayerComponent x={playerX} y={playerY} isInvincible={isInvincible} isLastStand={isLastStand} hasPhaseShield={isPhaseShieldActive} />}
      {enemies.map(e => <EnemyComponent key={e.id} enemy={e} isLastStand={isLastStand}/>)}
      {projectiles.map(p => <ProjectileComponent key={p.id} p={p} />)}
      {enemyProjectiles.map(p => <EnemyProjectileComponent key={p.id} p={p} />)}
      {circleGuideElements}
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
            {/* LIVES Display with Border */}
            <div className="inline-flex items-center w-fit p-2 bg-transparent border-2 border-slate-600 rounded-lg">
                <PlayerShipIcon className={`w-6 h-6 mr-2 ${isLastStand ? 'text-red-500' : 'text-cyan-400'}`} />
                <span className="text-white font-bold">x{lives}</span>
            </div>
            {/* Passive Items Display with Border */}
            <div className="mt-2 p-2 bg-transparent border-2 border-slate-600 rounded-lg">
                <div className="flex items-center space-x-1 h-6">
                    {allPassiveItemIcons}
                </div>
            </div>
            {/* Special Item Slot with Progress Circle */}
            <div className="mt-3 flex items-center space-x-2">
                {/* Item Slot with circular timer */}
                <div className="relative" title="Special Item (SHIFT or TAB)">
                    <div className="w-12 h-12 bg-slate-800 border-2 border-slate-600 rounded-lg flex items-center justify-center">
                        {stockedItem && (
                          <div className={stockedItemActiveUntil > nowTs ? 'opacity-50' : ''}>
                            {getStockedItemIcon(stockedItem)}
                          </div>
                        )}
                    </div>
                    {/* Progress circle overlay when active */}
                    {activeItemProgress > 0 && (
                      <div className="absolute -inset-1 pointer-events-none">
                        <ProgressCircle size={56} strokeWidth={4} progress={activeItemProgress} className="text-amber-400" trackClassName="text-slate-700" />
                      </div>
                    )}
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

      {/* Backspace Long Press Progress Bar */}
      {gameStateRef.current.backspacePressProgress > 0 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-1/2">
          <div className="text-center text-white text-sm mb-1 font-bold">
            [BACKSPACE] TO RESTART: {Math.floor(gameStateRef.current.backspacePressProgress)}%
          </div>
          <div className="relative w-full bg-slate-700 rounded-full h-3 border-2 border-slate-500 overflow-hidden">
            <div 
              className="bg-red-500 h-full rounded-full transition-all duration-100" 
              style={{ width: `${gameStateRef.current.backspacePressProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      
      {gameStateRef.current.showSkip && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center z-40">
            <div className="text-center">
                <p className="text-white text-3xl font-orbitron mb-4">SKIP INTRO</p>
                <p className="text-sky-300 text-xl font-bold">[PRESS & HOLD SPACEBAR]</p>
            </div>
             <div className="absolute bottom-1/4 w-1/2 bg-gray-600 rounded-full h-2.5">
                <div className="bg-sky-400 h-2.5 rounded-full transition-all duration-100" style={{width: `${gameStateRef.current.spacePressProgress}%`}}></div>
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
