
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LyricLine, Enemy, Projectile, Item, ItemType, SpecialWeapon, EnemyProjectile, Explosion, GameStats, EliteShooterType, Mine, FloatingText } from '@/types';
import { BombIcon, SpeedUpIcon, DiagonalShotIcon, LaserIcon, OneUpIcon, PlayerShipIcon, SideShotIcon, CancellerShotIcon, RicochetShotIcon, PhaseShieldIcon } from './icons';
import ProgressCircle from './ProgressCircle';
import GameConstants from '@/services/gameConstants';
import EnemyManager from '@/services/enemyManager';
import ProjectileManager from '@/services/projectileManager';
import ItemManager from '@/services/itemManager';
import { filterInPlace } from '@/services/collectionUtils';

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
const GRID_MARK_PROP = '__gridMark' as const;

class SpatialGrid {
  private cellSize: number;
  private cols: number;
  private rows: number;
  private grid: Set<any>[][];
  private queryToken = 0;

  constructor(width: number, height: number, cellSize = 64) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.grid = [];
    for (let row = 0; row < this.rows; row++) {
      const rowSets: Set<any>[] = [];
      for (let col = 0; col < this.cols; col++) {
        rowSets[col] = new Set();
      }
      this.grid[row] = rowSets;
    }
  }

  clear(): void {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        this.grid[row][col].clear();
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

  queryNearby(obj: any, result: any[] = []): any[] {
    const token = ++this.queryToken;
    result.length = 0;
    const minCol = Math.max(0, Math.floor((obj.x - this.cellSize) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((obj.x + obj.width + this.cellSize) / this.cellSize));
    const minRow = Math.max(0, Math.floor((obj.y - this.cellSize) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((obj.y + obj.height + this.cellSize) / this.cellSize));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cell = this.grid[row][col];
        for (const item of cell) {
          if ((item as any)[GRID_MARK_PROP] === token) continue;
          (item as any)[GRID_MARK_PROP] = token;
          result.push(item);
        }
      }
    }
    return result;
  }
}

// Utility to mutate arrays in place without allocating new ones every frame.
function filterInPlace<T>(array: T[], predicate: (value: T, index: number) => boolean, onRemove?: (value: T) => void): void {
  let writeIndex = 0;
  for (let i = 0; i < array.length; i++) {
    const value = array[i];
    if (predicate(value, i)) {
      array[writeIndex++] = value;
    } else if (onRemove) {
      onRemove(value);
    }
  }
  array.length = writeIndex;
}

const {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_SPEED_PER_SECOND,
  PROJECTILE_WIDTH,
  PROJECTILE_HEIGHT,
  ENEMY_HEIGHT,
  ENEMY_PROJECTILE_SPEED_PER_SECOND,
  INITIAL_ENEMY_FIRE_CHANCE,
  FIRE_COOLDOWN,
  ITEM_SPAWN_PERCENTAGE,
  INITIAL_LIVES,
  RESPAWN_DURATION,
  INVINCIBILITY_DURATION,
  CANCELLER_INVINCIBILITY_DURATION,
  LASER_DURATION,
  EXPLOSION_DURATION,
  BGM_VOLUME,
  DUCKED_BGM_VOLUME,
  SKIP_LONG_PRESS_DURATION,
  MINE_LIFETIME,
  FLOATING_TEXT_DURATION,
  PHASE_SHIELD_DURATION,
  CIRCLE_ORBIT_LOOPS,
  CIRCLE_GUIDE_DURATION,
  CIRCLE_GUIDE_SEGMENTS,
  MAX_SPAWNS_PER_FRAME,
} = GameConstants.getInstance();

interface GameScreenProps {
  audioUrl: string;
  lyrics: LyricLine[];
  onEndGame: (stats: GameStats, status: 'cleared' | 'gameOver') => void;
  superHardMode?: boolean;
  initialItem?: ItemType;
}

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
const EnemyComponent = ({ enemy, isLastStand }: { enemy: Enemy; isLastStand: boolean; }) => {
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
};

const ProjectileComponent = ({ p }: { p: Projectile }) => {
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
};

