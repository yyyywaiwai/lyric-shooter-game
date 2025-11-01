import GameConstants from '@/services/gameConstants';
import { filterInPlace } from '@/services/collectionUtils';
import { GameState, PlayerSnapshot } from '@/services/enemyManager';
import { Item, ItemType, SpecialWeapon } from '@/types';

interface ItemManagerContext {
  state: GameState;
  generateId: () => number;
  playCancelSound: () => void;
  superHardMode: boolean;
}

class ItemManager {
  private static instance: ItemManager;

  private readonly constants = GameConstants.getInstance();
  private state!: GameState;
  private generateId!: () => number;
  private playCancelSound!: () => void;
  private superHardMode = false;

  private constructor() {}

  static getInstance(): ItemManager {
    if (!ItemManager.instance) {
      ItemManager.instance = new ItemManager();
    }
    return ItemManager.instance;
  }

  initialize(context: ItemManagerContext): void {
    this.state = context.state;
    this.generateId = context.generateId;
    this.playCancelSound = context.playCancelSound;
    this.superHardMode = context.superHardMode;
  }

  updateItems(dt: number): void {
    const { GAME_HEIGHT } = this.constants;
    filterInPlace(this.state.items, (item) => {
      item.y += item.speedY * dt;
      return item.y < GAME_HEIGHT;
    });
  }

  collectItems(player: PlayerSnapshot): void {
    const playerHitbox = { x: player.x, y: player.y, width: player.width, height: player.height };
    filterInPlace(this.state.items, (item) => {
      const intersects =
        item.x < playerHitbox.x + playerHitbox.width &&
        item.x + item.width > playerHitbox.x &&
        item.y < playerHitbox.y + playerHitbox.height &&
        item.y + item.height > playerHitbox.y;

      if (intersects) {
        this.handleItemCollection(item, playerHitbox.x, playerHitbox.y);
        return false;
      }
      return true;
    });
  }

  spawnItems(itemSpawnMilestone: { current: number }, totalChars: number): void {
    if (totalChars <= 0) return;

    const threshold = this.superHardMode ? 0.07 : this.constants.ITEM_SPAWN_PERCENTAGE;
    if (this.state.enemiesDefeated / totalChars < itemSpawnMilestone.current + threshold) return;

    itemSpawnMilestone.current += threshold;

    const available: ItemType[] = [
      'SPEED_UP',
      'DIAGONAL_SHOT',
      'SIDE_SHOT',
      'CANCELLER_SHOT',
      'RICOCHET_SHOT',
      'BOMB',
      'LASER_BEAM',
      'PHASE_SHIELD',
      'ONE_UP',
    ];

    if (this.state.hasDiagonalShot) {
      this.removeItemType(available, 'DIAGONAL_SHOT');
    }
    if (this.state.hasSideShot) {
      this.removeItemType(available, 'SIDE_SHOT');
    }
    if (this.state.hasCancellerShot) {
      this.removeItemType(available, 'CANCELLER_SHOT');
    }

    if (available.length === 0) return;

    const type = available[Math.floor(Math.random() * available.length)];
    const { GAME_WIDTH, ITEM_WIDTH, ITEM_HEIGHT, ENEMY_SPEED_PER_SECOND } = this.constants;

    this.state.items.push({
      id: this.generateId(),
      type,
      x: Math.random() * (GAME_WIDTH - ITEM_WIDTH),
      y: -ITEM_HEIGHT,
      width: ITEM_WIDTH,
      height: ITEM_HEIGHT,
      entityType: 'item',
      speedY: ENEMY_SPEED_PER_SECOND * 1.5,
    });
  }

  private handleItemCollection(item: Item, playerX: number, playerY: number): void {
    this.state.itemsCollected[item.type] = (this.state.itemsCollected[item.type] || 0) + 1;
    this.playCancelSound();

    const pushFloatingText = (text: string, x: number, y: number) => {
      this.state.floatingTexts.push({
        id: this.generateId(),
        x,
        y,
        text,
        createdAt: Date.now(),
      });
    };

    switch (item.type) {
      case 'BOMB':
      case 'LASER_BEAM':
      case 'PHASE_SHIELD':
        if (this.state.stockedItem) {
          this.state.score += 500;
          pushFloatingText('+500', item.x, item.y);
        } else {
          this.state.stockedItem = item.type as SpecialWeapon;
          pushFloatingText(this.getItemLabel(item.type), playerX, playerY);
        }
        break;
      case 'SPEED_UP':
        pushFloatingText('SPEED UP!', playerX, playerY);
        this.state.playerSpeedMultiplier *= 1.15;
        this.state.projectileSpeedMultiplier *= 1.15;
        this.state.speedUpCount++;
        break;
      case 'DIAGONAL_SHOT':
        if (!this.state.hasDiagonalShot) {
          this.state.hasDiagonalShot = true;
          this.state.baseShooterChance += 0.05;
          pushFloatingText('DIAGONAL!', playerX, playerY);
        } else {
          this.state.score += 1000;
          pushFloatingText('+1000', item.x, item.y);
        }
        break;
      case 'SIDE_SHOT':
        if (!this.state.hasSideShot) {
          this.state.hasSideShot = true;
          pushFloatingText('SIDE!', playerX, playerY);
        } else {
          this.state.score += 1000;
          pushFloatingText('+1000', item.x, item.y);
        }
        break;
      case 'CANCELLER_SHOT':
        if (!this.state.hasCancellerShot) {
          this.state.hasCancellerShot = true;
          pushFloatingText('CANCELLER!', playerX, playerY);
        } else {
          this.state.score += 1000;
          pushFloatingText('+1000', item.x, item.y);
        }
        break;
      case 'RICOCHET_SHOT':
        this.state.hasRicochetShot = true;
        this.state.ricochetStacks = (this.state.ricochetStacks || 0) + 1;
        pushFloatingText(`RICOCHET x${this.state.ricochetStacks}`, playerX, playerY);
        break;
      case 'ONE_UP':
        this.state.lives++;
        pushFloatingText('1UP!', playerX, playerY);
        break;
      default:
        break;
    }
  }

  private getItemLabel(type: ItemType): string {
    switch (type) {
      case 'BOMB':
        return 'BOMB!';
      case 'LASER_BEAM':
        return 'LASER!';
      case 'PHASE_SHIELD':
        return 'SHIELD!';
      default:
        return '';
    }
  }

  private removeItemType(items: ItemType[], type: ItemType): void {
    const index = items.indexOf(type);
    if (index >= 0) {
      items.splice(index, 1);
    }
  }
}

export default ItemManager;
