import { MovementPattern, ShooterAttackPattern, EliteShooterType } from '@/types';

class GameConstants {
  private static instance: GameConstants;

  readonly GAME_WIDTH = 1024;
  readonly GAME_HEIGHT = 720;
  readonly PLAYER_WIDTH = 36;
  readonly PLAYER_HEIGHT = 36;
  readonly PLAYER_SPEED_PER_SECOND = 420;
  readonly INITIAL_PROJECTILE_SPEED_PER_SECOND = 1080;
  readonly PROJECTILE_WIDTH = 6;
  readonly PROJECTILE_HEIGHT = 20;
  readonly PROJECTILE_HITBOX_PADDING = 8;
  readonly ENEMY_WIDTH = 36;
  readonly ENEMY_HEIGHT = 36;
  readonly ITEM_WIDTH = 32;
  readonly ITEM_HEIGHT = 32;
  readonly ENEMY_SPEED_PER_SECOND = 48;
  readonly ENEMY_PROJECTILE_SPEED_PER_SECOND = 240;
  readonly ENEMY_ACCELERATION_PER_SECOND_SQUARED = 28.8;
  readonly INITIAL_ENEMY_FIRE_CHANCE = 0.05;
  readonly ENEMY_FIRE_COOLDOWN = 2000;
  readonly FIRE_COOLDOWN = 150;
  readonly ITEM_SPAWN_PERCENTAGE = 0.10;
  readonly INITIAL_LIVES = 5;
  readonly RESPAWN_DURATION = 1500;
  readonly INVINCIBILITY_DURATION = 3000;
  readonly CANCELLER_INVINCIBILITY_DURATION = 500;
  readonly LASER_DURATION = 5000;
  readonly EXPLOSION_DURATION = 400;
  readonly BGM_VOLUME = 0.3;
  readonly DUCKED_BGM_VOLUME = 0.05;
  readonly SKIP_LONG_PRESS_DURATION = 500;
  readonly MINE_WIDTH = 22;
  readonly MINE_HEIGHT = 22;
  readonly MINE_LIFETIME = 9000;
  readonly FLOATING_TEXT_DURATION = 1000;
  readonly RICOCHET_SPEED_FACTOR = 0.3;
  readonly MIN_RICOCHET_SPEED = 240;
  readonly RICOCHET_DIAMETER = 10;
  readonly PHASE_SHIELD_DURATION = 3000;
  readonly BEAT_SPEED_MIN_INTERVAL = 2000;
  readonly BEAT_SPEED_MAX_INTERVAL = 8000;
  readonly BEAT_MAX_SPEED_MULTIPLIER = 3;
  readonly BEAT_TARGET_OFFSET = 36;
  readonly DECELERATE_INITIAL_MULTIPLIER = 2;
  readonly DECELERATE_FINAL_MULTIPLIER = 0.4;
  readonly CIRCLE_TRIGGER_RADIUS = 120;
  readonly CIRCLE_ORBIT_LOOPS = 1;
  readonly CIRCLE_ORBIT_ANGULAR_SPEED = Math.PI;
  readonly CIRCLE_MIN_ORBIT_RADIUS = 40;
  readonly CIRCLE_GUIDE_DURATION = 400;
  readonly CIRCLE_GUIDE_SEGMENTS = 24;
  readonly MAX_SPAWNS_PER_FRAME = 6;
  readonly MOVEMENT_PATTERNS: MovementPattern[] = ['STRAIGHT_DOWN', 'SINE_WAVE', 'ZIG_ZAG', 'DRIFTING', 'ACCELERATING'];
  readonly NORMAL_SHOOTER_PATTERNS: ShooterAttackPattern[] = ['HOMING', 'STRAIGHT_DOWN', 'DELAYED_HOMING', 'SPIRAL', 'BEAT', 'SIDE', 'DECELERATE'];
  readonly LEGACY_SHOOTER_PATTERNS: ShooterAttackPattern[] = ['HOMING', 'STRAIGHT_DOWN', 'DELAYED_HOMING', 'SPIRAL'];
  readonly ELITE_TYPES: EliteShooterType[] = ['MAGIC', 'GATLING', 'LANDMINE', 'LASER', 'CIRCLE'];

  private constructor() {}

  static getInstance(): GameConstants {
    if (!GameConstants.instance) {
      GameConstants.instance = new GameConstants();
    }
    return GameConstants.instance;
  }
}

export default GameConstants;
