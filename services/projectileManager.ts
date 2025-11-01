import GameConstants from '@/services/gameConstants';
import { filterInPlace } from '@/services/collectionUtils';
import EnemyManager from '@/services/enemyManager';
import {
  Enemy,
  Projectile,
  EnemyProjectile,
  Mine,
  Explosion,
  GameObject,
  GameState,
  PlayerSnapshot,
} from '@/types';

interface Pool<T> {
  get(): T;
  release(obj: T): void;
}

interface CollisionBuffers {
  enemies: Enemy[];
  enemyProjectiles: EnemyProjectile[];
  mines: Mine[];
}

interface SpatialGridLike {
  clear(): void;
  insert(obj: any): void;
  queryNearby(obj: any, result?: any[]): any[];
}

interface ProjectileManagerContext {
  state: GameState;
  generateId: () => number;
  projectilePool: Pool<Projectile>;
  enemyProjectilePool: Pool<EnemyProjectile>;
  explosionPool: Pool<Explosion>;
  enemyManager: EnemyManager;
  playCancelSound: () => void;
}

interface PlayerFireParams {
  now: number;
  isLastStand: boolean;
  keysPressed: Record<string, boolean>;
  lastFireTime: { current: number };
  spacebarPressStart: number;
  player: PlayerSnapshot;
  isRespawning: boolean;
  isGameOverDelayed: boolean;
  isLaserActive: boolean;
  showSkip: boolean;
  fireCooldown: number;
}

interface EnemyProjectileUpdateParams {
  dt: number;
  currentTime: number;
  projectileSpeed: number;
  playerCenterX: number;
  playerCenterY: number;
}

interface CollisionParams {
  isLastStand: boolean;
  enemyProjectileSpeed: number;
  currentTime: number;
  player: PlayerSnapshot;
  spatialGrid: SpatialGridLike;
  collisionBuffers: CollisionBuffers;
  playerHitCallback: () => void;
  hasLaser: boolean;
  laserActive: boolean;
  generateId: () => number;
}

const isEnemyObject = (obj: GameObject | null | undefined): obj is Enemy =>
  !!obj && obj.entityType === 'enemy';

const isEnemyProjectileObject = (obj: GameObject | null | undefined): obj is EnemyProjectile =>
  !!obj && obj.entityType === 'enemyProjectile';

const isMineObject = (obj: GameObject | null | undefined): obj is Mine =>
  !!obj && obj.entityType === 'mine';

class ProjectileManager {
  private static instance: ProjectileManager;

  private readonly constants = GameConstants.getInstance();
  private state!: GameState;
  private generateId!: () => number;
  private projectilePool!: Pool<Projectile>;
  private enemyProjectilePool!: Pool<EnemyProjectile>;
  private explosionPool!: Pool<Explosion>;
  private enemyManager!: EnemyManager;
  private playCancelSound!: () => void;

  private constructor() {}

  static getInstance(): ProjectileManager {
    if (!ProjectileManager.instance) {
      ProjectileManager.instance = new ProjectileManager();
    }
    return ProjectileManager.instance;
  }

  initialize(context: ProjectileManagerContext): void {
    this.state = context.state;
    this.generateId = context.generateId;
    this.projectilePool = context.projectilePool;
    this.enemyProjectilePool = context.enemyProjectilePool;
    this.explosionPool = context.explosionPool;
    this.enemyManager = context.enemyManager;
    this.playCancelSound = context.playCancelSound;
  }

