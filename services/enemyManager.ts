import GameConstants from '@/services/gameConstants';
import { filterInPlace } from '@/services/collectionUtils';
import {
  Enemy,
  ShooterAttackPattern,
  EliteShooterType,
  EnemyProjectile,
  Explosion,
  Mine,
  GameState,
  PlayerSnapshot,
} from '@/types';

interface Pool<T> {
  get(): T;
  release(obj: T): void;
}

interface EnemyManagerContext {
  state: GameState;
  generateId: () => number;
  superHardMode: boolean;
  enemyProjectilePool: Pool<EnemyProjectile>;
  explosionPool: Pool<Explosion>;
}

class EnemyManager {
  private static instance: EnemyManager;

  private readonly constants = GameConstants.getInstance();
  private state!: GameState;
  private generateId!: () => number;
  private superHardMode = false;
  private enemyProjectilePool!: Pool<EnemyProjectile>;
  private explosionPool!: Pool<Explosion>;

  private constructor() {}

  static getInstance(): EnemyManager {
    if (!EnemyManager.instance) {
      EnemyManager.instance = new EnemyManager();
    }
    return EnemyManager.instance;
  }

  initialize(context: EnemyManagerContext): void {
    this.state = context.state;
    this.generateId = context.generateId;
    this.superHardMode = context.superHardMode;
    this.enemyProjectilePool = context.enemyProjectilePool;
    this.explosionPool = context.explosionPool;
  }

  spawnFromChar(char: string, progress: number): void {
    const {
      MOVEMENT_PATTERNS,
      NORMAL_SHOOTER_PATTERNS,
      LEGACY_SHOOTER_PATTERNS,
      ELITE_TYPES,
      GAME_WIDTH,
      ENEMY_WIDTH,
      ENEMY_HEIGHT,
      ENEMY_SPEED_PER_SECOND,
      ENEMY_ACCELERATION_PER_SECOND_SQUARED,
    } = this.constants;

    const movementPattern = MOVEMENT_PATTERNS[Math.floor(Math.random() * MOVEMENT_PATTERNS.length)];

    let shooterChance = this.state.baseShooterChance;
    if (progress > 0.75) shooterChance += 0.15;
    else if (progress > 0.50) shooterChance += 0.10;
    else if (progress > 0.25) shooterChance += 0.05;

    let attackPattern: ShooterAttackPattern | undefined;
    const isShooter = Math.random() < shooterChance;
    if (isShooter) {
      attackPattern = NORMAL_SHOOTER_PATTERNS[Math.floor(Math.random() * NORMAL_SHOOTER_PATTERNS.length)];
    }

    let isElite = false;
    let eliteType: EliteShooterType | undefined;
    const eliteShooterProgressThreshold = this.superHardMode ? 0 : 0.5;
    const eliteShooterChance = this.superHardMode ? 0.20 : 0.15;

    if (isShooter && progress >= eliteShooterProgressThreshold && Math.random() < eliteShooterChance) {
      isElite = true;
      eliteType = ELITE_TYPES[Math.floor(Math.random() * ELITE_TYPES.length)];
      attackPattern = LEGACY_SHOOTER_PATTERNS[Math.floor(Math.random() * LEGACY_SHOOTER_PATTERNS.length)];
      if (eliteType === 'CIRCLE') {
        attackPattern = 'CIRCLE';
      }
    }

    const enemy: Enemy = {
      id: this.generateId(),
      char,
      x: Math.random() * (GAME_WIDTH - ENEMY_WIDTH),
      y: -ENEMY_HEIGHT,
      width: ENEMY_WIDTH,
      height: ENEMY_HEIGHT,
      entityType: 'enemy',
      speedY: ENEMY_SPEED_PER_SECOND,
      movementPattern,
      isShooter,
      attackPattern: isShooter ? attackPattern : undefined,
      isElite,
      eliteType,
      hp: isElite ? 3 : 1,
      isFlashing: false,
      isBig: this.superHardMode && this.state.isMidGameBuffActive && !isElite && isShooter,
    };

    if (enemy.isBig) enemy.hp = 3;

    switch (movementPattern) {
      case 'SINE_WAVE':
        enemy.initialX = enemy.x;
        enemy.amplitude = 50 + Math.random() * 100;
        enemy.frequency = (0.005 + Math.random() * 0.005) * (Math.random() > 0.5 ? 1 : -1);
        break;
      case 'ZIG_ZAG': {
        const lateralSpeed = (60 + Math.random() * 60) * (Math.random() > 0.5 ? 1 : -1);
        enemy.speedX = lateralSpeed;
        break;
      }
      case 'DRIFTING':
        enemy.speedX = (30 + Math.random() * 30) * (Math.random() > 0.5 ? 1 : -1);
        break;
      case 'ACCELERATING':
        enemy.accelerationY = ENEMY_ACCELERATION_PER_SECOND_SQUARED;
        break;
    }

    if (enemy.isElite) {
      enemy.width *= 1.5;
      enemy.height *= 1.5;
      if (enemy.eliteType === 'LASER') {
        enemy.laserState = 'IDLE';
      }
    }
    if (enemy.isBig) {
      enemy.width *= 1.3;
      enemy.height *= 1.3;
    }

    this.state.enemies.push(enemy);
  }

