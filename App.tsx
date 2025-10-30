
import React, { useState, useCallback, useEffect } from 'react';
import { LyricLine, GameStatus, GameStats, ItemType, SongMetadata } from './types';
import FileUploader from './components/FileUploader';
import GameScreen from './components/GameScreen';
import { BombIcon, DiagonalShotIcon, LaserIcon, OneUpIcon, SpeedUpIcon, SideShotIcon, CancellerShotIcon, RicochetShotIcon, PhaseShieldIcon } from './components/icons';

const NON_DESKTOP_TERMS = [
  'android',
  'iphone',
  'ipad',
  'ipod',
  'windows phone',
  'mobile',
  'tablet',
  'webos',
  'blackberry',
  'bb10',
  'playbook',
  'silk',
  'kindle',
  'opera mini',
  'opera mobi'
];

const detectDesktop = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  const ua = (navigator.userAgent || '').toLowerCase();
  const isTouchMac = ua.includes('macintosh') && navigator.maxTouchPoints > 1;
  const isNonDesktopByUa = NON_DESKTOP_TERMS.some(term => ua.includes(term));
  return !(isNonDesktopByUa || isTouchMac);
};

const MIN_VIEWPORT_WIDTH = 1024;
const MIN_VIEWPORT_HEIGHT = 720;