  handlePlayerFire(params: PlayerFireParams): void {
    const {
      PROJECTILE_WIDTH,
      PROJECTILE_HEIGHT,
      PLAYER_WIDTH,
      INITIAL_PROJECTILE_SPEED_PER_SECOND,
    } = this.constants;

    const {
      now,
      isLastStand,
      keysPressed,
      lastFireTime,
      spacebarPressStart,
      player,
      isRespawning,
      isGameOverDelayed,
      isLaserActive,
      showSkip,
      fireCooldown,
    } = params;

    const isSpacePressed = keysPressed[' '] || keysPressed['Space'] || keysPressed['Spacebar'];

    const canFire =
      !isRespawning &&
      !isGameOverDelayed &&
      isSpacePressed &&
      !isLaserActive &&
      !(showSkip && spacebarPressStart > 0);

    if (!canFire || now - lastFireTime.current <= fireCooldown) return;

    lastFireTime.current = now;
    this.state.mainShotCounter++;

    const currentProjectileSpeed =
      INITIAL_PROJECTILE_SPEED_PER_SECOND * this.state.projectileSpeedMultiplier * (isLastStand ? 1.3 : 1);

    const pX = player.x + PLAYER_WIDTH / 2 - PROJECTILE_WIDTH / 2;
    const pY = player.y;

    const isRicochetPrimary =
      this.state.hasRicochetShot && (isLastStand || this.state.mainShotCounter % 2 === 0);

    const mainProjectile = this.projectilePool.get();
    mainProjectile.id = this.generateId();
    mainProjectile.x = pX;
    mainProjectile.y = pY;
    mainProjectile.width = PROJECTILE_WIDTH;
    mainProjectile.height = PROJECTILE_HEIGHT;
    mainProjectile.entityType = 'playerProjectile';
    mainProjectile.speedY = currentProjectileSpeed;
    mainProjectile.speedX = 0;
    mainProjectile.isRicochetPrimary = isRicochetPrimary;
    mainProjectile.hasBounced = false;
    mainProjectile.remainingBounces = isRicochetPrimary ? this.state.ricochetStacks : 0;
    this.state.projectiles.push(mainProjectile);

    const diagonalInterval = isLastStand ? 2 : 3;
    if (this.state.hasDiagonalShot && this.state.mainShotCounter % diagonalInterval === 0) {
      const rightDiagonal = this.projectilePool.get();
      rightDiagonal.id = this.generateId();
      rightDiagonal.x = pX;
      rightDiagonal.y = pY;
      rightDiagonal.width = PROJECTILE_WIDTH;
      rightDiagonal.height = PROJECTILE_HEIGHT;
      rightDiagonal.entityType = 'playerProjectile';
      rightDiagonal.speedY = currentProjectileSpeed;
      rightDiagonal.speedX = currentProjectileSpeed * 0.4;
      rightDiagonal.isRicochetPrimary = false;
      rightDiagonal.hasBounced = false;
      rightDiagonal.remainingBounces = 0;
      this.state.projectiles.push(rightDiagonal);

      const leftDiagonal = this.projectilePool.get();
      leftDiagonal.id = this.generateId();
      leftDiagonal.x = pX;
      leftDiagonal.y = pY;
      leftDiagonal.width = PROJECTILE_WIDTH;
      leftDiagonal.height = PROJECTILE_HEIGHT;
      leftDiagonal.entityType = 'playerProjectile';
      leftDiagonal.speedY = currentProjectileSpeed;
      leftDiagonal.speedX = -currentProjectileSpeed * 0.4;
      leftDiagonal.isRicochetPrimary = false;
      leftDiagonal.hasBounced = false;
      leftDiagonal.remainingBounces = 0;
      this.state.projectiles.push(leftDiagonal);
    }

    const sideInterval = isLastStand ? 1 : 2;
    if (this.state.hasSideShot && this.state.mainShotCounter % sideInterval === 0) {
      const sideProjectileY = player.y + PLAYER_WIDTH / 2 - PROJECTILE_WIDTH / 2;

      const leftSide = this.projectilePool.get();
      leftSide.id = this.generateId();
      leftSide.x = player.x + PLAYER_WIDTH / 2;
      leftSide.y = sideProjectileY;
      leftSide.width = PROJECTILE_HEIGHT;
      leftSide.height = PROJECTILE_WIDTH;
      leftSide.entityType = 'playerProjectile';
      leftSide.speedY = 0;
      leftSide.speedX = -currentProjectileSpeed;
      leftSide.isRicochetPrimary = false;
      leftSide.hasBounced = false;
      leftSide.remainingBounces = 0;
      this.state.projectiles.push(leftSide);

      const rightSide = this.projectilePool.get();
      rightSide.id = this.generateId();
      rightSide.x = player.x + PLAYER_WIDTH / 2;
      rightSide.y = sideProjectileY;
      rightSide.width = PROJECTILE_HEIGHT;
      rightSide.height = PROJECTILE_WIDTH;
      rightSide.entityType = 'playerProjectile';
      rightSide.speedY = 0;
      rightSide.speedX = currentProjectileSpeed;
      rightSide.isRicochetPrimary = false;
      rightSide.hasBounced = false;
      rightSide.remainingBounces = 0;
      this.state.projectiles.push(rightSide);
    }
  }