  processPendingSpawns(maxPerFrame: number): void {
    if (this.state.pendingSpawnCursor >= this.state.pendingSpawns.length) return;
    const now = Date.now();
    let processed = 0;
    while (
      this.state.pendingSpawnCursor < this.state.pendingSpawns.length &&
      this.state.pendingSpawns[this.state.pendingSpawnCursor].time <= now &&
      processed < maxPerFrame
    ) {
      const task = this.state.pendingSpawns[this.state.pendingSpawnCursor];
      this.spawnFromChar(task.char, task.progress);
      this.state.pendingSpawnCursor++;
      processed++;
    }

    if (
      this.state.pendingSpawnCursor > 0 &&
      (this.state.pendingSpawnCursor > 32 || this.state.pendingSpawnCursor > this.state.pendingSpawns.length / 2)
    ) {
      this.state.pendingSpawns.splice(0, this.state.pendingSpawnCursor);
      this.state.pendingSpawnCursor = 0;
    }
  }

  updateSpawnRate(currentTime: number): void {
    if (currentTime - this.state.lastSpawnRateUpdate < 1000) return;
    if (this.state.gameStartTime > 0) {
      const elapsedTimeSeconds = (currentTime - this.state.gameStartTime) / 1000;
      this.state.currentEnemySpawnRate = elapsedTimeSeconds > 0 ? this.state.totalEnemiesSpawned / elapsedTimeSeconds : 0;
    }
    this.state.lastSpawnRateUpdate = currentTime;
  }

  updateEnemies(dt: number): void {
    const { GAME_WIDTH, GAME_HEIGHT } = this.constants;

    filterInPlace(this.state.enemies, (enemy) => {
      let newX = enemy.x;
      let newY = enemy.y;
      let newSpeedY = enemy.speedY;
      let newSpeedX = enemy.speedX ?? 0;

      if (enemy.movementPattern === 'ACCELERATING' && enemy.accelerationY) {
        newSpeedY += enemy.accelerationY * dt;
      }

      newY += newSpeedY * dt;

      switch (enemy.movementPattern) {
        case 'SINE_WAVE':
          if (enemy.initialX !== undefined && enemy.frequency !== undefined && enemy.amplitude !== undefined) {
            newX = enemy.initialX + Math.sin(newY * enemy.frequency) * enemy.amplitude;
          }
          break;
        case 'ZIG_ZAG': {
          const currentSpeedX = enemy.speedX ?? 0;
          if (newX + currentSpeedX * dt <= 0 || newX + currentSpeedX * dt >= GAME_WIDTH - enemy.width) {
            newSpeedX = -currentSpeedX;
          } else {
            newSpeedX = currentSpeedX;
          }
          newX += newSpeedX * dt;
          break;
        }
        case 'DRIFTING':
          newX += (enemy.speedX ?? 0) * dt;
          break;
      }

      newX = Math.max(0, Math.min(GAME_WIDTH - enemy.width, newX));

      enemy.x = newX;
      enemy.y = newY;
      enemy.speedY = newSpeedY;
      if (enemy.movementPattern === 'ZIG_ZAG' || enemy.movementPattern === 'DRIFTING') {
        enemy.speedX = newSpeedX;
      }

      return enemy.y < GAME_HEIGHT;
    });
  }

  updateEliteStates(currentTime: number): void {
    for (let i = 0; i < this.state.enemies.length; i++) {
      const enemy = this.state.enemies[i];
      if (enemy.eliteType === 'LASER') {
        switch (enemy.laserState) {
          case 'AIMING':
            if (currentTime > (enemy.laserStateChangeTime ?? 0) + 1000) {
              enemy.laserState = 'FIRING';
              enemy.laserStateChangeTime = currentTime;
            }
            break;
          case 'FIRING':
            if (currentTime > (enemy.laserStateChangeTime ?? 0) + 300) {
              enemy.laserState = 'COOLDOWN';
              enemy.laserStateChangeTime = currentTime;
            }
            break;
          case 'COOLDOWN':
            if (currentTime > (enemy.laserStateChangeTime ?? 0) + 2000) {
              enemy.laserState = 'IDLE';
            }
            break;
          default:
            break;
        }
      }
    }
  }