const InfoPanel = () => (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8 max-w-4xl mx-auto p-4 bg-slate-800 bg-opacity-70 rounded-lg text-left">
        <div>
            <h3 className="text-2xl font-orbitron text-sky-300 mb-4 text-center md:text-left">ITEMS</h3>
            <ul className="space-y-3 text-white">
                <li className="flex items-center"><BombIcon className="w-8 h-8 mr-4 flex-shrink-0" /><p><span className="font-bold">Bomb (Active):</span> <span className="text-rose-300 font-semibold">Instantly wipes out all on-screen enemies.</span> Activate with SHIFT/TAB. <span className="text-rose-300 font-semibold">Last Stand: 50% chance to auto-supply a Bomb or Laser if the slot is empty.</span></p></li>
                <li className="flex items-center"><LaserIcon className="w-8 h-8 mr-4 flex-shrink-0" /><p><span className="font-bold">Laser Beam (Active):</span> <span className="text-rose-300 font-semibold">Fires a devastating laser for 5 seconds.</span> Activate with SHIFT/TAB. <span className="text-rose-300 font-semibold">Last Stand: 50% chance to auto-supply a Bomb or Laser if the slot is empty.</span></p></li>
                <li className="flex items-center"><SpeedUpIcon className="w-8 h-8 mr-4 flex-shrink-0" /><p><span className="font-bold">Speed Up (Passive):</span> <span className="text-rose-300 font-semibold">Boosts movement and projectile speed.</span> Stacks with itself. <span className="text-rose-300 font-semibold">Last Stand: Projectiles gain an extra +30% speed boost on top of all stacks.</span></p></li>
                <li className="flex items-center"><DiagonalShotIcon className="w-8 h-8 mr-4 flex-shrink-0" /><p><span className="font-bold">Diagonal Shot (Passive):</span> <span className="text-rose-300 font-semibold">Adds diagonal shots every 3rd shot.</span> Slightly raises enemy shooter spawn chance and cannot stack. <span className="text-rose-300 font-semibold">Last Stand: Fires every 2nd shot.</span></p></li>
                <li className="flex items-center"><SideShotIcon className="w-8 h-8 mr-4 flex-shrink-0" /><p><span className="font-bold">Side Shot (Passive):</span> <span className="text-rose-300 font-semibold">Launches left and right shots every 2nd shot.</span> Cannot stack. <span className="text-rose-300 font-semibold">Last Stand: Fires with every shot.</span></p></li>
                <li className="flex items-center"><CancellerShotIcon className="w-8 h-8 mr-4 flex-shrink-0" /><p><span className="font-bold">Canceller Shot (Passive):</span> <span className="text-rose-300 font-semibold">Player bullets cancel enemy bullets on contact.</span> Grants a chance to nullify incoming damage and cannot stack. <span className="text-rose-300 font-semibold">Last Stand: Nullification chance rises to 35%.</span></p></li>
                <li className="flex items-center"><RicochetShotIcon className="w-8 h-8 mr-4 flex-shrink-0" /><p><span className="font-bold">Ricochet Shot (Passive):</span> <span className="text-rose-300 font-semibold">Every other main shot (1 out of 2) ricochets to the nearest enemy.</span> Stacking increases jump count; each bounce lowers speed by 70%. <span className="text-rose-300 font-semibold">Last Stand: Ricochet shots trigger with every shot and keep full speed.</span> After bouncing, the projectile becomes a red orb.</p></li>
                <li className="flex items-center"><PhaseShieldIcon className="w-8 h-8 mr-4 flex-shrink-0" /><p><span className="font-bold">Phase Shield (Active):</span> <span className="text-rose-300 font-semibold">Grants 3 seconds of invincibility and deals contact damage.</span> Reflects enemy bullets if you also have Canceller, and the item slot shows a timer while active. <span className="text-rose-300 font-semibold">Last Stand: No additional bonus.</span></p></li>
                <li className="flex items-center"><OneUpIcon className="w-8 h-8 mr-4 flex-shrink-0" /><p><span className="font-bold">1UP (Passive):</span> <span className="text-rose-300 font-semibold">Adds one extra life.</span> <span className="text-rose-300 font-semibold">Last Stand: Restores a life and exits Last Stand when picked up.</span></p></li>
            </ul>
        </div>
        <div>
            <h3 className="text-2xl font-orbitron text-red-400 mb-4 text-center md:text-left">NORMAL SHOOTERS</h3>
             <ul className="space-y-3 text-white">
                <li className="flex items-center"><span className="font-orbitron font-bold text-3xl mr-4 text-fuchsia-400 w-8 text-center flex-shrink-0">敵</span><p><span className="font-bold">Homing:</span> Fires projectiles that track the player.</p></li>
                <li className="flex items-center"><span className="font-orbitron font-bold text-3xl mr-4 text-yellow-400 w-8 text-center flex-shrink-0">敵</span><p><span className="font-bold">Straight Down:</span> Fires projectiles straight down.</p></li>
                <li className="flex items-center"><span className="font-orbitron font-bold text-3xl mr-4 text-orange-400 w-8 text-center flex-shrink-0">敵</span><p><span className="font-bold">Delayed Homing:</span> Projectiles pause, then rush towards the player.</p></li>
                <li className="flex items-center"><span className="font-orbitron font-bold text-3xl mr-4 text-teal-400 w-8 text-center flex-shrink-0">敵</span><p><span className="font-bold">Spiral:</span> Fires projectiles in a spreading spiral pattern.</p></li>
                <li className="flex items-center"><span className="font-orbitron font-bold text-3xl mr-4 text-indigo-400 w-8 text-center flex-shrink-0">敵</span><p><span className="font-bold">Beat:</span> With every lyric drop, fires two shots toward the player’s flanks. Longer gaps mean faster bullets (up to 3× speed).</p></li>
                <li className="flex items-center"><span className="font-orbitron font-bold text-3xl mr-4 text-amber-400 w-8 text-center flex-shrink-0">敵</span><p><span className="font-bold">Side:</span> Launches paired shots from its left and right sides that fan outward.</p></li>
                <li className="flex items-center"><span className="font-orbitron font-bold text-3xl mr-4 text-rose-400 w-8 text-center flex-shrink-0">敵</span><p><span className="font-bold">Deceleration:</span> Sends a blisteringly fast homing shot that slows to a crawl near the player.</p></li>
            </ul>
        </div>
        <div className="md:col-span-2 pt-4 border-t-2 border-slate-700">
            <h3 className="text-2xl font-orbitron text-purple-400 mb-4 text-center">ELITE SHOOTERS (Appear after 50% progress, 3 hits to defeat)</h3>
             <ul className="space-y-3 text-white">
                <li className="flex items-center"><span className="font-orbitron font-bold text-4xl mr-4 text-rose-500 w-10 text-center flex-shrink-0">敵</span><p><span className="font-bold">Magic Shooter:</span> Rapidly fires projectiles, changing attack patterns with every shot.</p></li>
                <li className="flex items-center"><span className="font-orbitron font-bold text-4xl mr-4 text-amber-500 w-10 text-center flex-shrink-0">敵</span><p><span className="font-bold">Gatling Shooter:</span> Fires a quick burst of 5 projectiles straight down.</p></li>
                <li className="flex items-center"><span className="font-orbitron font-bold text-4xl mr-4 text-lime-500 w-10 text-center flex-shrink-0">敵</span><p><span className="font-bold">Landmine Shooter:</span> Deploys stationary mines. Triggering a mine with your shot causes it to explode into a 5-way burst.</p></li>
                <li className="flex items-center"><span className="font-orbitron font-bold text-4xl mr-4 text-cyan-300 w-10 text-center flex-shrink-0">敵</span><p><span className="font-bold">Laser Shooter:</span> Aims with a guide line, then fires a devastating laser beam.</p></li>
                <li className="flex items-center"><span className="font-orbitron font-bold text-4xl mr-4 text-sky-400 w-10 text-center flex-shrink-0">敵</span><p><span className="font-bold">Circle Shooter:</span> Fires a guided orb that circles the player once before plunging straight downward.</p></li>
            </ul>
        </div>
        <div className="md:col-span-2 pt-4 border-t-2 border-slate-700">
            <h3 className="text-2xl font-orbitron text-amber-400 mb-4 text-center">LAST STAND</h3>
            <p className="text-center text-white mb-4">When down to your last life, your ship receives a massive power boost!</p>
            <ul className="space-y-2 text-white list-disc list-inside">
                <li>If your special item slot is empty, you receive a free Bomb or Laser.</li>
                <li>Diagonal Shot fires every 2nd shot.</li>
                <li>Side Shot fires with every shot.</li>
                <li>Canceller Shot's damage nullification chance increases to 35%.</li>
            </ul>
        </div>
        <div className="md:col-span-2 pt-4 border-t-2 border-slate-700">
            <h3 className="text-2xl font-orbitron text-red-500 mb-4 text-center">SUPER HARD MODE (Enter ↑↑↓↓←→←→BA at READY)</h3>
             <ul className="space-y-2 text-white list-disc list-inside">
                <li>Start with a 15% boost to ship speed and projectile speed.</li>
                <li>Choose one starting item.</li>
                <li>Item drop rate is increased (every ~7% of enemies defeated).</li>
                <li>Elite Shooters appear from the beginning.</li>
                <li>Enemy shooter mutation chance is increased by 5%.</li>
                <li>After 50% song progress: All normal shooters become "Big" (3 hits to defeat) and enemy projectiles are 5% faster.</li>
            </ul>
        </div>
    </div>
);