  updatePlayerProjectiles(dt: number): void {
    const { GAME_HEIGHT, GAME_WIDTH } = this.constants;
    filterInPlace(this.state.projectiles, (projectile) => {
      projectile.y -= projectile.speedY * dt;
      projectile.x += (projectile.speedX || 0) * dt;
      const active =
        projectile.y > -projectile.height &&
        projectile.y < GAME_HEIGHT &&
        projectile.x > -projectile.width &&
        projectile.x < GAME_WIDTH;
      if (!active) {
        this.projectilePool.release(projectile);
      }
      return active;
    });
  }

  updateEnemyProjectiles(params: EnemyProjectileUpdateParams): void {
    const {
      CIRCLE_TRIGGER_RADIUS,
      CIRCLE_GUIDE_DURATION,
      CIRCLE_MIN_ORBIT_RADIUS,
      CIRCLE_ORBIT_ANGULAR_SPEED,
      CIRCLE_ORBIT_LOOPS,
      DECELERATE_INITIAL_MULTIPLIER,
      DECELERATE_FINAL_MULTIPLIER,
    } = this.constants;
    const { dt, currentTime, projectileSpeed, playerCenterX, playerCenterY } = params;

    filterInPlace(
      this.state.enemyProjectiles,
      (projectile) => {
        switch (projectile.attackPattern) {
          case 'DELAYED_HOMING': {
            if (projectile.isDelayed) {
              if (currentTime > (projectile.delayEndTime || 0)) {
                projectile.isDelayed = false;
                const angle = Math.atan2(playerCenterY - projectile.y, playerCenterX - projectile.x);
                projectile.speedX = Math.cos(angle) * projectileSpeed * 1.5;
                projectile.speedY = Math.sin(angle) * projectileSpeed * 1.5;
                projectile.x += projectile.speedX * dt;
                projectile.y += projectile.speedY * dt;
              }
            } else {
              projectile.x += projectile.speedX * dt;
              projectile.y += projectile.speedY * dt;
            }
            break;
          }
          case 'DECELERATE': {
            let directionX = projectile.directionX;
            let directionY = projectile.directionY;
            if (directionX === undefined || directionY === undefined) {
              const currentLen = Math.hypot(projectile.speedX, projectile.speedY) || 1;
              directionX = projectile.speedX / currentLen;
              directionY = projectile.speedY / currentLen;
              projectile.directionX = directionX;
              projectile.directionY = directionY;
            }

            const initialSpeed = projectile.initialSpeed ?? projectileSpeed * DECELERATE_INITIAL_MULTIPLIER;
            const finalSpeed = projectile.slowSpeed ?? projectileSpeed * DECELERATE_FINAL_MULTIPLIER;
            const initialDistance =
              projectile.decelerateInitialDistance ??
              Math.max(1, Math.hypot(playerCenterX - projectile.x, playerCenterY - projectile.y));
            projectile.decelerateInitialDistance = initialDistance;

            const distanceToPlayer = Math.hypot(playerCenterX - projectile.x, playerCenterY - projectile.y);
            const clampedDistance = Math.min(Math.max(distanceToPlayer, 0), initialDistance);
            const progress = initialDistance > 0 ? 1 - clampedDistance / initialDistance : 1;
            const easedProgress = Math.min(Math.max(progress, 0), 1);
            const targetSpeed = initialSpeed - (initialSpeed - finalSpeed) * easedProgress;

            projectile.speedX = (directionX || 0) * targetSpeed;
            projectile.speedY = (directionY || 0) * targetSpeed;
            projectile.x += projectile.speedX * dt;
            projectile.y += projectile.speedY * dt;
            break;
          }
          case 'CIRCLE': {
            const mode = projectile.circleMode || 'APPROACH';
            if (mode === 'APPROACH') {
              projectile.x += projectile.speedX * dt;
              projectile.y += projectile.speedY * dt;
              const distanceToPlayer = Math.hypot(playerCenterX - projectile.x, playerCenterY - projectile.y);
              if (distanceToPlayer <= CIRCLE_TRIGGER_RADIUS) {
                projectile.circleMode = 'GUIDE_ORBIT';
                projectile.circleGuideUntil = currentTime + CIRCLE_GUIDE_DURATION;
                projectile.orbitCenterX = playerCenterX;
                projectile.orbitCenterY = playerCenterY;
                projectile.orbitRadius = Math.max(
                  CIRCLE_MIN_ORBIT_RADIUS,
                  Math.hypot(projectile.x - playerCenterX, projectile.y - playerCenterY)
                );
                projectile.orbitAngle = Math.atan2(
                  projectile.y - playerCenterY,
                  projectile.x - playerCenterX
                );
                projectile.orbitAngularSpeed = CIRCLE_ORBIT_ANGULAR_SPEED;
                projectile.orbitAccumulatedAngle = 0;
                projectile.orbitDirection = projectile.orbitDirection || (Math.random() > 0.5 ? 1 : -1);
                projectile.speedX = 0;
                projectile.speedY = 0;
              }
            } else if (mode === 'GUIDE_ORBIT') {
              if (currentTime >= (projectile.circleGuideUntil || 0)) {
                projectile.circleMode = 'ORBIT';
                projectile.circleGuideUntil = undefined;
              }
            } else if (mode === 'ORBIT') {
              const angularSpeed =
                (projectile.orbitAngularSpeed || CIRCLE_ORBIT_ANGULAR_SPEED) * (projectile.orbitDirection || 1);
              projectile.orbitAngle = (projectile.orbitAngle || 0) + angularSpeed * dt;
              projectile.orbitAccumulatedAngle =
                (projectile.orbitAccumulatedAngle || 0) + Math.abs(angularSpeed * dt);
              const radius = projectile.orbitRadius || CIRCLE_MIN_ORBIT_RADIUS;
              projectile.x = (projectile.orbitCenterX || playerCenterX) + Math.cos(projectile.orbitAngle || 0) * radius;
              projectile.y = (projectile.orbitCenterY || playerCenterY) + Math.sin(projectile.orbitAngle || 0) * radius;
              if ((projectile.orbitAccumulatedAngle || 0) >= Math.PI * 2 * CIRCLE_ORBIT_LOOPS) {
                projectile.circleMode = 'GUIDE_DROP';
                projectile.circleGuideUntil = currentTime + CIRCLE_GUIDE_DURATION;
                projectile.speedX = 0;
                projectile.speedY = projectileSpeed;
              }
            } else if (mode === 'GUIDE_DROP') {
              if (currentTime >= (projectile.circleGuideUntil || 0)) {
                projectile.circleMode = 'DROP';
                projectile.circleGuideUntil = currentTime + CIRCLE_GUIDE_DURATION;
                projectile.speedX = 0;
                projectile.speedY = projectileSpeed;
              }
            } else {
              if (projectile.circleGuideUntil !== undefined && currentTime >= projectile.circleGuideUntil) {
                projectile.circleGuideUntil = undefined;
              }
              projectile.x += projectile.speedX * dt;
              projectile.y += projectile.speedY * dt;
            }
            break;
          }
          default:
            projectile.x += projectile.speedX * dt;
            projectile.y += projectile.speedY * dt;
            break;
        }

        const { GAME_WIDTH, GAME_HEIGHT } = this.constants;
        return (
          projectile.y < GAME_HEIGHT + 20 &&
          projectile.y > -20 &&
          projectile.x > -20 &&
          projectile.x < GAME_WIDTH + 20
        );
      },
      (projectile) => {
        this.enemyProjectilePool.release(projectile);
      }
    );
  }