  handleFiring(currentTime: number, projectileSpeed: number, player: PlayerSnapshot): void {
    const { ENEMY_FIRE_COOLDOWN, CIRCLE_ORBIT_ANGULAR_SPEED, MINE_WIDTH, MINE_HEIGHT } = this.constants;
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;

    for (let index = 0; index < this.state.enemies.length; index++) {
      const enemy = this.state.enemies[index];
      if (!enemy.isShooter) continue;
      if (enemy.attackPattern === 'BEAT') continue;

      if (enemy.gatlingCooldownUntil && currentTime >= enemy.gatlingCooldownUntil) {
        enemy.gatlingCooldownUntil = undefined;
      }

      const cooldown = enemy.isElite && enemy.eliteType === 'MAGIC' ? ENEMY_FIRE_COOLDOWN / 3.5 : ENEMY_FIRE_COOLDOWN;
      const gatlingOnCooldown = enemy.gatlingCooldownUntil !== undefined && currentTime < enemy.gatlingCooldownUntil;
      if (currentTime - (enemy.lastShotTime || 0) <= cooldown || gatlingOnCooldown) continue;

      const projectileBase = {
        x: enemy.x + enemy.width / 2,
        y: enemy.y + enemy.height,
        width: 8,
        height: 8,
      };

      if (enemy.isElite) {
        switch (enemy.eliteType) {
          case 'LASER':
            if (enemy.laserState === 'IDLE') {
              enemy.laserState = 'AIMING';
              enemy.laserStateChangeTime = currentTime;
              enemy.laserTarget = { x: playerCenterX, y: playerCenterY };
              enemy.lastShotTime = currentTime;
            }
            break;
          case 'CIRCLE': {
            enemy.lastShotTime = currentTime;
            enemy.attackPattern = 'CIRCLE';
            const proj = this.enemyProjectilePool.get();
            proj.id = this.generateId();
            proj.x = projectileBase.x;
            proj.y = projectileBase.y;
            proj.width = projectileBase.width;
            proj.height = projectileBase.height;
            proj.attackPattern = 'CIRCLE';
            const angle = Math.atan2(playerCenterY - projectileBase.y, playerCenterX - projectileBase.x);
            const approachSpeed = projectileSpeed;
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
            this.state.enemyProjectiles.push(proj);
            break;
          }
          case 'LANDMINE':
            enemy.lastShotTime = currentTime;
            this.state.mines.push({
              id: this.generateId(),
              x: projectileBase.x,
              y: projectileBase.y,
              width: MINE_WIDTH,
              height: MINE_HEIGHT,
              entityType: 'mine',
              createdAt: currentTime,
            });
            break;
          case 'MAGIC': {
            enemy.lastShotTime = currentTime;
            const patterns: ShooterAttackPattern[] = ['HOMING', 'STRAIGHT_DOWN', 'DELAYED_HOMING', 'SPIRAL'];
            enemy.attackPattern = patterns[Math.floor(Math.random() * patterns.length)];
            // fall through to fire immediately
          }
          // eslint-disable-next-line no-fallthrough
          case 'GATLING': {
            enemy.lastShotTime = currentTime;
            let patternToFire = enemy.attackPattern!;
            if (enemy.eliteType === 'GATLING') {
              patternToFire = 'STRAIGHT_DOWN';
              enemy.gatlingBurstCount = 5;
              enemy.gatlingLastBurstTime = currentTime;
              enemy.gatlingCooldownUntil = undefined;
            }
            this.fireProjectileByPattern(
              enemy,
              patternToFire,
              projectileBase,
              projectileSpeed,
              playerCenterX,
              playerCenterY,
              currentTime
            );
            break;
          }
          default:
            break;
        }
      } else {
        enemy.lastShotTime = currentTime;
        this.fireProjectileByPattern(
          enemy,
          enemy.attackPattern!,
          projectileBase,
          projectileSpeed,
          playerCenterX,
          playerCenterY,
          currentTime
        );
      }
    }

    this.handleGatlingBursts(currentTime, projectileSpeed);
  }