const ControlsPanel = () => (
    <div className="mt-6 max-w-2xl mx-auto p-4 bg-slate-800 bg-opacity-70 rounded-lg text-left">
        <h3 className="text-2xl font-orbitron text-cyan-400 mb-4 text-center">CONTROLS</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-white">
            <div>
                <h4 className="font-bold text-lg mb-2 text-sky-300">MOVEMENT</h4>
                <ul className="space-y-1">
                    <li>↑/W - Move Up</li>
                    <li>↓/S - Move Down</li>
                    <li>←/A - Move Left</li>
                    <li>→/D - Move Right</li>
                </ul>
            </div>
            <div>
                <h4 className="font-bold text-lg mb-2 text-sky-300">ACTIONS</h4>
                <ul className="space-y-1">
                    <li>SPACE - Fire Main Weapon</li>
                    <li>SHIFT/TAB - Activate Special Item</li>
                    <li>BACKSPACE (1.5s) - Return to READY Screen</li>
                </ul>
            </div>
        </div>
    </div>
);

const getItemIcon = (itemType: ItemType, props?: React.SVGProps<SVGSVGElement>) => {
    const iconProps = { className: "w-6 h-6 mr-3 flex-shrink-0", ...props };
    switch (itemType) {
        case 'BOMB': return <BombIcon {...iconProps} />;
        case 'LASER_BEAM': return <LaserIcon {...iconProps} />;
        case 'PHASE_SHIELD': return <PhaseShieldIcon {...iconProps} />;
        case 'SPEED_UP': return <SpeedUpIcon {...iconProps} />;
        case 'DIAGONAL_SHOT': return <DiagonalShotIcon {...iconProps} />;
        case 'ONE_UP': return <OneUpIcon {...iconProps} />;
        case 'SIDE_SHOT': return <SideShotIcon {...iconProps} />;
        case 'CANCELLER_SHOT': return <CancellerShotIcon {...iconProps} />;
        case 'RICOCHET_SHOT': return <RicochetShotIcon {...iconProps} />;
        default: return null;
    }
};