  resolveCollisions(params: CollisionParams): void {
    const {
      isLastStand,
      enemyProjectileSpeed,
      currentTime,
      player,
      spatialGrid,
      collisionBuffers,
      playerHitCallback,
      hasLaser,
      laserActive,
      generateId,
    } = params;

    const { PLAYER_WIDTH, PLAYER_HEIGHT, INITIAL_PROJECTILE_SPEED_PER_SECOND, PROJECTILE_WIDTH, PROJECTILE_HEIGHT } =
      this.constants;

    const hitProjectiles = new Set<Projectile>();
    const enemiesHitThisFrame = new Set<number>();

    const playerHitbox = {
      x: player.x,
      y: player.y,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
    };

    const enemyBuffer = collisionBuffers.enemies;
    const projectileCountForEnemies = this.state.projectiles.length;
    for (let i = 0; i < projectileCountForEnemies; i++) {
      const projectile = this.state.projectiles[i];
      if (hitProjectiles.has(projectile)) continue;

      const nearbyEnemies = spatialGrid.queryNearby(projectile, enemyBuffer);
      for (let j = 0; j < nearbyEnemies.length; j++) {
        const candidate = nearbyEnemies[j] as GameObject;
        if (!isEnemyObject(candidate) || enemiesHitThisFrame.has(candidate.id)) continue;
        const enemy = candidate;

        if (
          projectile.x < enemy.x + enemy.width &&
          projectile.x + projectile.width > enemy.x &&
          projectile.y < enemy.y + enemy.height &&
          projectile.y + projectile.height > enemy.y
        ) {
          enemy.hp = (enemy.hp ?? 1) - 1;
          hitProjectiles.add(projectile);
          enemy.hp!--;
          enemy.isFlashing = true;
          enemy.flashEndTime = currentTime + 100;

          if ((projectile.remainingBounces || 0) > 0) {
            const impactX = projectile.x + projectile.width / 2;
            const impactY = projectile.y + projectile.height / 2;
            this.spawnRicochet(projectile, impactX, impactY, isLastStand, enemy.id);
          }

          if ((enemy.hp || 0) <= 0) {
            enemiesHitThisFrame.add(enemy.id);
            this.state.score += enemy.isElite || enemy.isBig ? 75 : 10;
            this.state.enemiesDefeated++;
            const explosion = this.explosionPool.get();
            explosion.id = generateId();
            explosion.x = enemy.x + enemy.width / 2;
            explosion.y = enemy.y + enemy.height / 2;
            explosion.size = enemy.isElite || enemy.isBig ? 'large' : 'small';
            explosion.createdAt = currentTime;
            this.state.explosions.push(explosion);
          }
          break;
        }
      }
    }

    filterInPlace(
      this.state.projectiles,
      (projectile) => !hitProjectiles.has(projectile),
      (projectile) => {
        this.projectilePool.release(projectile);
      }
    );

    if (enemiesHitThisFrame.size > 0) {
      filterInPlace(this.state.enemies, (enemy) => !enemiesHitThisFrame.has(enemy.id));
    }

    if (laserActive) {
      const laserX = player.x + PLAYER_WIDTH / 2;
      filterInPlace(this.state.enemies, (enemy) => {
        const intersects =
          laserX >= enemy.x &&
          laserX <= enemy.x + enemy.width &&
          enemy.y <= player.y &&
          enemy.y + enemy.height >= 0;
        if (intersects) {
          this.state.score += 5;
          const explosion = this.explosionPool.get();
          explosion.id = generateId();
          explosion.x = enemy.x + enemy.width / 2;
          explosion.y = enemy.y + enemy.height / 2;
          explosion.size = 'small';
          explosion.createdAt = currentTime;
          this.state.explosions.push(explosion);
          return false;
        }
        return true;
      });
    }

    filterInPlace(
      this.state.enemyProjectiles,
      (projectile) => {
        if (
          projectile.x < playerHitbox.x + playerHitbox.width &&
          projectile.x + projectile.width > playerHitbox.x &&
          projectile.y < playerHitbox.y + playerHitbox.height &&
          projectile.y + projectile.height > playerHitbox.y
        ) {
          if (this.state.isPhaseShieldActive) {
            if (this.state.hasCancellerShot) {
              const reflected = this.projectilePool.get();
              reflected.id = generateId();
              reflected.x = player.x + PLAYER_WIDTH / 2 - PROJECTILE_WIDTH / 2;
              reflected.y = player.y;
              reflected.width = PROJECTILE_WIDTH;
              reflected.height = PROJECTILE_HEIGHT;
              reflected.entityType = 'playerProjectile';
              reflected.speedX = -(projectile.speedX);
              const baseSpeed = Math.max(
                INITIAL_PROJECTILE_SPEED_PER_SECOND * 0.7,
                -projectile.speedY
              );
              reflected.speedY = baseSpeed;
              reflected.isRicochetPrimary = false;
              reflected.hasBounced = false;
              reflected.remainingBounces = 0;
              this.state.projectiles.push(reflected);
              this.playCancelSound();
            }
          } else {
            playerHitCallback();
          }
          return false;
        }
        return true;
      },
      (projectile) => {
        this.enemyProjectilePool.release(projectile);
      }
    );

    if (hasLaser) {
      for (let i = 0; i < this.state.enemies.length; i++) {
        const enemy = this.state.enemies[i];
        if (enemy.eliteType === 'LASER' && enemy.laserState === 'FIRING' && enemy.laserTarget) {
          const intersects = this.lineIntersectsRect(
            {
              p1: { x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height },
              p2: { x: enemy.laserTarget.x, y: enemy.laserTarget.y },
            },
            playerHitbox
          );
          if (intersects) {
            playerHitCallback();
          }
        }
      }
    }

    filterInPlace(
      this.state.mines,
      (mine) => {
        const intersects =
          mine.x < playerHitbox.x + playerHitbox.width &&
          mine.x + mine.width > playerHitbox.x &&
          mine.y < playerHitbox.y + playerHitbox.height &&
          mine.y + mine.height > playerHitbox.y;
        if (intersects) {
          playerHitCallback();
          return false;
        }
        return true;
      }
    );

    if (this.state.hasCancellerShot) {
      this.resolveCancellerCollisions(collisionBuffers, spatialGrid, isLastStand);
    }

    this.resolveProjectileMineCollisions(collisionBuffers, spatialGrid, enemyProjectileSpeed, generateId, currentTime);

    for (let i = 0; i < this.state.enemies.length; i++) {
      const enemy = this.state.enemies[i];
      const intersects =
        enemy.x < playerHitbox.x + playerHitbox.width &&
        enemy.x + enemy.width > playerHitbox.x &&
        enemy.y < playerHitbox.y + playerHitbox.height &&
        enemy.y + enemy.height > playerHitbox.y;
      if (intersects) {
        if (this.state.isPhaseShieldActive) {
          const scored = enemy.isElite || enemy.isBig ? 75 : 10;
          this.state.score += scored;
          this.state.enemiesDefeated++;
          const explosion = this.explosionPool.get();
          explosion.id = generateId();
          explosion.x = enemy.x + enemy.width / 2;
          explosion.y = enemy.y + enemy.height / 2;
          explosion.size = enemy.isElite || enemy.isBig ? 'large' : 'small';
          explosion.createdAt = currentTime;
          this.state.explosions.push(explosion);
          enemiesHitThisFrame.add(enemy.id);
        } else {
          playerHitCallback();
        }
      }
    }

    if (enemiesHitThisFrame.size > 0) {
      filterInPlace(this.state.enemies, (enemy) => !enemiesHitThisFrame.has(enemy.id));
    }
  }