  triggerBeatShooters(triggerTime: number, playerCenterX: number, playerCenterY: number): void {
    const {
      BEAT_SPEED_MIN_INTERVAL,
      BEAT_SPEED_MAX_INTERVAL,
      BEAT_MAX_SPEED_MULTIPLIER,
      BEAT_TARGET_OFFSET,
      ENEMY_PROJECTILE_SPEED_PER_SECOND,
    } = this.constants;
    const baseSpeed = ENEMY_PROJECTILE_SPEED_PER_SECOND * this.state.enemyProjectileSpeedMultiplier;

    for (let i = 0; i < this.state.enemies.length; i++) {
      const enemy = this.state.enemies[i];
      if (!enemy.isShooter || enemy.attackPattern !== 'BEAT') continue;
      if (enemy.y + enemy.height < 0) continue;

      const enemyCenterX = enemy.x + enemy.width / 2;
      const enemyMuzzleY = enemy.y + enemy.height;
      const lastShot = enemy.lastShotTime ?? triggerTime - BEAT_SPEED_MIN_INTERVAL;
      const interval = Math.max(0, triggerTime - lastShot);
      const clampedInterval = Math.min(BEAT_SPEED_MAX_INTERVAL, Math.max(BEAT_SPEED_MIN_INTERVAL, interval));
      const t = (clampedInterval - BEAT_SPEED_MIN_INTERVAL) / (BEAT_SPEED_MAX_INTERVAL - BEAT_SPEED_MIN_INTERVAL);
      const speedMultiplier = 1 + t * (BEAT_MAX_SPEED_MULTIPLIER - 1);
      const projectileSpeed = baseSpeed * speedMultiplier;

      for (let offsetIndex = 0; offsetIndex < 2; offsetIndex++) {
        const offset = offsetIndex === 0 ? -BEAT_TARGET_OFFSET : BEAT_TARGET_OFFSET;
        const targetX = playerCenterX + offset;
        const targetY = playerCenterY;
        const dx = targetX - enemyCenterX;
        const dy = targetY - enemyMuzzleY;
        const distance = Math.hypot(dx, dy) || 1;
        const proj = this.enemyProjectilePool.get();
        proj.id = this.generateId();
        proj.x = enemyCenterX;
        proj.y = enemyMuzzleY;
        proj.width = 8;
        proj.height = 8;
        proj.attackPattern = 'BEAT';
        proj.speedX = (dx / distance) * projectileSpeed;
        proj.speedY = (dy / distance) * projectileSpeed;
        proj.beatTargetSide = offset < 0 ? 'LEFT' : 'RIGHT';
        this.state.enemyProjectiles.push(proj);
      }
      enemy.lastShotTime = triggerTime;
    }
  }