const EnemyProjectileComponent = ({ p }: { p: EnemyProjectile }) => {
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
};

const MineComponent = ({ mine }: { mine: Mine }) => (
    <div
        style={{ transform: `translate3d(${mine.x}px, ${mine.y}px, 0)`, width: mine.width, height: mine.height }}
        className="absolute bg-red-800 border-2 border-red-500 rounded-full animate-pulse"
    ></div>
);

const LaserBeamComponent = ({ x, y }: { x: number, y:number }) => (
    <div
        style={{ transform: `translate3d(${x + PLAYER_WIDTH / 2 - 5}px, 0, 0)`, width: 10, height: y }}
        className="absolute bg-gradient-to-t from-red-400 to-orange-300 rounded-t-full animate-pulse"
    ></div>
);

const ItemComponent = ({ item }: { item: Item }) => {
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
};

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

const ExplosionComponent = ({ explosion }: { explosion: Explosion }) => {
    const sizeClass = explosion.size === 'large' ? 'w-32 h-32' : 'w-16 h-16';
    const colorClass = explosion.size === 'large' ? 'bg-orange-400' : 'bg-yellow-300';
    return (
        <div
            style={{ left: explosion.x, top: explosion.y, transform: 'translate(-50%, -50%)' }}
            className={`explosion ${sizeClass} ${colorClass}`}
        ></div>
    );
};

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
  const enemyManager = useMemo(() => EnemyManager.getInstance(), []);
  const projectileManager = useMemo(() => ProjectileManager.getInstance(), []);
  const itemManager = useMemo(() => ItemManager.getInstance(), []);

  // Unique ID generator for projectiles
  const nextId = useRef(1);
  const generateId = useCallback(() => {
    return nextId.current++;
  }, []);

  // Object pools for performance
  const projectilePool = useRef(new ObjectPool<Projectile>(
    () => ({ id: 0, x: 0, y: 0, width: PROJECTILE_WIDTH, height: PROJECTILE_HEIGHT, speedY: 0, speedX: 0, entityType: 'playerProjectile' }),
    (obj) => {
      obj.id = 0;
      obj.x = 0;
      obj.y = 0;
      obj.width = PROJECTILE_WIDTH;
      obj.height = PROJECTILE_HEIGHT;
      obj.speedY = 0;
      obj.speedX = 0;
      obj.entityType = 'playerProjectile';
      obj.isRicochetPrimary = undefined;
      obj.hasBounced = undefined;
      obj.remainingBounces = undefined;
      obj.rotationDeg = undefined;
    }
  ));
  
  const enemyProjectilePool = useRef(new ObjectPool<EnemyProjectile>(
    () => ({ id: 0, x: 0, y: 0, width: 8, height: 8, speedX: 0, speedY: 0, attackPattern: 'STRAIGHT_DOWN', entityType: 'enemyProjectile' }),
    (obj) => {
      obj.id = 0;
      obj.x = 0;
      obj.y = 0;
      obj.width = 8;
      obj.height = 8;
      obj.speedX = 0;
      obj.speedY = 0;
      obj.entityType = 'enemyProjectile';
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
      fps: 0,
      pendingSpawns: [] as { time: number; char: string; progress: number }[],
      pendingSpawnCursor: 0,
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
  const fpsStatsRef = useRef({ frames: 0, lastTime: performance.now(), fps: 0 });
  const collisionBuffersRef = useRef({
    enemies: [] as Enemy[],
    enemyProjectiles: [] as EnemyProjectile[],
    mines: [] as Mine[],
  });
  
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

  enemyManager.initialize({
    state: gameStateRef.current,
    generateId,
    superHardMode,
    enemyProjectilePool: enemyProjectilePool.current,
    explosionPool: explosionPool.current,
  });
  projectileManager.initialize({
    state: gameStateRef.current,
    generateId,
    projectilePool: projectilePool.current,
    enemyProjectilePool: enemyProjectilePool.current,
    explosionPool: explosionPool.current,
    enemyManager,
    playCancelSound,
  });
  itemManager.initialize({
    state: gameStateRef.current,
    generateId,
    playCancelSound,
    superHardMode,
  });

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
          if (onScreenEnemyIds.size > 0) {
            filterInPlace(state.enemies, (enemy) => !onScreenEnemyIds.has(enemy.id));
          }
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

    // --- FPS Tracking ---
    const fpsStats = fpsStatsRef.current;
    fpsStats.frames++;
    const elapsedSinceSample = now - fpsStats.lastTime;
    if (elapsedSinceSample >= 500) {
      const measuredFps = (fpsStats.frames * 1000) / elapsedSinceSample;
      fpsStats.fps = measuredFps;
      fpsStats.frames = 0;
      fpsStats.lastTime = now;
      state.fps = Math.round(measuredFps);
    }

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

    // --- Process Pending Enemy Spawns ---
    enemyManager.processPendingSpawns(MAX_SPAWNS_PER_FRAME);

    // --- Update Enemy Spawn Rate (every 1 second) ---
    enemyManager.updateSpawnRate(Date.now());
    
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
    projectileManager.handlePlayerFire({
      now: Date.now(),
      isLastStand,
      keysPressed: keysPressed.current,
      lastFireTime,
      spacebarPressStart: spacebarPressStart.current,
      player: { x: state.playerX, y: state.playerY, width: PLAYER_WIDTH, height: PLAYER_HEIGHT },
      isRespawning: state.isRespawning,
      isGameOverDelayed: state.isGameOverDelayed,
      isLaserActive: state.isLaserActive,
      showSkip: state.showSkip,
      fireCooldown: FIRE_COOLDOWN,
    });

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
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.isFlashing && currentTime > e.flashEndTime!) e.isFlashing = false;
    }
    filterInPlace(state.mines, (m) => currentTime - m.createdAt < MINE_LIFETIME);
    filterInPlace(state.floatingTexts, (ft) => currentTime - ft.createdAt < FLOATING_TEXT_DURATION);

    // Clean up expired explosions and return to pool
    filterInPlace(state.explosions, (ex) => {
      const keep = currentTime - ex.createdAt <= EXPLOSION_DURATION;
      if (!keep) {
        explosionPool.current.release(ex);
      }
      return keep;
    });

    // --- Object Movement (Optimized) ---
    
    projectileManager.updatePlayerProjectiles(dt);

    const currentEnemyProjectileSpeed = ENEMY_PROJECTILE_SPEED_PER_SECOND * state.enemyProjectileSpeedMultiplier;
    // Update enemy projectiles
    const playerCenterX = state.playerX + PLAYER_WIDTH / 2;
    const playerCenterY = state.playerY + PLAYER_HEIGHT / 2;

    projectileManager.updateEnemyProjectiles({
      dt,
      currentTime,
      projectileSpeed: currentEnemyProjectileSpeed,
      playerCenterX,
      playerCenterY,
    });

    // Update items and enemies without reallocating arrays
    itemManager.updateItems(dt);

    enemyManager.updateEnemies(dt);
    enemyManager.updateEliteStates(currentTime);
    enemyManager.handleFiring(currentTime, currentEnemyProjectileSpeed, {
      x: state.playerX,
      y: state.playerY,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
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
        const spawnInterval = 100 / Math.max(1, line.length);
        enemyManager.triggerBeatShooters(currentTime, playerCenterX, playerCenterY);

        const progress = totalLyricLines > 0 ? (state.currentLyricIndex / totalLyricLines) : 0;
        const startTime = Date.now();
        for (let idx = 0; idx < line.length; idx++) {
          state.pendingSpawns.push({ time: startTime + idx * spawnInterval, char: line[idx], progress });
        }

        state.totalEnemiesSpawned += line.length;
        if (state.gameStartTime === 0) {
          state.gameStartTime = Date.now();
        }
        state.currentLyricIndex++;
      }
    }
    
    // --- Optimized Collision Detection with Spatial Grid ---
    spatialGrid.current.clear();
    
    // Insert all objects into spatial grid
    const enemiesArray = state.enemies;
    for (let i = 0; i < enemiesArray.length; i++) {
      spatialGrid.current.insert(enemiesArray[i]);
    }
    const projectilesArray = state.projectiles;
    for (let i = 0; i < projectilesArray.length; i++) {
      spatialGrid.current.insert(projectilesArray[i]);
    }
    const enemyProjectilesArray = state.enemyProjectiles;
    for (let i = 0; i < enemyProjectilesArray.length; i++) {
      spatialGrid.current.insert(enemyProjectilesArray[i]);
    }
    const itemsArray = state.items;
    for (let i = 0; i < itemsArray.length; i++) {
      spatialGrid.current.insert(itemsArray[i]);
    }
    const minesArray = state.mines;
    for (let i = 0; i < minesArray.length; i++) {
      spatialGrid.current.insert(minesArray[i]);
    }
    
    const takeHit = () => {
      if (state.isInvincible || state.isRespawning || state.isGameEnding || state.isGameOverDelayed) return;

      let cancellerNullified = false;
      const cancellerChance = isLastStand ? 0.35 : 0.15;
      if (state.hasCancellerShot && Math.random() < cancellerChance) {
        cancellerNullified = true;
        playCancelSound();
        state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: 'GUARD!', createdAt: Date.now() });
        state.isInvincible = true;
        state.invincibilityEndTime = Date.now() + CANCELLER_INVINCIBILITY_DURATION;
      }

      if (cancellerNullified) return;

      state.lives--;
      playShipHitSound();
      const playerExplosion = explosionPool.current.get();
      playerExplosion.id = generateId();
      playerExplosion.x = state.playerX + PLAYER_WIDTH / 2;
      playerExplosion.y = state.playerY + PLAYER_HEIGHT / 2;
      playerExplosion.size = 'large';
      playerExplosion.createdAt = Date.now();
      state.explosions.push(playerExplosion);

      playBombSound();
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
      if (onScreenEnemyIds.size > 0) {
        filterInPlace(state.enemies, enemy => !onScreenEnemyIds.has(enemy.id));
      }

      if (state.lives === 1 && !state.stockedItem) {
        state.stockedItem = Math.random() > 0.5 ? 'BOMB' : 'LASER_BEAM';
        state.floatingTexts.push({ id: generateId(), x: state.playerX, y: state.playerY, text: 'LAST STAND!', createdAt: Date.now() });
      }

      if (state.lives <= 0) {
        state.isGameOverDelayed = true;
        state.gameOverDelayEndTime = Date.now() + 5000;
        state.shouldHidePlayer = true;
        state.showGameOverText = true;
        fadeOutBgm(4);
      } else {
        state.isRespawning = true;
        state.respawnEndTime = Date.now() + RESPAWN_DURATION;
      }
    };

    // Optimized Projectiles vs Enemies collision
    projectileManager.resolveCollisions({
      isLastStand,
      enemyProjectileSpeed: currentEnemyProjectileSpeed,
      currentTime,
      player: { x: state.playerX, y: state.playerY, width: PLAYER_WIDTH, height: PLAYER_HEIGHT },
      spatialGrid: spatialGrid.current,
      collisionBuffers: collisionBuffersRef.current,
      playerHitCallback: takeHit,
      hasLaser: state.enemies.some(e => e.eliteType === 'LASER'),
      laserActive: state.isLaserActive,
      generateId,
    });

    // Items vs Player
    itemManager.collectItems({ x: state.playerX, y: state.playerY, width: PLAYER_WIDTH, height: PLAYER_HEIGHT });

    // Item Spawning
    itemManager.spawnItems(itemSpawnMilestone, totalChars);


    // Force re-render for smooth gameplay
    forceUpdate(c => c + 1);
    
    gameLoopId.current = requestAnimationFrame(gameLoop);
  }, [lyrics, totalChars, totalLyricLines, endGame, superHardMode, handleSkip, playShipHitSound, playCancelSound, playBombSound, activateSpecialItem, fadeOutBgm, generateId]);
  
  // Cleanup pools on unmount
  useEffect(() => {
    return () => {
      // Clear all pools to free memory
      projectilePool.current = new ObjectPool<Projectile>(
        () => ({ id: 0, x: 0, y: 0, width: PROJECTILE_WIDTH, height: PROJECTILE_HEIGHT, speedY: 0, entityType: 'playerProjectile' }),
        (obj) => { obj.id = 0; obj.x = 0; obj.y = 0; obj.width = PROJECTILE_WIDTH; obj.height = PROJECTILE_HEIGHT; obj.speedY = 0; obj.speedX = undefined; obj.entityType = 'playerProjectile'; }
      );
      enemyProjectilePool.current = new ObjectPool<EnemyProjectile>(
        () => ({ id: 0, x: 0, y: 0, width: 8, height: 8, speedX: 0, speedY: 0, attackPattern: 'STRAIGHT_DOWN', entityType: 'enemyProjectile' }),
        (obj) => { obj.id = 0; obj.x = 0; obj.y = 0; obj.width = 8; obj.height = 8; obj.speedX = 0; obj.speedY = 0; obj.entityType = 'enemyProjectile'; obj.attackPattern = 'STRAIGHT_DOWN'; obj.isDelayed = false; obj.delayEndTime = undefined; }
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
        
        if ((e.key === ' ' || e.code === 'Spacebar' || e.code === 'Space') && gameStateRef.current.showSkip && spacebarPressStart.current === 0) {
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
        if ((e.key === ' ' || e.code === 'Spacebar' || e.code === 'Space') && gameStateRef.current.showSkip) {
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
  
  const { playerX, playerY, projectiles, enemies, items, isInvincible, isRespawning, stockedItem, isLaserActive, isPhaseShieldActive, stockedItemActiveUntil, laserEndTime, phaseShieldEndTime, enemyProjectiles, lives, score, enemiesDefeated, itemsCollected, explosions, mines, floatingTexts, shouldHidePlayer, currentEnemySpawnRate, showGameOverText, fps } = gameStateRef.current;
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
  const circleGuideElements: React.ReactNode[] = [];
  for (let i = 0; i < enemyProjectiles.length; i++) {
    const p = enemyProjectiles[i];
    if (p.attackPattern !== 'CIRCLE') continue;
    const centerDefined = p.orbitCenterX !== undefined && p.orbitCenterY !== undefined && p.orbitRadius !== undefined && p.orbitAngle !== undefined;
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
      let prevX = centerX + Math.cos(prevAngle) * radius;
      let prevY = centerY + Math.sin(prevAngle) * radius;
      const angleStep = direction * ((Math.PI * 2 * CIRCLE_ORBIT_LOOPS) / totalSegments);
      for (let segIndex = 1; segIndex <= totalSegments; segIndex++) {
        const angle = p.orbitAngle! + angleStep * segIndex;
        const nextX = centerX + Math.cos(angle) * radius;
        const nextY = centerY + Math.sin(angle) * radius;
        const seg = renderGuideLine({ x: prevX, y: prevY }, { x: nextX, y: nextY }, `circle-guide-${p.id}-${segIndex}`, 2, baseOpacity);
        if (seg) circleGuideElements.push(seg);
        prevX = nextX;
        prevY = nextY;
      }
    }
    if (p.circleMode === 'GUIDE_DROP' || (p.circleMode === 'DROP' && p.circleGuideUntil !== undefined)) {
      const fadeBase = p.circleGuideUntil !== undefined
        ? Math.max(0, Math.min(1, (p.circleGuideUntil - renderNow) / CIRCLE_GUIDE_DURATION))
        : 1;
      const opacity = (p.circleMode === 'GUIDE_DROP' ? 0.55 : 0.45) * fadeBase;
      if (opacity > 0.01) {
        const seg = renderGuideLine({ x: p.x, y: p.y }, { x: p.x, y: GAME_HEIGHT }, `circle-drop-guide-${p.id}`, 3, opacity);
        if (seg) circleGuideElements.push(seg);
      }
    }
  }

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

      <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black bg-opacity-60 text-lime-300 text-xs font-mono z-40">
        FPS {fps > 0 ? fps : '--'}
      </div>
      
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
