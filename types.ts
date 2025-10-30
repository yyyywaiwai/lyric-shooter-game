export interface LyricLine {
  time: number;
  text: string;
}

export interface GameObject {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MovementPattern = 'STRAIGHT_DOWN' | 'SINE_WAVE' | 'ZIG_ZAG' | 'DRIFTING' | 'ACCELERATING';
export type ShooterAttackPattern =
  | 'HOMING'
  | 'STRAIGHT_DOWN'
  | 'DELAYED_HOMING'
  | 'SPIRAL'
  | 'BEAT'
  | 'SIDE'
  | 'DECELERATE'
  | 'CIRCLE';
export type EliteShooterType = 'MAGIC' | 'GATLING' | 'LANDMINE' | 'LASER' | 'CIRCLE';

export interface Enemy extends GameObject {
  char: string;
  speedY: number;
  movementPattern: MovementPattern;
  isShooter?: boolean;
  attackPattern?: ShooterAttackPattern;
  lastShotTime?: number;
  spiralAngle?: number; // For SPIRAL shooters

  // Elite properties
  isElite?: boolean;
  eliteType?: EliteShooterType;
  hp?: number;
  isFlashing?: boolean;
  flashEndTime?: number;
  gatlingBurstCount?: number;
  gatlingLastBurstTime?: number;
  gatlingCooldown?: boolean;

  // Laser properties
  laserState?: 'IDLE' | 'AIMING' | 'FIRING' | 'COOLDOWN';
  laserStateChangeTime?: number;
  laserTarget?: { x: number; y: number };
  
  // Super Hard Mode property
  isBig?: boolean;


  // For SINE_WAVE
  initialX?: number;
  amplitude?: number;
  frequency?: number;

  // For ZIG_ZAG & DRIFTING
  speedX?: number;

  // For ACCELERATING
  accelerationY?: number;
}

export interface Projectile extends GameObject {
  speedY: number;
  speedX?: number; // For diagonal shots and ricochet steering
  // Ricochet flags
  isRicochetPrimary?: boolean; // true for the 1st-stage red bullet
  hasBounced?: boolean; // true for the spawned ricocheted bullet
  // Ricochet chain support
  remainingBounces?: number; // how many more ricochets this projectile can spawn
  rotationDeg?: number; // visual rotation for bounced shots
}

export interface EnemyProjectile extends GameObject {
  speedX: number;
  speedY: number;
  attackPattern: ShooterAttackPattern;

  // For DELAYED_HOMING
  isDelayed?: boolean;
  delayEndTime?: number;

  // For BEAT pattern diagnostics
  beatTargetSide?: 'LEFT' | 'RIGHT';

  // For DECELERATE behavior
  initialSpeed?: number;
  slowSpeed?: number;
  decelerateInitialDistance?: number;
  directionX?: number;
  directionY?: number;

  // For CIRCLE behavior
  circleMode?: 'APPROACH' | 'GUIDE_ORBIT' | 'ORBIT' | 'GUIDE_DROP' | 'DROP';
  circleGuideUntil?: number;
  orbitCenterX?: number;
  orbitCenterY?: number;
  orbitRadius?: number;
  orbitAngle?: number;
  orbitAngularSpeed?: number;
  orbitAccumulatedAngle?: number;
  orbitDirection?: 1 | -1;
}

export interface Mine extends GameObject {
    createdAt: number;
}

export type SpecialWeapon = 'BOMB' | 'LASER_BEAM' | 'PHASE_SHIELD';
export type ItemType =
  | SpecialWeapon
  | 'SPEED_UP'
  | 'DIAGONAL_SHOT'
  | 'ONE_UP'
  | 'SIDE_SHOT'
  | 'CANCELLER_SHOT'
  | 'RICOCHET_SHOT';

export interface Item extends GameObject {
    type: ItemType;
    speedY: number;
}

export interface Explosion {
    id: number;
    x: number;
    y: number;
    size: 'small' | 'large';
    createdAt: number;
}

export interface FloatingText {
    id: number;
    x: number;
    y: number;
    text: string;
    createdAt: number;
}

export type GameStatus = 'loading' | 'ready' | 'playing' | 'gameOver' | 'cleared';

export interface GameStats {
  score: number;
  enemiesDefeated: number;
  totalEnemies: number;
  itemsCollected: Partial<Record<ItemType, number>>;
  songProgressPercentage: number;
}

export interface SongMetadata {
  title: string;
  picture?: string; // base64 data URL
}