  findNearestEnemy(x: number, y: number, excludeId?: number): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < this.state.enemies.length; i++) {
      const enemy = this.state.enemies[i];
      if (!enemy || enemy.id === excludeId) continue;
      const cx = enemy.x + enemy.width / 2;
      const cy = enemy.y + enemy.height / 2;
      const dx = cx - x;
      const dy = cy - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        best = enemy;
      }
    }
    return best;
  }

  private fireProjectileByPattern(
    enemy: Enemy,
    pattern: ShooterAttackPattern,
    base: { x: number; y: number; width: number; height: number },
    projectileSpeed: number,
    playerCenterX: number,
    playerCenterY: number,
    currentTime: number
  ): void {
    const { CIRCLE_ORBIT_ANGULAR_SPEED, DECELERATE_INITIAL_MULTIPLIER, DECELERATE_FINAL_MULTIPLIER } = this.constants;
    const common = () => {
      const proj = this.enemyProjectilePool.get();
      proj.id = this.generateId();
      proj.x = base.x;
      proj.y = base.y;
      proj.width = base.width;
      proj.height = base.height;
      return proj;
    };

    switch (pattern) {
      case 'HOMING': {
        const angle = Math.atan2(playerCenterY - base.y, playerCenterX - base.x);
        const proj = common();
        proj.attackPattern = 'HOMING';
        proj.speedX = Math.cos(angle) * projectileSpeed;
        proj.speedY = Math.sin(angle) * projectileSpeed;
        this.state.enemyProjectiles.push(proj);
        break;
      }
      case 'STRAIGHT_DOWN': {
        const proj = common();
        proj.attackPattern = 'STRAIGHT_DOWN';
        proj.speedX = 0;
        proj.speedY = projectileSpeed;
        this.state.enemyProjectiles.push(proj);
        break;
      }
      case 'DELAYED_HOMING': {
        const proj = common();
        proj.attackPattern = 'DELAYED_HOMING';
        proj.speedX = 0;
        proj.speedY = 0;
        proj.isDelayed = true;
        proj.delayEndTime = currentTime + 500;
        this.state.enemyProjectiles.push(proj);
        break;
      }
      case 'SPIRAL': {
        enemy.spiralAngle = (enemy.spiralAngle || 0) + 0.5;
        for (let i = 0; i < 4; i++) {
          const angle = (enemy.spiralAngle || 0) + i * (Math.PI / 2);
          const proj = common();
          proj.attackPattern = 'SPIRAL';
          proj.speedX = Math.cos(angle) * projectileSpeed * 0.7;
          proj.speedY = Math.sin(angle) * projectileSpeed * 0.7;
          this.state.enemyProjectiles.push(proj);
        }
        break;
      }
      case 'SIDE': {
        const horizontalSpeed = projectileSpeed * 0.75;
        const verticalSpeed = projectileSpeed * 0.85;

        const leftProj = common();
        leftProj.x = enemy.x;
        leftProj.attackPattern = 'SIDE';
        leftProj.speedX = -horizontalSpeed;
        leftProj.speedY = verticalSpeed;
        this.state.enemyProjectiles.push(leftProj);

        const rightProj = common();
        rightProj.x = enemy.x + enemy.width;
        rightProj.attackPattern = 'SIDE';
        rightProj.speedX = horizontalSpeed;
        rightProj.speedY = verticalSpeed;
        this.state.enemyProjectiles.push(rightProj);
        break;
      }
      case 'DECELERATE': {
        const angle = Math.atan2(playerCenterY - base.y, playerCenterX - base.x);
        const fastSpeed = projectileSpeed * DECELERATE_INITIAL_MULTIPLIER;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const slowSpeed = projectileSpeed * DECELERATE_FINAL_MULTIPLIER;
        const initialDistance = Math.max(
          1,
          Math.hypot(playerCenterX - base.x, playerCenterY - base.y)
        );
        const proj = common();
        proj.attackPattern = 'DECELERATE';
        proj.directionX = dirX;
        proj.directionY = dirY;
        proj.speedX = dirX * fastSpeed;
        proj.speedY = dirY * fastSpeed;
        proj.initialSpeed = fastSpeed;
        proj.slowSpeed = slowSpeed;
        proj.decelerateInitialDistance = initialDistance;
        this.state.enemyProjectiles.push(proj);
        break;
      }
      case 'CIRCLE': {
        const angle = Math.atan2(playerCenterY - base.y, playerCenterX - base.x);
        const proj = common();
        proj.attackPattern = 'CIRCLE';
        proj.speedX = Math.cos(angle) * projectileSpeed;
        proj.speedY = Math.sin(angle) * projectileSpeed;
        proj.circleMode = 'APPROACH';
        proj.circleGuideUntil = undefined;
        proj.orbitCenterX = undefined;
        proj.orbitCenterY = undefined;
        proj.orbitRadius = undefined;
        proj.orbitAngle = undefined;
        proj.orbitAngularSpeed = CIRCLE_ORBIT_ANGULAR_SPEED;
        proj.orbitAccumulatedAngle = 0;
        proj.orbitDirection = Math.random() > 0.5 ? 1 : -1;
        this.state.enemyProjectiles.push(proj);
        break;
      }
      default: {
        const proj = common();
        proj.attackPattern = 'STRAIGHT_DOWN';
        proj.speedX = 0;
        proj.speedY = projectileSpeed;
        this.state.enemyProjectiles.push(proj);
        break;
      }
    }
  }

  private handleGatlingBursts(currentTime: number, projectileSpeed: number): void {
    const { ENEMY_FIRE_COOLDOWN } = this.constants;
    const enemies = this.state.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy.gatlingBurstCount || enemy.gatlingBurstCount <= 0) continue;
      if (currentTime - (enemy.gatlingLastBurstTime ?? 0) <= 100) continue;

      enemy.gatlingBurstCount = Math.max((enemy.gatlingBurstCount ?? 0) - 1, 0);
      enemy.gatlingLastBurstTime = currentTime;

      const proj = this.enemyProjectilePool.get();
      proj.id = this.generateId();
      proj.x = enemy.x + enemy.width / 2;
      proj.y = enemy.y + enemy.height;
      proj.width = 8;
      proj.height = 8;
      proj.attackPattern = 'STRAIGHT_DOWN';
      proj.speedX = 0;
      proj.speedY = projectileSpeed;
      this.state.enemyProjectiles.push(proj);

      if (enemy.gatlingBurstCount === 0) {
        enemy.gatlingCooldownUntil = currentTime + ENEMY_FIRE_COOLDOWN;
        enemy.gatlingLastBurstTime = undefined;
      }
    }
  }
}

export default EnemyManager;