  private spawnRicochet(
    projectile: Projectile,
    impactX: number,
    impactY: number,
    isLastStand: boolean,
    excludeEnemyId?: number
  ): void {
    const {
      RICOCHET_SPEED_FACTOR,
      MIN_RICOCHET_SPEED,
      RICOCHET_DIAMETER,
      INITIAL_PROJECTILE_SPEED_PER_SECOND,
      PROJECTILE_WIDTH,
      PROJECTILE_HEIGHT,
    } = this.constants;

    const target = this.enemyManager.findNearestEnemy(impactX, impactY, excludeEnemyId);
    if (!target) return;

    const tx = target.x + target.width / 2;
    const ty = target.y + target.height / 2;
    let dirX = tx - impactX;
    let dirY = ty - impactY;
    let dirLen = Math.hypot(dirX, dirY);
    if (dirLen < 1e-3) {
      const prevWorldVX = projectile.speedX || 0;
      const prevWorldVY = -(projectile.speedY);
      const prevLen = Math.hypot(prevWorldVX, prevWorldVY);
      if (prevLen > 1e-3) {
        dirX = prevWorldVX / prevLen;
        dirY = prevWorldVY / prevLen;
      } else {
        dirX = 0;
        dirY = -1;
      }
    } else {
      dirX /= dirLen;
      dirY /= dirLen;
    }

    let baseSpeed =
      Math.hypot(projectile.speedX || 0, projectile.speedY) ||
      INITIAL_PROJECTILE_SPEED_PER_SECOND * this.state.projectileSpeedMultiplier;
    let nextSpeed = baseSpeed * (isLastStand ? 1 : RICOCHET_SPEED_FACTOR);
    if (!isLastStand) {
      nextSpeed = Math.max(nextSpeed, MIN_RICOCHET_SPEED);
    }

    const ricochet = this.projectilePool.get();
    ricochet.id = this.generateId();
    ricochet.x = impactX - RICOCHET_DIAMETER / 2;
    ricochet.y = impactY - RICOCHET_DIAMETER / 2;
    ricochet.width = RICOCHET_DIAMETER;
    ricochet.height = RICOCHET_DIAMETER;
    ricochet.entityType = 'playerProjectile';
    ricochet.speedX = dirX * nextSpeed;
    ricochet.speedY = -dirY * nextSpeed;
    ricochet.isRicochetPrimary = false;
    ricochet.hasBounced = true;
    ricochet.remainingBounces = (projectile.remainingBounces || 0) - 1;
    this.state.projectiles.push(ricochet);
  }