const StatsPanel = ({ stats }: { stats: GameStats }) => {
    const defeatRate = stats.totalEnemies > 0 ? ((stats.enemiesDefeated / stats.totalEnemies) * 100).toFixed(1) : '0.0';
    const collectedItems = Object.entries(stats.itemsCollected);
    let progressColorClass;
    if (stats.songProgressPercentage >= 100) {
        progressColorClass = 'bg-rainbow-gradient';
    } else if (stats.songProgressPercentage >= 90) {
        progressColorClass = 'bg-gradient-to-r from-red-500 to-orange-500';
    } else if (stats.songProgressPercentage >= 50) {
        progressColorClass = 'bg-gradient-to-r from-yellow-400 to-amber-300';
    } else {
        progressColorClass = 'bg-gradient-to-r from-sky-400 to-cyan-300';
    }

    return (
        <div className="mt-8 text-left max-w-md mx-auto p-6 bg-slate-800 bg-opacity-80 rounded-lg border border-slate-600">
            <h3 className="text-2xl font-orbitron text-center text-sky-300 mb-4">RESULTS</h3>
            
            <div className="mb-4">
                <p className="font-bold mb-1 text-sm text-slate-300">Song Progress:</p>
                <div className="relative w-full bg-slate-700 rounded-full h-4 border-2 border-slate-500 overflow-hidden">
                    <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-400 opacity-50 z-10"></div>
                    <div className={`${progressColorClass} h-full rounded-full transition-all duration-200`} style={{ width: `${stats.songProgressPercentage}%` }}></div>
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white text-shadow-md">
                        {Math.floor(stats.songProgressPercentage)}%
                    </div>
                </div>
            </div>

            <div className="space-y-2 text-lg">
                <p><strong>Final Score:</strong> <span className="float-right text-white font-bold">{stats.score}</span></p>
                <p><strong>Enemies Defeated:</strong> <span className="float-right text-white font-bold">{stats.enemiesDefeated} / {stats.totalEnemies} ({defeatRate}%)</span></p>
                <div>
                    <p className="font-bold mb-2">Items Collected:</p>
                    {collectedItems.length > 0 ? (
                        <ul className="pl-4 space-y-1">
                            {collectedItems.map(([item, count]) => (
                                <li key={item} className="flex items-center">
                                    {getItemIcon(item as ItemType)}
                                    <span className="capitalize">{item.replace(/_/g, ' ').toLowerCase()}</span>
                                    <span className="ml-auto text-white font-bold">x {count}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="pl-4 text-slate-400">None</p>
                    )}
                </div>
            </div>
        </div>
    );
};

const SongInfo = ({ metadata }: { metadata: SongMetadata }) => (
    <div className="flex flex-col items-center justify-center mb-8 p-4 bg-black bg-opacity-20 rounded-lg">
        {metadata.picture && (
            <img src={metadata.picture} alt="Album Art" className="w-40 h-40 object-cover rounded-lg shadow-lg mb-4" />
        )}
        <h2 className="text-3xl font-bold font-orbitron text-white text-center">{metadata.title}</h2>
    </div>
);

const ItemSelection = ({ onSelect }: { onSelect: (item: ItemType) => void }) => {
    const items: ItemType[] = ['SPEED_UP', 'DIAGONAL_SHOT', 'SIDE_SHOT', 'CANCELLER_SHOT', 'RICOCHET_SHOT', 'ONE_UP', 'BOMB', 'PHASE_SHIELD', 'LASER_BEAM'];
    
    return (
        <div className="p-6 bg-slate-900 border-2 border-red-500 rounded-lg mt-6">
            <h2 className="text-3xl font-orbitron text-red-400 mb-6 text-center animate-pulse">CHOOSE YOUR STARTING ITEM</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {items.map(item => (
                    <button
                        key={item}
                        onClick={() => onSelect(item)}
                        className="flex flex-col items-center justify-center p-4 bg-slate-800 rounded-lg hover:bg-slate-700 hover:border-sky-400 border-2 border-slate-600 transition-all duration-200"
                    >
                        {getItemIcon(item, { className: "w-12 h-12" })}
                        <span className="mt-2 font-bold text-white text-sm uppercase">{item.replace(/_/g, ' ')}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default function App(): React.ReactNode {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => detectDesktop());
  const [isWindowLargeEnough, setIsWindowLargeEnough] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= MIN_VIEWPORT_WIDTH && window.innerHeight >= MIN_VIEWPORT_HEIGHT;
  });
  const [gameStatus, setGameStatus] = useState<GameStatus>('loading');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const [metadata, setMetadata] = useState<SongMetadata | null>(null);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [isSuperHardMode, setIsSuperHardMode] = useState(false);
  const [initialItem, setInitialItem] = useState<ItemType | null>(null);

  const handleFilesLoaded = useCallback((audioUrl: string, lyrics: LyricLine[], metadata: SongMetadata) => {
    setAudioUrl(audioUrl);
    setLyrics(lyrics);
    setMetadata(metadata);
    setGameStatus('ready');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let rafId = 0;
    const updateLayoutState = () => {
      rafId = 0;
      setIsDesktop(detectDesktop());
      setIsWindowLargeEnough(window.innerWidth >= MIN_VIEWPORT_WIDTH && window.innerHeight >= MIN_VIEWPORT_HEIGHT);
    };
    const handleResize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateLayoutState);
    };
    updateLayoutState();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  useEffect(() => {
    if (gameStatus !== 'ready' || isSuperHardMode) return;

    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let keySequence: string[] = [];

    const handler = (e: KeyboardEvent) => {
      if (gameStatus !== 'ready') return;
      keySequence.push(e.key.toLowerCase());
      keySequence = keySequence.slice(-konamiCode.length);
      
      let match = true;
      for(let i = 0; i < konamiCode.length; i++) {
        if(keySequence[i] !== konamiCode[i].toLowerCase()) {
          match = false;
          break;
        }
      }

      if (match) {
        setIsSuperHardMode(true);
        keySequence = [];
      }
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gameStatus, isSuperHardMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleGameStart = useCallback((item?: ItemType) => {
    if (audioUrl && lyrics) {
      setGameStats(null);
      if(isSuperHardMode && item) {
        setInitialItem(item);
      }
      setGameStatus('playing');
    }
  }, [audioUrl, lyrics, isSuperHardMode]);

  const handleEndGame = useCallback((stats: GameStats, status: 'cleared' | 'gameOver') => {
    setGameStats(stats);
    setGameStatus(status);
  }, []);
  
  const handleRestart = useCallback(() => {
     setGameStatus('ready');
     setIsSuperHardMode(false);
     setInitialItem(null);
  }, []);

  const resetToUploader = useCallback(() => {
    setAudioUrl(null);
    setLyrics(null);
    setMetadata(null);
    setGameStatus('loading');
    setGameStats(null);
    setIsSuperHardMode(false);
    setInitialItem(null);
  }, []);


  const renderContent = () => {
    switch (gameStatus) {
      case 'loading':
        return <FileUploader onFilesLoaded={handleFilesLoaded} />;
      case 'ready':
        return (
          <div className="text-center text-white">
            <h1 className="text-5xl font-bold font-orbitron mb-4 text-shadow-neon">
                {isSuperHardMode ? <span className="text-red-500 animate-pulse">SUPER HARD MODE</span> : 'LYRIC SHOOTER'}
            </h1>
            {metadata ? <SongInfo metadata={metadata} /> : <p className="mb-8 text-sky-300">Files loaded. Are you ready?</p>}
            
            {isSuperHardMode ? (
              <ItemSelection onSelect={handleGameStart} />
            ) : (
              <button
                onClick={() => handleGameStart()}
                className="px-8 py-4 bg-sky-500 text-white font-bold rounded-lg hover:bg-sky-400 transition-all duration-300 text-2xl font-orbitron box-shadow-neon"
              >
                START GAME
              </button>
            )}

             <button
              onClick={resetToUploader}
              className="mt-4 block mx-auto px-4 py-2 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-500 transition-all duration-300"
            >
              Upload Different Files
            </button>
            <ControlsPanel />
            <InfoPanel />
          </div>
        );
      case 'playing':
        if (audioUrl && lyrics) {
          return <GameScreen audioUrl={audioUrl} lyrics={lyrics} onEndGame={handleEndGame} superHardMode={isSuperHardMode} initialItem={initialItem ?? undefined}/>;
        }
        return null; // Should not happen
      case 'cleared':
      case 'gameOver':
        const isClear = gameStatus === 'cleared';
        return (
          <div className="text-center text-white bg-black bg-opacity-70 p-10 rounded-xl">
            <h1 className={`text-6xl font-bold font-orbitron mb-4 ${isClear ? 'text-cyan-400' : 'text-red-500'}`}>
                {isClear ? 'STAGE CLEAR' : 'GAME OVER'}
            </h1>
            {metadata && <SongInfo metadata={metadata} />}
            {gameStats && <StatsPanel stats={gameStats} />}
            <button
              onClick={handleRestart}
              className="mt-8 px-8 py-4 bg-sky-500 text-white font-bold rounded-lg hover:bg-sky-400 transition-all duration-300 text-2xl font-orbitron box-shadow-neon"
            >
              PLAY AGAIN
            </button>
            <button
              onClick={resetToUploader}
              className="mt-4 block mx-auto px-4 py-2 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-500 transition-all duration-300"
            >
              Upload Different Files
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  if (!isDesktop) {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center text-white bg-black bg-opacity-70 p-8 rounded-2xl space-y-4">
          <h1 className="text-3xl font-orbitron text-sky-300">Desktop Only</h1>
          <p className="text-slate-200 leading-relaxed">
            This game relies on keyboard controls and mouse precision. Please come back on a desktop computer to play.
          </p>
          <p className="text-slate-400 text-sm">Touch devices are not supported at this time.</p>
        </div>
      </main>
    );
  }

  if (!isWindowLargeEnough) {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center text-white bg-black bg-opacity-70 p-8 rounded-2xl space-y-4">
          <h1 className="text-3xl font-orbitron text-amber-300">Make The Window Larger</h1>
          <p className="text-slate-200 leading-relaxed">
            This game needs at least {MIN_VIEWPORT_WIDTH} × {MIN_VIEWPORT_HEIGHT} pixels of space. Maximize or resize your browser window and try again.
          </p>
          <p className="text-slate-400 text-sm">Tip: Fullscreen (F11) usually provides enough room.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      {renderContent()}
    </main>
  );
}