  private resolveCancellerCollisions(
    collisionBuffers: CollisionBuffers,
    spatialGrid: SpatialGridLike,
    isLastStand: boolean
  ): void {
    const projectileBuffer = collisionBuffers.enemyProjectiles;
    const playerProjsToRemove = new Set<Projectile>();
    const enemyProjsToRemove = new Set<EnemyProjectile>();

    const projectileCount = this.state.projectiles.length;
    for (let i = 0; i < projectileCount; i++) {
      const playerProjectile = this.state.projectiles[i];
      if (playerProjsToRemove.has(playerProjectile)) continue;

      const nearbyEnemyProj = spatialGrid.queryNearby(playerProjectile, projectileBuffer);
      for (let j = 0; j < nearbyEnemyProj.length; j++) {
        const candidate = nearbyEnemyProj[j] as GameObject;
        if (!isEnemyProjectileObject(candidate)) continue;
        const enemyProjectile = candidate;
        if (enemyProjsToRemove.has(enemyProjectile)) continue;

        if (
          playerProjectile.x < enemyProjectile.x + enemyProjectile.width &&
          playerProjectile.x + playerProjectile.width > enemyProjectile.x &&
          playerProjectile.y < enemyProjectile.y + enemyProjectile.height &&
          playerProjectile.y + playerProjectile.height > enemyProjectile.y
        ) {
          if ((playerProjectile.remainingBounces || 0) > 0) {
            const impactX = playerProjectile.x + playerProjectile.width / 2;
            const impactY = playerProjectile.y + playerProjectile.height / 2;
            this.spawnRicochet(playerProjectile, impactX, impactY, isLastStand);
          }
          playerProjsToRemove.add(playerProjectile);
          enemyProjsToRemove.add(enemyProjectile);
          break;
        }
      }
    }

    if (playerProjsToRemove.size > 0) {
      filterInPlace(
        this.state.projectiles,
        (projectile) => !playerProjsToRemove.has(projectile),
        (projectile) => {
          this.projectilePool.release(projectile);
        }
      );
    }
    if (enemyProjsToRemove.size > 0) {
      filterInPlace(
        this.state.enemyProjectiles,
        (projectile) => !enemyProjsToRemove.has(projectile),
        (projectile) => {
          this.enemyProjectilePool.release(projectile);
        }
      );
    }
  }

  private resolveProjectileMineCollisions(
    collisionBuffers: CollisionBuffers,
    spatialGrid: SpatialGridLike,
    enemyProjectileSpeed: number,
    generateId: () => number,
    currentTime: number
  ): void {
    const mineBuffer = collisionBuffers.mines;
    const projectilesToRemove = new Set<Projectile>();
    const minesToRemove = new Set<Mine>();

    const projectileCount = this.state.projectiles.length;
    for (let i = 0; i < projectileCount; i++) {
      const projectile = this.state.projectiles[i];
      if (projectilesToRemove.has(projectile)) continue;

      const nearbyMines = spatialGrid.queryNearby(projectile, mineBuffer);
      for (let j = 0; j < nearbyMines.length; j++) {
        const candidate = nearbyMines[j] as GameObject;
        if (!isMineObject(candidate)) continue;
        const mine = candidate;
        if (minesToRemove.has(mine)) continue;

        if (
          projectile.x < mine.x + mine.width &&
          projectile.x + projectile.width > mine.x &&
          projectile.y < mine.y + mine.height &&
          projectile.y + projectile.height > mine.y
        ) {
          projectilesToRemove.add(projectile);
          minesToRemove.add(mine);

          for (let k = 0; k < 5; k++) {
            const angle = (k * Math.PI * 2) / 5 - Math.PI / 2;
            const burst = this.enemyProjectilePool.get();
            burst.id = generateId();
            burst.x = mine.x;
            burst.y = mine.y;
            burst.width = 8;
            burst.height = 8;
            burst.entityType = 'enemyProjectile';
            burst.attackPattern = 'STRAIGHT_DOWN';
            burst.speedX = Math.cos(angle) * enemyProjectileSpeed * 0.8;
            burst.speedY = Math.sin(angle) * enemyProjectileSpeed * 0.8;
            this.state.enemyProjectiles.push(burst);
          }

          const explosion = this.explosionPool.get();
          explosion.id = generateId();
          explosion.x = mine.x + mine.width / 2;
          explosion.y = mine.y + mine.height / 2;
          explosion.size = 'small';
          explosion.createdAt = currentTime;
          this.state.explosions.push(explosion);
          break;
        }
      }
    }

    if (projectilesToRemove.size > 0) {
      filterInPlace(
        this.state.projectiles,
        (projectile) => !projectilesToRemove.has(projectile),
        (projectile) => {
          this.projectilePool.release(projectile);
        }
      );
    }
    if (minesToRemove.size > 0) {
      filterInPlace(this.state.mines, (mine) => !minesToRemove.has(mine));
    }
  }

  private lineIntersectsRect(
    line: { p1: { x: number; y: number }; p2: { x: number; y: number } },
    rect: { x: number; y: number; width: number; height: number }
  ): boolean {
    const intersect = (p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }, p4: { x: number; y: number }) => {
      const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
      if (den === 0) return false;
      const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
      const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    };

    const { x, y, width, height } = rect;
    const { p1, p2 } = line;

    const left = intersect(p1, p2, { x, y }, { x, y: y + height });
    const right = intersect(p1, p2, { x: x + width, y }, { x: x + width, y: y + height });
    const top = intersect(p1, p2, { x, y }, { x: x + width, y });
    const bottom = intersect(p1, p2, { x, y: y + height }, { x: x + width, y: y + height });

    return left || right || top || bottom;
  }
}

export default ProjectileManager;
