

// 1. Блокировка контекстного меню (правая кнопка мыши и долгий тап)
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
}, false);

// 2. Блокировка двойного тапа (Double tap to zoom)
// Большинство браузеров уже не зумят, если есть viewport user-scalable=no, 
// но этот код — 100% гарантия.
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// 3. Блокировка жеста Pinch-to-zoom (зум двумя пальцами)
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

// 4. Блокировка зума через колесико мыши + Ctrl
document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
    }
}, { passive: false });

// 5. Блокировка горячих клавиш зума (Ctrl +, Ctrl -, Ctrl 0)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
    }
});


// --- ИНИЦИАЛИЗАЦИЯ VK И SUPABASE ---
const vkBridge = window.vkBridge;
let isVkMode = false; 
let vkUserId = null; // Понадобится для сохранения в Supabase

// Сюда потом вставишь свои ключи от Supabase
const SUPABASE_URL = 'https://hgqhtlyxxdvrydsoitmm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhncWh0bHl4eGR2cnlkc29pdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDUyNzAsImV4cCI6MjA5MDM4MTI3MH0.BELN-3cf4l2tLQyPRdkZmdX0B6iCL3Ql5DrfZ9bQvFI';
// Изменили название на supabaseClient, чтобы не конфликтовать с библиотекой
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;





let gameMode = 'standard';
let middlegamesData = [];

// Загружаем позиции при загрузке
fetch('data/middlegame.json')  // ← обнови путь если нужно
    .then(r => r.json())
    .then(data => {
        middlegamesData = data;
        console.log(`Загружено ${data.length} позиций`);
    })
    .catch(err => console.log('middlegame.json не найден:', err));

function selectGameMode(mode) {
    gameMode = mode;
    startGameVsComputer();
}

let game = new Chess(); 
let player = null;
let lang = 'ru'; 
let isLocked = true; 
let selectedSq = null; 
let lastMoveSquares = [];
let totalScore = 0;
let pendingPromotion = null;
let aiMoveTimeout = null; // Для остановки ожидания хода ИИ

let selectedTimeMinutes = parseInt(localStorage.getItem('chess-time-limit')) || 0;
let playerTimeLeft = 0; 
let aiTimeLeft = 0;
let timerInterval = null;
let gameResultData = null;

let isSoundEnabled = true;

let canCancelNewGame = true;


const mockLeaderboard = [
    { name: "А. КАрпик",       score: 2850, avatar: "img/avatars/2.png" },
    { name: "К. Магнусен",       score: 2845, avatar: "img/avatars/9.png"  },
    { name: "Г. Гаспаров",         score: 2790, avatar: "img/avatars/8.png"  },
    { name: "М. Котвинник",     score: 1240, avatar: "img/avatars/7.png"  },
    { name: "Я. Всёпомнящий", score: 980,  avatar: "img/avatars/6.png"  },
    { name: "Б. Спасайся",     score: 870,  avatar: "img/avatars/5.png"  },
    { name: "М. Вдаль",       score: 720,  avatar: "img/avatars/3.png"  },
];

// Статистика игрока
let playerStats = {
    totalGames: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastResult: null,
    winsAsWhite: 0,
    gamesAsWhite: 0,
    winsAsBlack: 0,
    gamesAsBlack: 0
};

function saveToCloud() {
    if (!isVkMode) return;
    const data = {
        playerStats, totalScore,
        theme: localStorage.getItem('chess-theme'),
        boardTheme: localStorage.getItem('chess-board-theme'),
        pieceSet: localStorage.getItem('chess-piece-set'),
        sound: localStorage.getItem('chess-sound-enabled'),
        aiLevel: localStorage.getItem('chess-ai-level'),
        timeLimit: localStorage.getItem('chess-time-limit'),
        gameInProgress: localStorage.getItem('gameInProgress')
    };
    vkBridge.send('VKWebAppStorageSet', {
        key: 'chess_save',
        value: JSON.stringify(data)
    }).catch(err => console.warn('VK Cloud save error', err));
}

function loadFromCloud() {
    if (!isVkMode) {
        loadStats();
        return;
    }
    vkBridge.send('VKWebAppStorageGet', { keys: ['chess_save'] }).then(data => {
        if (data.keys && data.keys[0].value !== '') {
            const parsed = JSON.parse(data.keys[0].value);
            if (parsed.playerStats) playerStats = parsed.playerStats;
            if (parsed.totalScore) totalScore = parsed.totalScore;
            if (parsed.theme) { localStorage.setItem('chess-theme', parsed.theme); document.documentElement.setAttribute('data-theme', parsed.theme); }
            if (parsed.boardTheme) localStorage.setItem('chess-board-theme', parsed.boardTheme);
            if (parsed.pieceSet) { localStorage.setItem('chess-piece-set', parsed.pieceSet); currentPieceSet = parsed.pieceSet; }
            if (parsed.sound) localStorage.setItem('chess-sound-enabled', parsed.sound);
            if (parsed.aiLevel) localStorage.setItem('chess-ai-level', parsed.aiLevel);
            if (parsed.timeLimit) localStorage.setItem('chess-time-limit', parsed.timeLimit);
            if (parsed.gameInProgress) localStorage.setItem('gameInProgress', parsed.gameInProgress);
        }
        displayStats();
        loadSoundSettings();
        loadBoardTheme();
        showStartAd();
    }).catch(() => {
        loadStats();
        showStartAd();
    });
}

function loadStats() {
    const saved = localStorage.getItem('playerStats');
    if (saved) {
        const parsed = JSON.parse(saved);
        playerStats = {
            totalGames: parsed.totalGames || 0,
            wins: parsed.wins || 0,
            losses: parsed.losses || 0,
            draws: parsed.draws || 0,
            currentStreak: parsed.currentStreak || 0,
            bestStreak: parsed.bestStreak || 0,
            lastResult: parsed.lastResult || null,
            winsAsWhite: parsed.winsAsWhite || 0,
            gamesAsWhite: parsed.gamesAsWhite || 0,
            winsAsBlack: parsed.winsAsBlack || 0,
            gamesAsBlack: parsed.gamesAsBlack || 0
        };
    }

    // Проверяем незавершённую партию
    if (localStorage.getItem('gameInProgress') === 'true') {
        localStorage.removeItem('gameInProgress');
        updateStats('loss'); // засчитываем поражение, displayStats вызовется внутри
        return;
    }

    displayStats();
}

// Сохраняем статистику в localStorage
function saveStats() {
    localStorage.setItem('playerStats', JSON.stringify(playerStats));
    saveToCloud();
}

// Обновляем статистику и отображение
function updateStats(result) {
    playerStats.totalGames++;

    if (result === 'win') {
        playerStats.wins++;
        if (playerColor === 'w') { playerStats.winsAsWhite++; playerStats.gamesAsWhite++; }
        else { playerStats.winsAsBlack++; playerStats.gamesAsBlack++; }
        if (playerStats.lastResult === 'win') {
            playerStats.currentStreak++;
        } else {
            playerStats.currentStreak = 1;
        }
        if (playerStats.currentStreak > playerStats.bestStreak) {
            playerStats.bestStreak = playerStats.currentStreak;
        }
    } else {
        if (result === 'loss') playerStats.losses++;
        else if (result === 'draw') playerStats.draws++;
        if (playerColor === 'w') playerStats.gamesAsWhite++;
        else playerStats.gamesAsBlack++;
        playerStats.currentStreak = 0;
    }

    playerStats.lastResult = result;
    saveStats();
    calculateAndAddScore(result);
    displayStats();
}

function displayStats() {
    const t = i18n[lang] || i18n.en; // Подключаем словарь
    const s = playerStats;

    const winrate = s.totalGames > 0 ? ((s.wins / s.totalGames) * 100).toFixed(1) : 0;
    const total = s.wins + s.losses + s.draws;
    const wrW = s.gamesAsWhite > 0 ? Math.round(s.winsAsWhite / s.gamesAsWhite * 100) : 0;
    const wrB = s.gamesAsBlack > 0 ? Math.round(s.winsAsBlack / s.gamesAsBlack * 100) : 0;

    const p = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    // Боковая панель (Числа)
    p('stats-total', s.totalGames);
    p('stats-wins', s.wins);
    p('stats-losses', s.losses);
    p('stats-draws', s.draws);
    p('stats-winrate', winrate + '%');
    p('stats-best-streak', s.bestStreak);

    // Серия (боковая панель)
    const streakEl = document.getElementById('stats-streak');
    if (streakEl) {
        if (s.currentStreak >= 2) {
            streakEl.textContent = `🔥 ${s.currentStreak} ${t.streakFire}`;
            streakEl.style.color = '#f97316';
        } else if (s.currentStreak === 1) {
            streakEl.textContent = `✅ 1`;
            streakEl.style.color = '#16a34a';
        } else {
            streakEl.textContent = t.noStreak;
            streakEl.style.color = 'var(--gray-500)';
        }
    }

    // Полоски W/L/D и цвета (код остается прежним)
    if (total > 0) {
        const wb = document.getElementById('bar-wins');
        const db = document.getElementById('bar-draws');
        const lb = document.getElementById('bar-losses');
        if (wb) wb.style.width = (s.wins / total * 100) + '%';
        if (db) db.style.width = (s.draws / total * 100) + '%';
        if (lb) lb.style.width = (s.losses / total * 100) + '%';
    }

    // Обновление полосок цвета (Белые/Черные)
    const elW = document.getElementById('bar-white-fill');
    const elB = document.getElementById('bar-black-fill');
    const elWt = document.getElementById('bar-white-text');
    const elBt = document.getElementById('bar-black-text');
    if (elW) elW.style.width = wrW + '%';
    if (elB) elB.style.width = wrB + '%';
    if (elWt) elWt.textContent = wrW + '%';
    if (elBt) elBt.textContent = wrB + '%';

    // Модальное окно (Числа)
    p('modal-stats-total', s.totalGames);
    p('modal-stats-wins', s.wins);
    p('modal-stats-losses', s.losses);
    p('modal-stats-draws', s.draws);
    p('modal-stats-winrate', winrate + '%');
    p('modal-stats-best-streak', s.bestStreak);

    // Серия (модальное окно)
    const mStreak = document.getElementById('modal-stats-streak');
    if (mStreak) {
        // Копируем текст и цвет из боковой панели, который мы уже перевели выше
        mStreak.textContent = streakEl ? streakEl.textContent : (lang === 'ru' ? '—' : '-');
        mStreak.style.color = streakEl ? streakEl.style.color : 'var(--gray-500)';
    }

    // Полоски в модалке (код остается прежним)
    if (total > 0) {
        const mwb = document.getElementById('modal-bar-wins');
        const mdb = document.getElementById('modal-bar-draws');
        const mlb = document.getElementById('modal-bar-losses');
        if (mwb) mwb.style.width = (s.wins / total * 100) + '%';
        if (mdb) mdb.style.width = (s.draws / total * 100) + '%';
        if (mlb) mlb.style.width = (s.losses / total * 100) + '%';
    }

    const mwf = document.getElementById('modal-bar-white-fill');
    const mbf = document.getElementById('modal-bar-black-fill');
    const mwt = document.getElementById('modal-bar-white-text');
    const mbt = document.getElementById('modal-bar-black-text');
    if (mwf) mwf.style.width = wrW + '%';
    if (mbf) mbf.style.width = wrB + '%';
    if (mwt) mwt.textContent = wrW + '%';
    if (mbt) mbt.textContent = wrB + '%';
}
// --- НОВЫЕ ФУНКЦИИ МОДАЛЬНОГО ОКНА СТАТИСТИКИ ---
function openStatsModal() {
    stopGameplay();
    displayStats(); // на всякий случай обновляем цифры перед открытием
    const modal = document.getElementById('stats-modal');
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
}

function closeStatsModal() {
    document.getElementById('stats-modal').style.display = 'none';
    startGameplay();
}

// Инициализируем воркер
const stockfishWorker = new Worker('engine-worker.js');
const lozzaWorker = new Worker('lozza-worker.js');

// Временная проверка
stockfishWorker.postMessage('uci');
stockfishWorker.postMessage('setoption name Hash value 16'); 
stockfishWorker.postMessage('isready');
stockfishWorker.onerror = function(e) { console.error('Воркер ошибка:', e); };


const boardEl = document.getElementById('board');
const follower = document.getElementById('drag-follower');


let playerColor = 'w'; // Цвет игрока по умолчанию
let isBoardFlipped = false; // Перевернута ли доска
let currentAiElo = 600;
let currentAiDepth = 1;

const aiLevels = {
    1:  { nameRu: "Б. Фишечка", nameEn: "Bobby Little", labelRu: "Новичок", labelEn: "Novice", engine: "lozza", depth: 1 },
    2:  { nameRu: "А. Карпик", nameEn: "Carp-y", labelRu: "Начинающий", labelEn: "Beginner", engine: "lozza", depth: 1 },
    3:  { nameRu: "М. Вдаль", nameEn: "Magnus Move", labelRu: "Любитель", labelEn: "Casual", engine: "lozza", depth: 2 },
    4:  { nameRu: "В. Крам-ник!", nameEn: "Big Vlad", labelRu: "Разрядник", labelEn: "Club Player", engine: "sf", elo: 600, movetime: 500 },
    5:  { nameRu: "Б. Спасайся", nameEn: "Boris Escape", labelRu: "КМС", labelEn: "Expert", engine: "sf", elo: 1000, movetime: 2000 },
    6:  { nameRu: "Я. Всёпомнящий", nameEn: "Ian Memory", labelRu: "Мастер", labelEn: "Master", engine: "sf", elo: 1400, movetime: 1000 },
    7:  { nameRu: "М. Котвинник", nameEn: "M. Catvinnik", labelRu: "Гроссмейстер", labelEn: "Grandmaster", engine: "sf", elo: 1800, movetime: 1500 },
    8:  { nameRu: "Г. Гаспаров", nameEn: "Garry Gas", labelRu: "Чемпион", labelEn: "Champion", engine: "sf", elo: 2200, movetime: 2000 },
    9:  { nameRu: "К. Магнусен", nameEn: "M. Carlson", labelRu: "Суперкомп", labelEn: "Supercomputer", engine: "sf", elo: 2600, movetime: 3000 },
    10: { nameRu: "Сток-Фишка", nameEn: "Stock-Fish", labelRu: "Бог Шахмат", labelEn: "Chess God", engine: "sf", movetime: 5000 },
};
let fenHistory = []; // Массив всех FEN-состояний
let currentViewIndex = -1; // Какой ход мы сейчас смотрим

let moveHistoryLog = [];
let movesObjectsLog = [];

let lastHistoryActionTime = 0; // Время последнего нажатия
let isAnimatingHistory = false; // Флаг, чтобы анимации не накладывались

const pieceSets = {
    default: {
        'P': 'img/p/wP.svg', 'R': 'img/p/wR.svg', 'N': 'img/p/wN.svg',
        'B': 'img/p/wB.svg', 'Q': 'img/p/wQ.svg', 'K': 'img/p/wK.svg',
        'p': 'img/p/bP.svg', 'r': 'img/p/bR.svg', 'n': 'img/p/bN.svg',
        'b': 'img/p/bB.svg', 'q': 'img/p/bQ.svg', 'k': 'img/p/bK.svg'
    },
    merida: {
        'P': 'img/p/Merida/Chess_plt45.svg', 'R': 'img/p/Merida/Chess_rlt45.svg',
        'N': 'img/p/Merida/Chess_nlt45.svg', 'B': 'img/p/Merida/Chess_blt45.svg',
        'Q': 'img/p/Merida/Chess_qlt45.svg', 'K': 'img/p/Merida/Chess_klt45.svg',
        'p': 'img/p/Merida/Chess_pdt45.svg', 'r': 'img/p/Merida/Chess_rdt45.svg',
        'n': 'img/p/Merida/Chess_ndt45.svg', 'b': 'img/p/Merida/Chess_bdt45.svg',
        'q': 'img/p/Merida/Chess_qdt45.svg', 'k': 'img/p/Merida/Chess_kdt45.svg'
    }
};

let currentPieceSet = localStorage.getItem('chess-piece-set') || 'default';

function getPieceImage(p) { return pieceSets[currentPieceSet][p]; }

function changePieceSet(set) {
    currentPieceSet = set;
    localStorage.setItem('chess-piece-set', set);
    //Object.assign(PIECE_IMAGES, pieceSets[set]);
    renderBoard();
    syncSettingsUI();
}
function updatePieceCellColor() {
    const board = document.getElementById('board');
    const dark = getComputedStyle(board).getPropertyValue('--board-dark').trim();
    document.documentElement.style.setProperty('--current-board-dark', dark);
}


const audioMove = new Audio('sounds/Move.ogg');
const audioCapture = new Audio('sounds/Capture.ogg');
const audioError = new Audio('sounds/Error.ogg');

const i18n = {
    ru: {
        title: "Шахматы",
        standard: "Классика",
        fisher: "Фишер 960",
        randomPos: "Случайная позиция",
        stats: "Статистика",
        rating: "Рейтинг",
        theme: "Тема",
        sound: "Звук",
        soundOn: "Звук: Вкл",
        soundOff: "Звук: Выкл",
        player: "Игрок",
        computer: "Компьютер",
        menu: "Меню",
        undo: "Отмена",
        play: "Играть",
        view: "Вид",
        newGame: "Настройки игры",
        timeControl: "Контроль времени",
        opponent: "Выбор противника",
        toMenu: "В меню",
        done: "Готово",
        settings: "Оформление",
        pieceSet: "Набор фигур",
        boardColor: "Цвет доски",
        darkTheme: "Тёмная тема",
        darkDesc: "Бережет глаза ночью",
        soundEffects: "Звуковые эффекты",
        soundDesc: "Ходы и взятия",
        win: "Вы победили!",
        lose: "Вы проиграли!",
        draw: "Ничья!",
        checkmate: "Мат",
        stalemate: "Пат",
        timeOutWin: "Время вышло! Вы победили.",
        timeOutLose: "Время вышло! Вы проиграли.",
        resigned: "Вы сдались. Компьютер победил!",
        confirmResign: "Вы уверены, что хотите сдаться?",
        gamesPlayed: "Партий сыграно",
        winRate: "Процент побед",
        streak: "Серия",
        bestStreak: "Лучшая серия",
        winCount: "В",
        drawCount: "Н",
        lossCount: "П",
        noStreak: "нет серии",
        streakFire: "подряд",
        adviceTitle: "Топ 7",
        points: "Очки",
        chess: "Шахматы",
        gamesPlayed: "Партий сыграно",
        streak: "Серия",
        bestStreak: "Лучшая серия",
        winsShort: "В",
        drawsShort: "Н",
        lossesShort: "П",
        top7: "🏆 Топ 7",
        points: "Очки",
        close: "Закрыть",
        me: "Вы",
        noStreak: "нет серии",
        streakFire: "подряд",
        me: "Вы",
        streakFire: "подряд",
        noStreak: "нет серии",
        established: "ОСН. 2026 • ФИШЧЕСС",
        loading: "Загрузка",
         newGameAction: "Новая игра",
         confirmExit: "Игра не окончена. Вы уверены, что хотите выйти в меню? (будет засчитано поражение)",
        exitBtn: "Выйти",
        stayBtn: "Остаться",
        advices: [
            "Развивайте легкие фигуры (коней и слонов) в начале игры.",
            "Боритесь за центр доски своими пешками.",
            "Сделайте рокировку как можно раньше, чтобы обезопасить короля.",
            "Не выводите ферзя слишком рано.",
            "Следите за тем, какие поля атакует ваш противник.",
            "Ладьи любят открытые вертикали."
        ]
    },
    en: {
        title: "Chess",
        standard: "Classic",
        fisher: "Fisher 960",
        randomPos: "Random Position",
        stats: "Statistics",
        rating: "Leaderboard",
        theme: "Theme",
        sound: "Sound",
        soundOn: "Sound: On",
        soundOff: "Sound: Off",
        player: "Player",
        computer: "Computer",
        menu: "Menu",
        undo: "Undo",
        play: "Play",
        view: "Visuals",
        newGame: "Game Settings",
        timeControl: "Time Control",
        opponent: "Opponent",
        toMenu: "To Menu",
        done: "Done",
        settings: "Appearance",
        pieceSet: "Piece Set",
        boardColor: "Board Color",
        darkTheme: "Dark Mode",
        darkDesc: "Saves your eyes at night",
        soundEffects: "Sound Effects",
        soundDesc: "Moves and captures",
        win: "You Win!",
        lose: "You Lose!",
        draw: "Draw!",
        checkmate: "Checkmate",
        stalemate: "Stalemate",
        timeOutWin: "Time's up! You win.",
        timeOutLose: "Time's up! You lose.",
        resigned: "You resigned. Computer wins!",
        confirmResign: "Are you sure you want to resign?",
        gamesPlayed: "Games Played",
        winRate: "Win Rate",
        streak: "Streak",
        bestStreak: "Best Streak",
        winCount: "W",
        drawCount: "D",
        lossCount: "L",
        noStreak: "no streak",
        streakFire: "in a row",
        adviceTitle: "Top 7",
        points: "Score",
        chess: "Chess",
        gamesPlayed: "Games Played",
        streak: "Streak",
        bestStreak: "Best Streak",
        winsShort: "W",
        drawsShort: "D",
        lossesShort: "L",
        top7: "🏆 Top 7",
        points: "Points",
        close: "Close",
        me: "You",
        noStreak: "no streak",
        streakFire: "in a row",
        me: "You",
        streakFire: "in a row",
        noStreak: "no streak",
        established: "EST. 2026 • FISHCHESS",
        loading: "Loading",
        newGameAction: "New Game",
        confirmExit: "The game is not over. Are you sure you want to exit to the menu? (a loss will be recorded)",
        exitBtn: "Exit",
        stayBtn: "Stay",
        advices: [
            "Develop your minor pieces (knights and bishops) early.",
            "Fight for the center of the board with your pawns.",
            "Castle as early as possible to keep your king safe.",
            "Don't bring your queen out too early.",
            "Always watch which squares your opponent is attacking.",
            "Rooks belong on open files."
        ]
    }
};


function playSound(audio) {
    if (isSoundEnabled && audio) {
        audio.pause();            // Останавливаем текущее воспроизведение
        audio.currentTime = 0;    // Сбрасываем в самое начало
        audio.play().catch(err => console.log("Sound play blocked")); // Играем
    }
}


function onEngineMessage(e) {

    if (gameResultData || game.game_over()) {
        console.log("Движок прислал ход после конца игры, игнорируем.");
        return; 
    }

    if (e.data.startsWith('bestmove')) {
        const moveStr = e.data.split(' ')[1];
        if (moveStr === '(none)' || moveStr === 'NULL') {
            checkStatus(); 
            return;
        }

        const currentLevel = parseInt(document.getElementById('level-slider').value);
        let finalMove = moveStr;
        let mistakeChance = 0;

        // Определяем вероятность ошибки в зависимости от уровня
        if (currentLevel === 1) mistakeChance = 0.60;      // 60%
        else if (currentLevel === 2) mistakeChance = 0.30; // 30%
        else if (currentLevel === 3) mistakeChance = 0.10; // 10%

        // Бросаем кубик: если выпало меньше шанса ошибки — делаем случайный ход
        if (Math.random() < mistakeChance) {
            const random = getRandomMove();
            if (random) {
                finalMove = random;
                console.log(`Уровень ${currentLevel}: ОШИБКА! Вместо лучшего хода сделан случайный.`);
            }
        }

        // Разбор и выполнение хода (неважно, лучшего или случайного)
        const from = finalMove.substring(0, 2);
        const to = finalMove.substring(2, 4);
        const promotion = finalMove.length === 5 ? finalMove[4] : 'q';
        
        executeAiMove(from, to, promotion);
    }
}


// Функция переключения звука
function toggleSound() {
    isSoundEnabled = !isSoundEnabled;
    localStorage.setItem('chess-sound-enabled', isSoundEnabled);
    updateSoundUI();
}

// Обновление иконок и текста
function updateSoundUI() {
    const t = i18n[lang] || i18n.en; // Добавляем получение словаря
    const soundOnIcon = document.querySelector('.sound-on-icon');
    const soundOffIcon = document.querySelector('.sound-off-icon');
    const statusText = document.getElementById('sound-status-text');

    if (isSoundEnabled) {
        if (soundOnIcon) soundOnIcon.classList.remove('hidden');
        if (soundOffIcon) soundOffIcon.classList.add('hidden');
        if (statusText) statusText.textContent = t.soundOn; // Используем перевод
    } else {
        if (soundOnIcon) soundOnIcon.classList.add('hidden');
        if (soundOffIcon) soundOffIcon.classList.remove('hidden');
        if (statusText) statusText.textContent = t.soundOff; // Используем перевод
    }
}

// Загрузка настроек звука при старте
function loadSoundSettings() {
    const savedSound = localStorage.getItem('chess-sound-enabled');
    if (savedSound !== null) {
        isSoundEnabled = (savedSound === 'true');
    }
    updateSoundUI();
}

// Добавьте вызов загрузки настроек в window.onload
// Найдите существующий window.onload и добавьте туда loadSoundSettings();

// Вспомогательная функция для получения случайного хода в формате UCI
function getRandomMove() {
    const allMoves = game.moves({ verbose: true });
    if (allMoves.length === 0) return null;

    // 1. Пытаемся найти все ходы, кроме ходов королем ('k')
    const nonKingMoves = allMoves.filter(m => m.piece !== 'k');

    // 2. Если есть выбор (кроме короля), берем из него. 
    // Если же ходить можно ТОЛЬКО королем (например, в эндшпиле), 
    // берем из всех ходов, чтобы игра не зависла.
    const movesToChooseFrom = nonKingMoves.length > 0 ? nonKingMoves : allMoves;

    const move = movesToChooseFrom[Math.floor(Math.random() * movesToChooseFrom.length)];
    
    // Возвращаем в формате UCI: "e2e4"
    return move.from + move.to + (move.promotion || '');
}

stockfishWorker.onmessage = onEngineMessage;
lozzaWorker.onmessage = onEngineMessage;

// Инициализация
stockfishWorker.postMessage('uci');
lozzaWorker.postMessage('uci');

// ДЛЯ LOZZA: Обязательно инициализируем хеш и новую игру
lozzaWorker.postMessage('setoption name Hash value 32'); // Выделяем 32МБ памяти
lozzaWorker.postMessage('ucinewgame');
lozzaWorker.postMessage('isready');


// --- 2. ИНИЦИАЛИЗАЦИЯ SDK ---
function initVK() {
    const browserLang = navigator.language || navigator.userLanguage || 'ru';
    lang = browserLang.startsWith('ru') ? 'ru' : 'en';
    applyTranslations(); 

    if (!vkBridge || window.location.protocol === 'file:') {
        loadStats();
        showStartMenu();
        renderLeaderboard();
        return;
    }

    vkBridge.send('VKWebAppInit').then(() => {
        isVkMode = true;

        vkBridge.send('VKWebAppGetUserInfo').then(async (user) => {
            player = user; 
            vkUserId = user.id;
            updatePlayerProfileUI();

            // 1. Ищем roomId
            const urlParams = new URLSearchParams(window.location.search);
            const roomId = window.location.hash.replace('#', '') || urlParams.get('room');

            if (roomId && roomId.startsWith('room_')) {
                console.log("Пытаемся зайти в комнату:", roomId);
                myColor = 'b';
                isBoardFlipped = true; 
                
                if (supabaseClient) {
                    // Скрываем загрузчик сразу
                    if (document.getElementById('loading-screen')) 
                        document.getElementById('loading-screen').style.display = 'none';

                    try {
                        await supabaseClient
                            .from('rooms')
                            .update({ 
                                black_id: String(vkUserId),
                                black_name: player.first_name,
                                black_avatar: player.photo_100
                            })
                            .eq('id', roomId);

                        joinRoom(roomId);
                        // ОЧЕНЬ ВАЖНО: Мы НЕ вызываем loadFromCloud здесь, чтобы не открылось меню
                        return; 
                    } catch (e) {
                        console.error("Ошибка входа:", e);
                    }
                }
            }

            // 2. Если ссылки нет — грузим как обычно
            loadFromCloud();
            renderLeaderboard();

        }).catch(err => {
            console.warn('Ошибка профиля:', err);
            loadStats();
            showStartMenu();
        });
    });
}

function applyTranslations() {
    const t = i18n[lang] || i18n.en;
    


    // Титлы и Меню
    const set = (id, text) => { const el = document.getElementById(id); if(el) el.textContent = text; };
    
    set('loading-text', t.loading + ": 0%");

    // Главный заголовок
    set('gm-main-title', t.chess);

    set('gm-subtitle', t.established);

    // Боковая панель статы
    set('label-stats-total', t.gamesPlayed);
    set('label-stats-w', t.winsShort);
    set('label-stats-d', t.drawsShort);
    set('label-stats-l', t.lossesShort);
    set('label-stats-streak', t.streak);
    set('label-stats-best', t.bestStreak);

    // Боковой лидерборд
    set('label-top7-title', t.top7);
    set('label-points-text', t.points);

        // Добавляем локализацию винрейта
    set('label-stats-winrate-text', t.winRate);
    set('label-modal-winrate-text', t.winRate);

    // Модалка статы
    set('modal-stats-title', t.stats);
    set('label-modal-total', t.gamesPlayed);
    set('label-modal-w', t.winsShort);
    set('label-modal-d', t.drawsShort);
    set('label-modal-l', t.lossesShort);
    set('label-modal-streak', t.streak);
    set('label-modal-best', t.bestStreak);
    set('btn-stats-close', t.close);

    // Модалка рейтинга
    set('modal-lb-title', t.rating);
    set('btn-lb-close', t.close);
    set('lbm-me-text', t.me);

    set('label-exit-confirm', t.confirmExit);
    set('btn-exit-stay', t.stayBtn);
    set('btn-exit-confirm', t.exitBtn);

    set('label-stats', t.stats);
    set('label-rating', t.rating);
    set('label-theme', t.theme);
    set('sound-status-text', isSoundEnabled ? t.soundOn : t.soundOff);
    
    // Кнопки игры
    set('btn-menu-text', t.menu);
    set('btn-undo-text', t.undo);
    set('btn-play-text', t.play);
    set('btn-view-text', t.view);
    
    // Модалка игры
    set('modal-title', t.newGame);
    set('modal-time-label', t.timeControl);
    set('modal-level-label', t.opponent);
    set('btn-to-menu', t.toMenu);
    set('btn-confirm-play', t.play);

    // Модалка настроек
    set('settings-title', t.settings);
    set('label-piece-set', t.pieceSet);
    set('label-board-theme', t.boardColor);
    set('label-dark-theme', t.darkTheme);
    set('label-dark-desc', t.darkDesc);
    set('label-sound-effects', t.soundEffects);
    set('label-sound-desc', t.soundDesc);
    set('btn-settings-done', t.done);
    
    // Статистика
    set('stats-total-label', t.gamesPlayed); // Добавьте ID в HTML если нужно
    
    // Кнопки режимов (через селекторы)
    const modeBtns = document.querySelectorAll('.gm-btn span');
    if (modeBtns.length >= 3) {
        modeBtns[0].textContent = t.fisher;
        modeBtns[1].textContent = t.standard;
        modeBtns[2].textContent = t.randomPos;
    }

    updateLevelText(); // Чтобы обновить имя бота
    displayStats();    // Чтобы обновить подписи в стате
    renderLeaderboard();
    updatePlayerProfileUI();
}

// Пример того, как обновлять проценты правильно:
function updateLoadingProgress(percent) {
    const t = i18n[lang] || i18n.en;
    const loadText = document.getElementById('loading-text');
    if (loadText) {
        loadText.textContent = `${t.loading}: ${percent}%`;
    }
    const bar = document.getElementById('loading-bar');
    if (bar) {
        bar.style.width = percent + '%';
    }
}

function showStartAd() {
    if (isVkMode) {
        vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' })
            .then(() => showStartMenu())
            .catch(() => showStartMenu());
    } else {
        showStartMenu();
    }
}



function toggleGameOverUI(isEnded) {
    const bottomBar = document.querySelector('.bottom-bar');

    const homeBtn = document.getElementById('home-btn');
    const undoBtn = document.getElementById('undo-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const newGameBtn = document.getElementById('new-game-btn');
    
    const newGameText = newGameBtn.querySelector('.text');
    const newGameIcon = newGameBtn.querySelector('.video-icon');
    
    const t = i18n[lang] || i18n.en;

    if (isEnded) {
        bottomBar.classList.add('is-game-over');
        homeBtn.classList.add('is-game-over-btn');

        // РЕЖИМ КОНЦА ИГРЫ (Широкая синяя кнопка)
        undoBtn.classList.add('hidden');
        settingsBtn.classList.add('hidden');
        
        newGameIcon.classList.add('hidden'); 
        newGameBtn.classList.add('wide-mode'); 
        
        newGameText.textContent = t.newGameAction.toUpperCase();
        // Принудительно показываем текст, так как это главная кнопка
        newGameText.style.setProperty('display', 'block', 'important'); 
    } else {
         bottomBar.classList.remove('is-game-over');
        homeBtn.classList.remove('is-game-over-btn');
        // РЕЖИМ ИГРЫ (4 маленькие иконки)
        undoBtn.classList.remove('hidden');
        settingsBtn.classList.remove('hidden');
        
        newGameIcon.classList.remove('hidden');
        newGameBtn.classList.remove('wide-mode'); 
        
        newGameText.textContent = t.play;
        
        // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: 
        // Полностью удаляем инлайновый стиль display.
        // Теперь CSS (медиа-запросы) снова будут сами решать, 
        // скрывать текст или показывать (как было до конца игры).
        newGameText.style.removeProperty('display');
    }
}


function selectTime(minutes) {
    selectedTimeMinutes = minutes;
    
    // Сохраняем в localStorage, чтобы время не сбрасывалось при перезагрузке
    localStorage.setItem('chess-time-limit', minutes);

    // Обновляем визуальное состояние кнопок
    document.querySelectorAll('.time-segment-btn').forEach(btn => {
        const btnTime = parseInt(btn.getAttribute('data-time'));
        if (btnTime === minutes) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}


function updatePlayerProfileUI() {
    const t = i18n[lang] || i18n.en;
    const nameEl = document.getElementById('name-player');
    
    if (nameEl) {
        nameEl.textContent = (player && player.first_name) ? player.first_name : t.player;
    }

    const box = document.getElementById('player-avatar-box');
    if (!box) return;

    if (!player || !player.photo_100) {
        box.innerHTML = '';
        box.style.backgroundImage = "url('img/p/wwN.svg')";
        box.style.backgroundColor = '';
        return;
    }

    const url = player.photo_100;
    box.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:24%; display:block;">`;
    box.style.backgroundImage = 'none';
    box.style.backgroundColor = 'transparent';
}

function startTimer() {
    stopTimer();
    const pTimer = document.getElementById('player-timer');
    const aTimer = document.getElementById('ai-timer');
    
    // Убеждаемся, что таймеры всегда видимы
    pTimer.style.display = ''; 
    aTimer.style.display = '';

    // СБРАСЫВАЕМ КРАСНЫЙ ЦВЕТ ОТ ПРОШЛОЙ ИГРЫ
    pTimer.classList.remove('low-time');
    aTimer.classList.remove('low-time');

    if (selectedTimeMinutes === 0) {
        pTimer.textContent = "--:--"; // Показываем бесконечность
        aTimer.textContent = "--:--";
        // Обновим подсветку активного игрока один раз
        updateTimerDisplay(); 
        return; // Выходим, интервал отсчета не нужен
    }

    playerTimeLeft = selectedTimeMinutes * 60;
    aiTimeLeft = selectedTimeMinutes * 60;
    
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        if (game.game_over()) return;
        if (currentViewIndex !== fenHistory.length - 1) return;
        if (pendingPromotion) return;

        if (game.turn() === playerColor) {
            playerTimeLeft--;
            if (playerTimeLeft <= 0) endGameByTime(true);
        } else {
            aiTimeLeft--;
            if (aiTimeLeft <= 0) endGameByTime(false);
        }
        updateTimerDisplay();
    }, 1000);
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    // Когда таймер останавливается, убираем подсветку активности и мигание
    document.querySelectorAll('.timer').forEach(t => {
        t.classList.remove('active');
        t.classList.remove('blinking');
    });
}

function updateTimerDisplay() {
    const pTimer = document.getElementById('player-timer');
    const aTimer = document.getElementById('ai-timer');

    const isGameOver = game.game_over() || (selectedTimeMinutes > 0 && (playerTimeLeft <= 0 || aiTimeLeft <= 0));

// Если игра без времени (бесконечность)
    if (selectedTimeMinutes === 0) {
        // Только переключаем подсветку "active", не меняя текст ∞
        pTimer.classList.toggle('active', !isGameOver && game.turn() === playerColor);
        aTimer.classList.toggle('active', !isGameOver && game.turn() !== playerColor);
        
        // СТРАХОВКА: принудительно запрещаем красный цвет в режиме без времени
        pTimer.classList.remove('low-time');
        aTimer.classList.remove('low-time');
        
        return; 
    }

    // Логика для игры С временем (остается прежней)
    pTimer.textContent = formatTime(playerTimeLeft);
    aTimer.textContent = formatTime(aiTimeLeft);

    pTimer.classList.toggle('active', !isGameOver && game.turn() === playerColor);
    aTimer.classList.toggle('active', !isGameOver && game.turn() !== playerColor);

    pTimer.classList.toggle('low-time', playerTimeLeft < 30);
    aTimer.classList.toggle('low-time', aiTimeLeft < 30);

    pTimer.classList.toggle('blinking', !isGameOver && playerTimeLeft < 30 && game.turn() === playerColor);
    aTimer.classList.toggle('blinking', !isGameOver && aiTimeLeft < 30 && game.turn() !== playerColor);
}
function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function endGameByTime(isPlayerLost) {
    stopTimer();
    stopEngines();
    stopGameplay();
    toggleGameOverUI(true);
    
    isLocked = true;
    localStorage.removeItem('gameInProgress');

    const msg = isPlayerLost ? "Время вышло! Вы проиграли." : "Время компьютера вышло! Вы победили.";
    
    const score = isPlayerLost ? (playerColor === 'w' ? '0-1' : '1-0') : (playerColor === 'w' ? '1-0' : '0-1');
    gameResultData = { msg, score, status: isPlayerLost ? 'lose' : 'win' };
    
    // ДОБАВИТЬ:
    updateStats(isPlayerLost ? 'loss' : 'win');
    
    updateMoveHistory();

    if (window.innerHeight > window.innerWidth) {
        setTimeout(() => showGameToast(gameResultData), 300);
    }
}

function resignGame() {
    if (game.game_over() || currentViewIndex !== fenHistory.length - 1 || fenHistory.length < 2) return;
    
    if (confirm("Вы уверены, что хотите сдаться?")) {
        stopTimer();
        stopEngines();
        stopGameplay();
        isLocked = true;
        localStorage.removeItem('gameInProgress');
        
        const msg = "Вы сдались. Компьютер победил!";
        const score = playerColor === 'w' ? '0-1' : '1-0';
        
        gameResultData = { msg, score, status: 'lose' };
        updateStats('loss');  // ← ДОБАВИТЬ
        updateMoveHistory();
        
        if (window.innerHeight > window.innerWidth) {
            setTimeout(() => showGameToast(gameResultData), 300);
        }
    }
}

function startNewGame() {
    lastMoveSquares = [];
    localStorage.setItem('gameInProgress', 'true');
    game = new Chess();
    gameResultData = null;
    
    // Обработка режимов
    if (gameMode === 'chess960') {
        const startFen = generateFisher960();
        game.load(startFen);
    } else if (gameMode === 'middlegame' && middlegamesData.length > 0) {
            const randomPos = middlegamesData[Math.floor(Math.random() * middlegamesData.length)];
            game.load(randomPos.fen);
            lastMoveSquares =[];
            playerColor = game.turn() === 'w' ? 'b' : 'w';
            isBoardFlipped = (playerColor === 'b');
        }

    // ОДНА инициализация
    fenHistory = [game.fen()]; 
    moveHistoryLog = [];
    movesObjectsLog =[];
    currentViewIndex = 0;
    selectedSq = null;

    // Имя и аватарка
    const val = document.getElementById('level-slider').value;
    const lvl = aiLevels[val];
    const levelName = lang === 'ru' ? lvl.nameRu : (lvl.nameEn || lvl.nameRu);
    document.getElementById('name-ai').textContent = levelName;
    updatePlayerProfileUI(); // ✅ Один вызов — достаточно

    const currentLvl = document.getElementById('level-slider').value;
    if (aiLevels[currentLvl].engine === "lozza") {
        lozzaWorker.postMessage('ucinewgame');
        lozzaWorker.postMessage('isready');
    }
    
    const loader = document.getElementById('loading-screen');
    if (loader) loader.style.display = 'none';

    const t = i18n[lang] || i18n.en;
    const currentPlayerName = (player && player.getName()) ? player.getName().split(' ')[0] : t.player;
    document.getElementById('name-player').textContent = currentPlayerName;

    // ❌ УДАЛЁН дублирующий блок с playerAvatarBox, который сбрасывал аватарку

    showRandomAdvice();
    renderBoard();

    if (game.turn() !== playerColor) {
        isLocked = true;
        setTimeout(makeAiMove, 500);
    } else {
        isLocked = false;
    }

    startTimer();
    startGameplay();
    toggleGameOverUI(false);
}

function generateFisher960() {
    // Фигуры второго ряда: король между ладьями, слоны на разные цвета
    const pieces = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    const shuffled = pieces.sort(() => Math.random() - 0.5);
    
    return shuffled.join('') + '/pppppppp/8/8/8/8/PPPPPPPP/' + 
           shuffled.map(p => p.toUpperCase()).join('') + ' w KQkq - 0 1';
}

// --- ЛОГИКА МОДАЛКИ НОВОЙ ИГРЫ ---
let tempSelectedColor = 'random';

function openNewGameModal(isCancellable = true) {
    stopGameplay()
    canCancelNewGame = isCancellable; // Запоминаем, можно ли закрывать
    
    const modal = document.getElementById('new-game-modal');
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    
    selectColor(tempSelectedColor); 
    updateLevelText();
    selectTime(selectedTimeMinutes);
    updateAIAvatar(document.getElementById('level-slider').value);
}

function closeNewGameModal() {
    document.getElementById('new-game-modal').style.display = 'none';
    startGameplay();
}

function selectColor(color) {
    tempSelectedColor = color;
    
    // Убираем рамки у всех
    document.getElementById('color-w').style.borderColor = 'transparent';
    document.getElementById('color-b').style.borderColor = 'transparent';
    document.getElementById('color-random').style.borderColor = 'transparent';
    
    // Ставим синюю рамку выбранному
    const selectedBtn = document.getElementById('color-' + color);
    if (selectedBtn) {
        selectedBtn.style.borderColor = '#3b82f6';
    }
}

// ==========================================
// ФУНКЦИЯ ОБНОВЛЕНИЯ АВАТАРКИ ПО УРОВНЮ
// ==========================================
 
// Обновляем аватарку компьютера в зависимости от уровня сложности
function updateAIAvatar(level) {
    const avatarBox = document.getElementById('ai-profile-box').querySelector('.avatar');
    if (!avatarBox) return;
    
    // Очищаем старое содержимое
    avatarBox.innerHTML = '';
    avatarBox.style.backgroundImage = '';
    
    // Создаем img элемент
    const img = document.createElement('img');
    img.src = `img/avatars/${level}.png`;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    //img.style.borderRadius = '50%';
    img.onerror = function() {
        // Fallback если файл не найден
        avatarBox.textContent = '🤖';
    };
    
    avatarBox.appendChild(img);
}
 
// ==========================================
// ОБНОВЛЕННАЯ ФУНКЦИЯ updateLevelText
// ==========================================
 
function updateLevelText() {
    const val = document.getElementById('level-slider').value;
    const lvl = aiLevels[val];
    if (!lvl) return;

    // Определяем язык (lang должна быть глобальной переменной 'ru' или 'en')
    const currentLang = (typeof lang !== 'undefined') ? lang : 'ru';

    // Выбираем правильные поля
    const levelName = currentLang === 'ru' ? lvl.nameRu : (lvl.nameEn || lvl.nameRu);
    const levelLabel = currentLang === 'ru' ? lvl.labelRu : (lvl.labelEn || lvl.labelRu);
    const levelPrefix = currentLang === 'ru' ? 'Уровень: ' : 'Level: ';

    // 1. Имя бота (в модалке и в профиле)
    document.getElementById('level-name').textContent = levelName;
    const aiNameInGame = document.getElementById('name-ai');
    if (aiNameInGame) aiNameInGame.textContent = levelName;
    
    // 2. Описание сложности + ELO
    const eloText = lvl.elo ? ` ~${lvl.elo}` : '';
    document.getElementById('level-desc').textContent = levelPrefix + levelLabel + eloText;

    // 3. Аватарка
    const avatarImg = document.getElementById('level-avatar');
    if (avatarImg) avatarImg.src = `img/avatars/${val}.png`;
    
    updateAIAvatar(val);

    // Сохраняем уровень
    localStorage.setItem('chess-ai-level', val);
}

function confirmNewGame() {
    // Если игра шла — засчитываем поражение
    if (localStorage.getItem('gameInProgress') === 'true') {
        localStorage.removeItem('gameInProgress');
        updateStats('loss');
    }

    closeNewGameModal();
    stopTimer();
    stopEngines();

    if (gameMode !== 'middlegame') {
        playerColor = tempSelectedColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : tempSelectedColor;
        isBoardFlipped = (playerColor === 'b');
    }

    const val = document.getElementById('level-slider').value;
    localStorage.setItem('chess-ai-level', val);
    currentAiElo = aiLevels[val].elo;
    currentAiDepth = aiLevels[val].depth;

    startNewGame();
}


// --- 3. ОТРИСОВКА ---
function renderBoard() {
    boardEl.innerHTML = '';
    const board = game.board(); 
    const isCheck = game.in_check();
    const turn = game.turn();

    for (let visualR = 0; visualR < 8; visualR++) {
        for (let visualC = 0; visualC < 8; visualC++) {
            // Если играем за черных, переворачиваем координаты визуально
            const r = isBoardFlipped ? 7 - visualR : visualR;
            const c = isBoardFlipped ? 7 - visualC : visualC;
            
            const squareData = board[r][c];
            const pos = idxToPos(r, c);
            const sq = document.createElement('div');
            // Цвет клетки зависит от визуальных координат, чтобы шахматка сохранилась
            sq.className = `square ${(visualR + visualC) % 2 === 0 ? 'light' : 'dark'}`; 
            sq.dataset.pos = pos;
            sq.dataset.r = r;
            sq.dataset.c = c;

            // Координаты (буквы и цифры)
            if (visualC === 0) {
                const rankCoord = document.createElement('span');
                rankCoord.className = 'coord rank';
                rankCoord.textContent = 8 - r; 
                sq.appendChild(rankCoord);
            }

            if (visualR === 7) {
                const fileCoord = document.createElement('span');
                fileCoord.className = 'coord file';
                fileCoord.textContent = String.fromCharCode(97 + c); 
                sq.appendChild(fileCoord);
            }

            if (lastMoveSquares.includes(pos)) sq.classList.add('enemy-move');
            if (selectedSq && selectedSq.pos === pos) sq.classList.add('selected');
            
            if (isCheck && squareData && squareData.type === 'k' && squareData.color === turn) {
                sq.classList.add('in-check');
            }

            if (squareData) {
                const pieceChar = squareData.color === 'w' ? squareData.type.toUpperCase() : squareData.type.toLowerCase();
                const pEl = document.createElement('div');
                pEl.className = 'piece';
                pEl.style.backgroundImage = `url('${getPieceImage(pieceChar)}')`;
                sq.appendChild(pEl);
            }

            sq.onmousedown = sq.ontouchstart = (e) => handleStart(e, r, c);
            boardEl.appendChild(sq);
        }
    }
        updateMaterialDisplay(); 
    updateMoveHistory();
    updateTimerDisplay();
}

// --- 4. УПРАВЛЕНИЕ ---
function handleStart(e, r, c) {
    if (currentViewIndex !== fenHistory.length - 1) {
        // Можно добавить маленькую подсказку: "Вернитесь к последнему ходу"
        return; 
    }
    
    if (isLocked) return;
    
    const pos = idxToPos(r, c);
    const piece = game.get(pos);

    // --- НОВОЕ: СНЯТИЕ ВЫБОРА ПРИ ПОВТОРНОМ НАЖАТИИ ---
    if (selectedSq && selectedSq.pos === pos) {
        if (e.cancelable) e.preventDefault();
        selectedSq = null;
        renderBoard(); // Полная перерисовка, чтобы убрать подсветку и точки
        return;
    }

    // --- ЛОГИКА КЛИКА (Выбор цели) ---
    if (selectedSq && selectedSq.pos !== pos) {
        const moves = game.moves({ square: selectedSq.pos, verbose: true });
        const isLegal = moves.some(m => m.to === pos);

        if (isLegal) {
            if (e.cancelable) e.preventDefault();
            checkAndMove(selectedSq.pos, pos);
            return;
        }
    }

    // --- ЛОГИКА ЗАХВАТА / ВЫБОРА ---
    if (piece && piece.color === playerColor) {
        if (e.cancelable) e.preventDefault();

        const currentSqEl = document.querySelector(`[data-pos="${pos}"]`);
        const rect = currentSqEl.getBoundingClientRect();
        const squareSize = rect.width; 

        // Очищаем старое
        document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.hint-dot, .hint-ring').forEach(el => el.remove());
        
        selectedSq = { r, c, pos };
        currentSqEl.classList.add('selected');
        showHints(pos);

        // Определяем коэффициент увеличения: 1.2 для портрета, 1.0 для ландшафта
        const isPortrait = window.innerHeight > window.innerWidth;
        const scale = isPortrait ? 1.6 : 1.0;

        follower.style.width = (squareSize * scale) + 'px';
        follower.style.height = (squareSize * scale) + 'px';
        const pChar = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
        follower.style.backgroundImage = `url('${getPieceImage(pChar)}')`;
        follower.style.display = 'block';

        const pInBoard = currentSqEl.querySelector('.piece');
        if (pInBoard) pInBoard.style.opacity = '0.4';

        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let clientY = e.touches ? e.touches[0].clientY : e.clientY;
        updateFollower(clientX, clientY);

        let isDragging = false;

        const onMove = (me) => {
            if (me.cancelable) me.preventDefault();
            isDragging = true;
            clientX = me.touches ? me.touches[0].clientX : me.clientX;
            clientY = me.touches ? me.touches[0].clientY : me.clientY;
            updateFollower(clientX, clientY);
        };

        const onEnd = (ue) => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            
            follower.style.display = 'none';
            if (pInBoard) pInBoard.style.opacity = '1';
            
            let ux = clientX;
            let uy = clientY;
            if (ue && ue.changedTouches && ue.changedTouches.length > 0) {
                ux = ue.changedTouches[0].clientX;
                uy = ue.changedTouches[0].clientY;
            }

            const target = document.elementFromPoint(ux, uy)?.closest('.square');
            if (isDragging && target && target.dataset.pos !== pos) {
                checkAndMove(pos, target.dataset.pos);
            } 
            // Если это был клик (не dragging) — мы ничего не делаем, 
            // фигура остается выбранной благодаря коду выше.
        };

        document.addEventListener('mousemove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);

    } else {
        // Клик по пустому месту (не по легальному ходу) — снимаем выбор
        if (selectedSq) {
            selectedSq = null;
            renderBoard();
        }
    }
}

function showHints(pos) {
    const moves = game.moves({ square: pos, verbose: true });
    moves.forEach(m => {
        const sqEl = document.querySelector(`[data-pos="${m.to}"]`);
        if (sqEl) {
            const h = document.createElement('div');
            h.className = game.get(m.to) ? 'hint-ring' : 'hint-dot';
            sqEl.appendChild(h);
        }
    });
}

function updateFollower(x, y) {
    follower.style.left = x + 'px';
    follower.style.top = y + 'px';
}

function checkAndMove(from, to) {
    const piece = game.get(from);
    
    // 1. Получаем список всех разрешенных ходов
    const legalMoves = game.moves({ square: from, verbose: true });
    
    // 2. Проверяем, есть ли такой ход в принципе
    const isMoveLegal = legalMoves.some(m => m.to === to);

    if (!isMoveLegal) {
        //handleMoveError();
        return;
    }

    // 3. Проверка на превращение: пешка на последней линии
    if (piece && piece.type === 'p' && (to[1] === '8' || to[1] === '1')) {
        pendingPromotion = { from, to };
        openPromotionDialog(piece.color, to); 
    } else {
        // Обычный ход
        finalizeMove(from, to);
    }
}

function finalizeMove(from, to, promotion = 'q') {
    const move = game.move({ from, to, promotion });
    if (!move) { /*handleMoveError();*/ return; }

    moveHistoryLog.push(move.san);

    movesObjectsLog.push({ from: move.from, to: move.to });

    // Записываем состояние в историю
    fenHistory.push(game.fen());
    currentViewIndex = fenHistory.length - 1;

    lastMoveSquares = [from, to];
    playSound(move.captured ? audioCapture : audioMove);
    
    selectedSq = null;
    renderBoard();

    if (gameMode === 'pvp' && currentRoomId && supabaseClient) {
    // Отправляем ход в Supabase
    supabaseClient
        .from('rooms')
        .update({ 
            fen: game.fen(), 
            last_move: `${from}-${to}`,
            turn: game.turn()
        })
        .eq('id', currentRoomId)
        .then(({ error }) => {
            if (error) console.error("Ошибка синхронизации хода:", error);
        });
}

    // Если игра не закончена, ход переходит к ИИ
// Если игра не закончена, ход переходит к ИИ
    if (!checkStatus()) { 
        isLocked = true; 
        
        // Если партия быстрая (<= 3 минут), задержка перед ходом ИИ будет всего 50мс.
        // Иначе - красивые 600мс для эстетики.
        let delayBeforeAi = (selectedTimeMinutes > 0 && selectedTimeMinutes <= 3) ? 50 : 600;
        
        aiMoveTimeout = setTimeout(makeAiMove, delayBeforeAi); 
    }
}

/*
// --- 5. STOCKFISH AI ---
stockfishWorker.onmessage = function(e) {
    console.log("Движок ответил:", e.data); // Для отладки
    if (e.data.startsWith('bestmove')) {
        const moveStr = e.data.split(' ')[1];
        if (moveStr === '(none)' || moveStr === 'NULL') {
            checkStatus(); 
            return;
        }
        const from = moveStr.substring(0, 2);
        const to = moveStr.substring(2, 4);
        const promotion = moveStr.length === 5 ? moveStr[4] : 'q';
        
        executeAiMove(from, to, promotion);
    }
};
*/
function stopEngines() {
    stockfishWorker.postMessage('stop');
    lozzaWorker.postMessage('stop');
    
    // РЕАЛЬНО очищаем таймаут хода ИИ, если он был запланирован
    if (aiMoveTimeout) clearTimeout(aiMoveTimeout); 
    
    isLocked = true; 
}

function makeAiMove() {
    // Если игра уже окончена (например, по времени), ИИ думать не должен!
    if (gameResultData || game.game_over()) return; 

    isLocked = true;
    const currentLevel = parseInt(document.getElementById('level-slider').value);
    const levelData = aiLevels[currentLevel];
    const fen = game.fen();

    const pTimeMs = playerTimeLeft * 1000;
    const aTimeMs = aiTimeLeft * 1000;
    const wTime = (playerColor === 'w') ? pTimeMs : aTimeMs;
    const bTime = (playerColor === 'b') ? pTimeMs : aTimeMs;

    if (levelData.engine === "lozza") {
        lozzaWorker.postMessage('isready'); 
        lozzaWorker.postMessage(`position fen ${fen}`);
        lozzaWorker.postMessage(`go depth ${levelData.depth}`);
} else {
    if (currentLevel === 10) {
        stockfishWorker.postMessage('setoption name UCI_LimitStrength value false');
    } else {
        stockfishWorker.postMessage('setoption name UCI_LimitStrength value true');
        stockfishWorker.postMessage(`setoption name UCI_Elo value ${levelData.elo}`);
    }

    stockfishWorker.postMessage('isready');
    stockfishWorker.postMessage(`position fen ${fen}`);

if (selectedTimeMinutes > 0) {
                // Убрали movestogo 30! Теперь Stockfish понимает, что это время до конца игры, и в пулю будет играть как пулеметчик.
                stockfishWorker.postMessage(`go wtime ${wTime} btime ${bTime}`);
            } else {
                // Если игра БЕЗ времени (бесконечность) — заставляем его думать фиксированное время
                stockfishWorker.postMessage(`go movetime ${levelData.movetime}`);
            }
}
}




function executeAiMove(from, to, promotion) {
    const fromSq = document.querySelector(`[data-pos="${from}"]`);
    const toSq = document.querySelector(`[data-pos="${to}"]`);
    const pEl = fromSq?.querySelector('.piece');

    if (pEl && fromSq && toSq) {
        const fR = fromSq.getBoundingClientRect();
        const tR = toSq.getBoundingClientRect();
        pEl.style.zIndex = "1000";
        pEl.style.transition = "transform 0.3s ease-in-out";
        pEl.style.transform = `translate(${tR.left - fR.left}px, ${tR.top - fR.top}px)`;

        setTimeout(() => {
            const res = game.move({ from, to, promotion });
            if (res) {
                moveHistoryLog.push(res.san);
                movesObjectsLog.push({ from: res.from, to: res.to });
                // Записываем состояние ИИ в историю
                fenHistory.push(game.fen());
                currentViewIndex = fenHistory.length - 1;
                
                lastMoveSquares = [from, to];
playSound(res.captured ? audioCapture : audioMove);
            }
            isLocked = false;
            renderBoard();
            checkStatus();
        }, 300);
    } else {
        const res = game.move({ from, to, promotion });
        if (res) {
            fenHistory.push(game.fen());
            currentViewIndex = fenHistory.length - 1;
        }
        isLocked = false;
        renderBoard();
        checkStatus();
    }
}

// --- 6. СТАТУСЫ И ОЧКИ ---
function checkStatus() {
    if (game.game_over()) {
        stopTimer(); 
        stopEngines(); 
        stopGameplay();
        toggleGameOverUI(true);
        isLocked = true;
        localStorage.removeItem('gameInProgress');

        const t = i18n[lang] || i18n.en; // Сокращение для удобства
        let status = 'draw';
        let msg = t.draw; // По умолчанию ничья
        let score = '½-½';

        if (game.in_checkmate()) {
            // МАТ
            const prefix = t.checkmate + "! "; // "Мат! " или "Checkmate! "
            
            if (game.turn() === playerColor) {
                // Ход игрока, а ему поставили мат — значит проигрыш
                status = 'lose';
                msg = prefix + t.lose; 
                score = playerColor === 'w' ? '0-1' : '1-0';
                updateStats('loss');
            } else {
                // Ход ИИ, ему поставили мат — победа!
                status = 'win';
                msg = prefix + t.win;
                score = playerColor === 'w' ? '1-0' : '0-1';
                updateScore(50);
                updateStats('win');
            }
        } else {
            // Пат или другая ничья
            updateStats('draw');
        }

        gameResultData = { msg, score, status };
        updateMoveHistory();

        // Показываем тост (сообщение на экране)
        if (window.innerHeight > window.innerWidth) {
            setTimeout(() => showGameToast(gameResultData), 500);
        }
        
        return true;
    }
    return false;
}

async function updateScore(pts) {
    totalScore += pts;
    saveToCloud();

    if (supabaseClient) {
        // Если мы не в ВК, придумаем тестовые данные для проверки базы
        const currentUserId = vkUserId ? String(vkUserId) : 'local_test_user_1';
        const currentUserName = (player && player.first_name) ? player.first_name : 'Тестовый Игрок';
        const currentUserAvatar = (player && player.photo_100) ? player.photo_100 : 'img/avatars/1.png';

        console.log("Попытка отправки в Supabase:", { currentUserId, currentUserName, totalScore });

        // Отправляем запрос
        const { data, error } = await supabaseClient.from('leaderboard').upsert({
            id: currentUserId,
            name: currentUserName,
            avatar: currentUserAvatar,
            score: totalScore
        });

        // Supabase v2 возвращает ошибку в объекте error, а не через try/catch
        if (error) {
            console.error('❌ Ошибка Supabase:', error.message);
        } else {
            console.log('✅ Очки успешно сохранены в базе!');
        }
    }

    renderLeaderboard();
}

function calculateAndAddScore(result) {
    if (result === 'draw') {
        updateScore(3);
        return;
    }
    if (result !== 'win') return;

    const level = parseInt(document.getElementById('level-slider').value);
    const base = 10;
    const levelBonus = level * 5;

    let multiplier = 1;
    if (playerStats.currentStreak === 2) multiplier = 1.5;
    else if (playerStats.currentStreak >= 3) multiplier = 2;

    const total = Math.round((base + levelBonus) * multiplier);
    updateScore(total);
    console.log(`Очки: (${base} + ${levelBonus}) x${multiplier} = ${total}`);
}



function showGameToast(data) {
    if (!data) return;
document.getElementById('game-toast-icon').style.display = 'none';
    document.getElementById('game-toast-text').textContent = data.msg || '';

    const toast = document.getElementById('game-toast');
    const inner = document.getElementById('game-toast-inner');
    inner.style.animation = 'none';
    toast.style.display = 'block';
    inner.offsetHeight; // reflow
    inner.style.animation = 'toast-in 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards';

    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
        inner.style.animation = 'toast-out 0.3s ease forwards';
        setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 3000);
}





// --- 7. ПРОМОУШЕН ---
function openPromotionDialog(color, toPos) {
    const dialog = document.getElementById('promotion-dialog');
    const box = dialog.querySelector('.promotion-box');
    const sqEl = document.querySelector(`[data-pos="${toPos}"]`);
    const boardRect = boardEl.getBoundingClientRect(); // Получаем границы всей доски
    
    if (!sqEl) return;

    const rect = sqEl.getBoundingClientRect();
    const squareSize = rect.width;

    const pieces = color === 'w' ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'];
    const ids = ['prom-q', 'prom-r', 'prom-b', 'prom-n'];
    
    ids.forEach((id, idx) => {
        const el = document.getElementById(id);
        el.style.backgroundImage = `url('${getPieceImage(pieces[idx])}')`;
        el.style.width = squareSize + 'px';
        el.style.height = squareSize + 'px';
    });

    dialog.classList.remove('hidden');
    dialog.style.display = 'flex';
    dialog.style.left = rect.left + 'px';
    dialog.style.width = squareSize + 'px';

    // ВЫЧИСЛЯЕМ ВИЗУАЛЬНОЕ ПОЛОЖЕНИЕ:
    // Проверяем, находится ли клетка у ВЕРХНЕГО края доски (с допуском 10 пикселей)
    const isAtVisualTop = Math.abs(rect.top - boardRect.top) < 10;

    if (isAtVisualTop) {
        // Если клетка визуально СВЕРХУ (неважно, 1-я это горизонталь или 8-я)
        // Окно должно расти ВНИЗ
        dialog.style.top = rect.top + 'px';
        box.style.flexDirection = 'column';
    } else {
        // Если клетка визуально СНИЗУ
        // Окно должно расти ВВЕРХ
        dialog.style.top = (rect.bottom - (squareSize * 4)) + 'px';
        box.style.flexDirection = 'column-reverse';
    }
}

function selectPromotion(type) {
    const dialog = document.getElementById('promotion-dialog');
    dialog.classList.add('hidden'); // Прячем обратно
    dialog.style.display = 'none';

    if (pendingPromotion) {
        finalizeMove(pendingPromotion.from, pendingPromotion.to, type);
        pendingPromotion = null;
    }
}
// --- ПОДСЧЕТ МАТЕРИАЛА И СЪЕДЕННЫХ ФИГУР ---
// --- ПОДСЧЕТ МАТЕРИАЛА И СЪЕДЕННЫХ ФИГУР ---
function updateMaterialDisplay() {
    // 1. Базовый набор фигур для каждой стороны в начале игры
    const startingPieces = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    
    // Текущее количество фигур на доске
    const currentW = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    const currentB = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    
    // Считаем все фигуры, которые сейчас есть на доске
    game.board().forEach(row => {
        row.forEach(sq => {
            if (sq && sq.type !== 'k') { // Королей не считаем
                if (sq.color === 'w') currentW[sq.type]++;
                else currentB[sq.type]++;
            }
        });
    });

    let wCaptures =[]; // Белые фигуры, которых не хватает (съедены)
    let bCaptures = []; // Черные фигуры, которых не хватает (съедены)

    const pieceTypes =['p', 'n', 'b', 'r', 'q'];
    
    pieceTypes.forEach(type => {
        // Разница между тем, что должно быть, и тем, что осталось
        let missingW = startingPieces[type] - currentW[type];
        let missingB = startingPieces[type] - currentB[type];

        // Добавляем недостающие фигуры в массивы съеденных
        if (missingW > 0) {
            for (let i = 0; i < missingW; i++) wCaptures.push(type);
        }
        if (missingB > 0) {
            for (let i = 0; i < missingB; i++) bCaptures.push(type);
        }
    });

    // Сортируем фигуры (пешки, кони, слоны, ладьи, ферзи)
    const sortOrder = { p:1, n:2, b:3, r:4, q:5 };
    wCaptures.sort((a,b) => sortOrder[a] - sortOrder[b]);
    bCaptures.sort((a,b) => sortOrder[a] - sortOrder[b]);

    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';

    // Определяем, чьи трофеи мы показываем
    // Если игрок белый, его трофеи — это недостающие черные фигуры (bCaptures)
    const playerCaptures = playerColor === 'w' ? bCaptures : wCaptures;
    const aiCaptures = playerColor === 'w' ? wCaptures : bCaptures;
    
    const playerCapturesEl = document.getElementById('player-captures');
    const aiCapturesEl = document.getElementById('ai-captures');
    
    playerCapturesEl.innerHTML = '';
    aiCapturesEl.innerHTML = '';
    
    // Функция для отрисовки фигур в интерфейсе
    function addCaptures(container, captures) {
        const grouped = {};
        
        // Группируем одинаковые фигуры
        captures.forEach(piece => {
            grouped[piece] = (grouped[piece] || 0) + 1;
        });
        
        const order =['p', 'n', 'b', 'r', 'q'];
        order.forEach(piece => {
            if (grouped[piece]) {
                const count = grouped[piece];
                const pieceChar = isDarkTheme ? piece.toUpperCase() : piece.toLowerCase();
                
                // Пешки объединяем с множителем (например, x3)
                if (piece === 'p' && count > 1) {
                    const img = document.createElement('img');
                    img.src = getPieceImage(pieceChar);
                    img.style.width = '4vw';
                    img.style.height = '4vw';
                    img.style.marginRight = '1px';
                    img.style.marginLeft = '-2px';
                    img.className = 'imgP';
                    container.appendChild(img);
                    
                    const mult = document.createElement('span');
                    mult.textContent = `x${count}`;
                    mult.className = 'xmnozh';
                    mult.style.fontSize = '14px';
                    mult.style.fontWeight = 'bold';
                    mult.style.marginRight = '4px';
                    mult.style.marginLeft = '-3px';
                    mult.style.color = 'var(--text-primary)';
                    mult.style.lineHeight = '1';
                    mult.style.position = 'relative';
                    mult.style.top = '-2px';
                    mult.style.display = 'inline-block';
                    container.appendChild(mult);
                } else {
                    // Остальные фигуры выводим поштучно
                    for (let i = 0; i < count; i++) {
                        const img = document.createElement('img');
                        img.src = getPieceImage(pieceChar);
                        img.style.width = '4vw';
                        img.className = 'imgP';
                        img.style.height = '4vw';
                        img.style.marginRight = '-1px';
                        container.appendChild(img);
                    }
                }
            }
        });
    }
    
    addCaptures(playerCapturesEl, playerCaptures);
    addCaptures(aiCapturesEl, aiCaptures);

    // 2. Считаем преимущество по очкам (остается без изменений, оно работало правильно)
    const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let wScore = 0; 
    let bScore = 0;
    
    game.board().forEach(row => row.forEach(sq => {
        if (sq) {
            if (sq.color === 'w') wScore += values[sq.type];
            if (sq.color === 'b') bScore += values[sq.type];
        }
    }));

    const playerScore = playerColor === 'w' ? wScore : bScore;
    const aiScore = playerColor === 'w' ? bScore : wScore;

    const playerDiff = playerScore - aiScore;
    const aiDiff = aiScore - playerScore;

    document.getElementById('player-score-diff').textContent = playerDiff > 0 ? `+${playerDiff}` : '';
    document.getElementById('ai-score-diff').textContent = aiDiff > 0 ? `+${aiDiff}` : '';
}

// --- КРАСИВАЯ ОТМЕНА ХОДА С АНИМАЦИЕЙ ---
async function undoMove() {
    // Проверка условий
    if (isLocked || currentViewIndex !== fenHistory.length - 1 || fenHistory.length < 3) return;
    
    isLocked = true; 

    // --- 1. ОТМЕНА ХОДА КОМПЬЮТЕРА ---
    const moveAI = movesObjectsLog.pop();
    moveHistoryLog.pop();
    fenHistory.pop(); // Удаляем текущий FEN (состояние после хода ИИ)
    
    // Загружаем в игру состояние, которое было ДО хода ИИ
    game.load(fenHistory[fenHistory.length - 1]);

    if (moveAI) {
        // Анимируем. Важно: на экране еще старая верстка, поэтому animateUndoStep найдет фигуру
        await animateUndoStep({from: moveAI.from, to: moveAI.to});
        playSound(audioMove);
    }

    // --- 2. ОТМЕНА ХОДА ИГРОКА ---
    const movePlayer = movesObjectsLog.pop();
    moveHistoryLog.pop();
    fenHistory.pop(); // Удаляем FEN (состояние после хода игрока)

    // Загружаем в игру состояние, которое было ДО хода игрока
    game.load(fenHistory[fenHistory.length - 1]);

    if (movePlayer) {
        await animateUndoStep({from: movePlayer.from, to: movePlayer.to});
        playSound(audioMove);
    }

    // --- ФИНАЛЬНАЯ СИНХРОНИЗАЦИЯ ---
    currentViewIndex = fenHistory.length - 1;
    lastMoveSquares = [];
    selectedSq = null;
    isLocked = false;

    // Отрисовываем чистое состояние
    renderBoard();
}
function animateUndoStep(move) {
    return new Promise(resolve => {
        // Ищем фигуру на клетке, куда она ПРИШЛА (to)
        const currentSqEl = document.querySelector(`[data-pos="${move.to}"]`);
        const targetSqEl = document.querySelector(`[data-pos="${move.from}"]`);
        const pEl = currentSqEl?.querySelector('.piece');

        if (pEl && currentSqEl && targetSqEl) {
            const startRect = currentSqEl.getBoundingClientRect();
            const endRect = targetSqEl.getBoundingClientRect();

            pEl.style.zIndex = "1000";
            pEl.style.transition = "transform 0.2s ease-in-out";
            
            const dx = endRect.left - startRect.left;
            const dy = endRect.top - startRect.top;

            pEl.style.transform = `translate(${dx}px, ${dy}px)`;

            setTimeout(() => {
                // Прячем фигуру ПЕРЕД тем как перерисовать доску, чтобы не было вспышки
                pEl.style.opacity = '0'; 
                
                // Перерисовываем доску (фигуры встанут на места согласно загруженному ранее game.load)
                renderBoard(); 
                resolve();
            }, 200);
        } else {
            // Если фигуры нет (например, мы в истории и что-то сбилось), просто рендерим и выходим
            renderBoard();
            resolve();
        }
    });
}

function idxToPos(r, c) { return String.fromCharCode(97 + c) + (8 - r); }


function updateMoveHistory() {
    const listEl = document.getElementById('history-list');
    listEl.innerHTML = '';
    // Используем moveHistoryLog вместо game.history()
    for (let i = 0; i < moveHistoryLog.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const whiteMove = moveHistoryLog[i];
        const blackMove = moveHistoryLog[i + 1] || '';

        const whiteIdx = i + 1;
        const blackIdx = i + 2;

        const group = document.createElement('div');
        group.className = 'move-group';
        
        group.innerHTML = `
            <span class="move-number">${moveNum}.</span>
            <span class="move-text ${currentViewIndex === whiteIdx ? 'active' : ''}" onclick="jumpToMove(${whiteIdx})">${whiteMove}</span>
            ${blackMove ? `<span class="move-text ${currentViewIndex === blackIdx ? 'active' : ''}" onclick="jumpToMove(${blackIdx})">${blackMove}</span>` : ''}
        `;
        
        listEl.appendChild(group);
    }

    if (gameResultData && window.innerWidth > window.innerHeight) { 
        const resBox = document.createElement('div');
        resBox.className = `game-result-history result-${gameResultData.status}`;
        
        resBox.innerHTML = `
            <div class="result-score">${gameResultData.score}</div>
            <div class="result-text">${gameResultData.msg}</div>
        `;
        
        listEl.appendChild(resBox);
        
        // Автопрокрутка к результату
        setTimeout(() => {
            resBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }

    // Прокрутка к активному ходу (если игры еще идет)
    const activeEl = listEl.querySelector('.active');
    if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
}



async function jumpToMove(index) {
    if (index < 0 || index >= fenHistory.length || index === currentViewIndex) return;

    // Рассчитываем скорость в зависимости от темпа кликов
    const now = Date.now();
    const timeDiff = now - lastHistoryActionTime;
    lastHistoryActionTime = now;

    let duration = 200; 
    if (timeDiff < 150) duration = 100; 
    if (timeDiff < 80) duration = 0;    

    const isStepForward = (index === currentViewIndex + 1);
    const isStepBackward = (index === currentViewIndex - 1);

    // --- ЗВУК ПРИ ДВИЖЕНИИ ВПЕРЕД ---
if (isStepForward && duration > 0) {
    playSound(audioMove);
}
    
    // По желанию можно добавить звук и для движения назад:
    // if (isStepBackward && duration > 0) { audioMove.currentTime = 0; audioMove.play().catch(()=>{}); }

    // Если мы уже анимируем или нажали очень быстро — пропускаем анимацию
    if (!isAnimatingHistory && duration > 0 && (isStepForward || isStepBackward)) {
        isAnimatingHistory = true;
        
        const move = isStepForward ? movesObjectsLog[index - 1] : movesObjectsLog[currentViewIndex - 1];
        const fromPos = isStepForward ? move.from : move.to;
        const toPos = isStepForward ? move.to : move.from;

        await animateVisualMove(fromPos, toPos, duration);
        isAnimatingHistory = false;
    }

    // Обновляем состояние
    currentViewIndex = index;
    game.load(fenHistory[index]);

        // --- НОВОЕ: Обновляем желтую подсветку последнего хода в истории ---
    const lastMove = movesObjectsLog[index - 1];
    lastMoveSquares = lastMove ? [lastMove.from, lastMove.to] : [];
    // -----------------------------------------------------------------

    
    isLocked = (currentViewIndex !== fenHistory.length - 1);
    
    renderBoard();
}

// Универсальная функция визуального перемещения фигуры
function animateVisualMove(from, to, duration) {
    return new Promise(resolve => {
        // Если анимация отключена (duration 0), выходим сразу
        if (duration <= 0) return resolve();

        const fromSq = document.querySelector(`[data-pos="${from}"]`);
        const toSq = document.querySelector(`[data-pos="${to}"]`);
        const pEl = fromSq?.querySelector('.piece');

        if (pEl && fromSq && toSq) {
            const fR = fromSq.getBoundingClientRect();
            const tR = toSq.getBoundingClientRect();
            
            pEl.style.zIndex = "1000";
            pEl.style.transition = `transform ${duration}ms ease-out`; // ease-out для резкости
            pEl.style.transform = `translate(${tR.left - fR.left}px, ${tR.top - fR.top}px)`;
            
            setTimeout(() => {
                pEl.style.transform = ""; 
                resolve();
            }, duration);
        } else {
            resolve();
        }
    });
}

document.addEventListener('keydown', (e) => {
    // Не реагируем, если открыто меню или что-то еще
    if (document.getElementById('new-game-modal').offsetParent !== null) return;

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault(); // Запрещаем скролл страницы стрелками
        
        if (e.key === 'ArrowLeft') {
            jumpToMove(currentViewIndex - 1);
        } 
        else if (e.key === 'ArrowRight') {
            jumpToMove(currentViewIndex + 1);
        } 
        else if (e.key === 'ArrowUp') {
            lastHistoryActionTime = 0; // Сброс времени для мгновенного прыжка
            jumpToMove(0);
        } 
        else if (e.key === 'ArrowDown') {
            lastHistoryActionTime = 0; // Сброс времени для мгновенного прыжка
            jumpToMove(fenHistory.length - 1);
        }
    }
});




function loadAiLevel() {
    const savedLevel = localStorage.getItem('chess-ai-level');
    if (savedLevel) {
        const slider = document.getElementById('level-slider');
        slider.value = savedLevel;
        // Обновляем текст и аватарку в модальном окне сразу после загрузки
        updateLevelText(); 
    }
}

// Обновите ваш window.onload
window.onload = () => {
    loadStats();
    loadBoardTheme(); // Загружаем цвет доски
    loadAiLevel();    // Загружаем сложность
    loadSoundSettings(); // Загружаем звук
};

function handleResponsiveLayout() {
    // ВАЖНО: Если мы в меню (игра скрыта), не трогаем верстку доски
    const gameContainer = document.querySelector('.game-container');
    if (!gameContainer || gameContainer.style.display === 'none') return;

    const isLandscape = window.innerWidth > window.innerHeight;
    
    const mainPlayArea = document.querySelector('.main-play-area');
    const sidePanel = document.querySelector('.side-panel');
    const aiProfile = document.getElementById('ai-profile-box');
    const playerProfile = document.getElementById('player-profile-box');
    const aiTimer = document.getElementById('ai-timer');
    const playerTimer = document.getElementById('player-timer');
    const historyBox = document.getElementById('move-history');
    const bottomBar = document.querySelector('.bottom-bar');
    const boardWrapper = document.getElementById('board-wrapper');

    if (!mainPlayArea || !sidePanel) return;

    if (isLandscape) {
        let rightCol = document.getElementById('landscape-right-col');
        if (!rightCol) {
            rightCol = document.createElement('div');
            rightCol.id = 'landscape-right-col';
            rightCol.className = 'landscape-right-col';
            gameContainer.appendChild(rightCol);
        }

        let infoBlock = document.getElementById('landscape-info-block');
        if (!infoBlock) {
            infoBlock = document.createElement('div');
            infoBlock.id = 'landscape-info-block';
            infoBlock.className = 'landscape-info-block';
            rightCol.appendChild(infoBlock);
        }

        rightCol.style.display = 'flex';
        rightCol.appendChild(aiTimer);
        infoBlock.appendChild(aiProfile);
        infoBlock.appendChild(historyBox);
        infoBlock.appendChild(bottomBar);
        infoBlock.appendChild(playerProfile);
        rightCol.appendChild(infoBlock);
        rightCol.appendChild(playerTimer);

        mainPlayArea.appendChild(boardWrapper);
        sidePanel.style.display = 'none';
    } else {
        aiProfile.appendChild(aiTimer);
        playerProfile.appendChild(playerTimer);
        mainPlayArea.appendChild(aiProfile);
        mainPlayArea.appendChild(boardWrapper);
        mainPlayArea.appendChild(playerProfile);
        
        sidePanel.style.display = '';
        sidePanel.appendChild(historyBox);
        sidePanel.appendChild(bottomBar);

        const rightCol = document.getElementById('landscape-right-col');
        if (rightCol) rightCol.style.display = 'none';
    }
}

// Слушатель событий resize должен быть активен всегда
window.addEventListener('resize', handleResponsiveLayout);



// ==========================================
// НОВЫЕ ФУНКЦИИ: МЕНЮ, ДОМОЙ И СДАЧА
// ==========================================

// Показать главное меню
function showStartMenu() {
    // 1. Скрываем загрузочный экран
    const loader = document.getElementById('loading-screen');
    if (loader) loader.style.display = 'none';
 
    // 2. Показываем стартовое меню
    const startMenu = document.getElementById('start-menu');
    if (startMenu) {
        startMenu.style.display = 'flex';
        startMenu.classList.remove('hidden');
    }
    
    // 3. Убеждаемся, что контейнер с игрой скрыт
    const gameContainer = document.querySelector('.game-container');
    if (gameContainer) {
        gameContainer.style.display = 'none';
    }
    
    // 4. Обновляем рекорд в меню (если есть такой ID)
    const scoreEl = document.getElementById('start-menu-score');
    if (scoreEl) {
        scoreEl.textContent = 'Best: ' + totalScore;
    }
    
    // 5. Устанавливаем режим игры по умолчанию
    gameMode = 'standard';

    // Для VK Bridge "App Ready" уже был отправлен в initVK через VKWebAppInit.
    // Больше никаких лишних вызовов не требуется.
    console.log("Главное меню загружено");
}

// Кнопка: ИГРАТЬ С КОМПЬЮТЕРОМ
function startGameVsComputer() {
    document.getElementById('start-menu').style.display = 'none';
    document.getElementById('start-menu').classList.add('hidden');
    
    document.querySelector('.game-container').style.display = 'flex';
    updatePlayerProfileUI(); 
    handleResponsiveLayout();
    
    // ДОБАВЬТЕ ЭТУ СТРОКУ:
    // Это нарисует начальную позицию за окном настроек, чтобы доска не была пустой
    if (game.fen() === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
        renderBoard(); 
    }

// Вместо скрытия каждой кнопки отдельно
if (gameMode === 'middlegame') {
    document.getElementById('color-select-container').style.display = 'none';
} else {
    document.getElementById('color-select-container').style.display = 'flex';
}

    openNewGameModal(false); 
}

// Кнопка: ДОМОЙ (В меню)
// 1. Нажатие на кнопку "Домой"
function goHome() {
    const isGameActive = localStorage.getItem('gameInProgress') === 'true' && !game.game_over() && fenHistory.length > 1;

    if (isGameActive) {
        // Показываем кастомное окно подтверждения
        stopGameplay();
        const modal = document.getElementById('exit-confirm-modal');
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    } else {
        // Если игры нет или она окончена — выходим сразу
        forceGoHome();
    }
}

// 2. Закрыть окно подтверждения (кнопка "Остаться")
function closeExitModal() {
    const modal = document.getElementById('exit-confirm-modal');
    modal.style.display = 'none';
    modal.classList.add('hidden');
    startGameplay();
}

// 3. Реальный выход (кнопка "Выйти" или если игры нет)
function forceGoHome() {
    document.getElementById('exit-confirm-modal').style.display = 'none';
    document.getElementById('exit-confirm-modal').classList.add('hidden');

    // Если игра шла — засчитываем поражение
    if (localStorage.getItem('gameInProgress') === 'true') {
        localStorage.removeItem('gameInProgress');
        updateStats('loss');
    }

    closeNewGameModal();
    stopTimer();
    stopEngines();
    stopGameplay();
    gameMode = 'standard';
    lastMoveSquares = [];
    showStartMenu();
}
// Кнопка: ЗАНОВО
function restartGame() {
    // Если игра еще идет и сделан хотя бы один ход, спрашиваем подтверждение,
    // чтобы игрок случайно не сбросил прогресс.
    /*if (!game.game_over() && fenHistory.length > 1) {
        if (!confirm("Вы уверены, что хотите начать заново?")) {
            return;
        }
    }
    */
    // Останавливаем текущие процессы
    stopTimer();
    stopEngines();
    
    // Запускаем новую игру с теми же настройками
    // В режиме случайной позиции это автоматически загрузит НОВУЮ задачу
    startNewGame();
}




// ПЕРЕКЛЮЧЕНИЕ ТЕМЫ
function toggleTheme() {
    const html = document.documentElement;
    const theme = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', theme);
    localStorage.setItem('chess-theme', theme);
    updateMaterialDisplay();
    saveToCloud();
}

// ЗАГРУЗИТЬ СОХРАНЁННУЮ ТЕМУ
window.addEventListener('load', () => {
    const saved = localStorage.getItem('chess-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
});




let lastAdviceIndex = -1;

function showRandomAdvice() {
    const adviceEl = document.getElementById('advice-text');
    if (!adviceEl) return;

    let newIndex;
    // Цикл, пока не выберем индекс, отличный от предыдущего
    do {
        newIndex = Math.floor(Math.random() * advices.length);
    } while (newIndex === lastAdviceIndex && advices.length > 1);

    lastAdviceIndex = newIndex;
    adviceEl.textContent = advices[newIndex];
}

// При загрузке показываем первый совет
window.addEventListener('load', () => {
    showRandomAdvice(); 
});







// Открытие окна настроек
function openGeneralSettingsModal() {
    stopGameplay();
    const modal = document.getElementById('general-settings-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
        syncSettingsUI();
    }
}

// Закрытие окна настроек
function closeGeneralSettingsModal() {
    const modal = document.getElementById('general-settings-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden'); // Обязательно добавляем класс обратно!
    }
    startGameplay();
}

function syncSettingsUI() {
    // 1. Синхронизируем Тему (День/Ночь)
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const themeSwitch = document.getElementById('theme-switch');
    if (themeSwitch) {
        if (isDark) themeSwitch.classList.add('active');
        else themeSwitch.classList.remove('active');
    }

    // 2. Синхронизируем Звук (Переключатель в модалке)
    const soundSwitch = document.getElementById('sound-switch');
    if (soundSwitch) {
        if (isSoundEnabled) soundSwitch.classList.add('active');
        else soundSwitch.classList.remove('active');
    }

    // 3. Синхронизируем выбор доски
    const currentBoard = localStorage.getItem('chess-board-theme') || 'classic';
    document.querySelectorAll('.board-theme-preview').forEach(el => el.classList.remove('active'));
    const boardThemeEl = document.getElementById('board-theme-' + currentBoard);
    if (boardThemeEl) boardThemeEl.classList.add('active');

    // 4. Синхронизируем набор фигур
    document.querySelectorAll('.piece-preview').forEach(el => el.classList.remove('active'));
    const pieceEl = document.getElementById('piece-set-' + currentPieceSet);
    if (pieceEl) pieceEl.classList.add('active');

    // --- ВОТ ЭТО НУЖНО ДОБАВИТЬ ---
    // Обновляем текст и иконки звука в СТАРТОВОМ МЕНЮ под текущий язык
    updateSoundUI(); 
}

// Переопределим toggleTheme и toggleSound, чтобы они красиво обновляли свитчи
const oldToggleTheme = toggleTheme;
toggleTheme = function() {
    oldToggleTheme();
    syncSettingsUI();
};

const oldToggleSound = toggleSound;
toggleSound = function() {
    oldToggleSound();
    syncSettingsUI();
};

// В функции changeBoardTheme тоже добавим обновление UI
function changeBoardTheme(theme) {
    const board = document.getElementById('board');
    if (!board) return;

    // 1. Убираем старые классы и ставим новый
    board.classList.remove('board-classic', 'board-green', 'board-ash');
    board.classList.add('board-' + theme);

    // 2. Сохраняем выбор в память браузера
    localStorage.setItem('chess-board-theme', theme);

    // 3. Обновляем визуальные рамки в окне настроек
    syncSettingsUI();

    // 4. Перерисовываем доску, чтобы цвета обновились мгновенно
    renderBoard();
    updatePieceCellColor();
}
function loadBoardTheme() {
    const savedBoard = localStorage.getItem('chess-board-theme') || 'classic';
    const board = document.getElementById('board');
    
    if (board) {
        board.classList.remove('board-classic', 'board-green', 'board-ash');
        board.classList.add('board-' + savedBoard);
    }
    updatePieceCellColor();
}
// Закрытие окна оформления при клике на темный фон
// Универсальный обработчик клика по фону для всех окон
window.addEventListener('mousedown', function(event) {
    const settingsModal = document.getElementById('general-settings-modal');
    const newGameModal = document.getElementById('new-game-modal');
    const statsModal = document.getElementById('stats-modal');
    const leaderboardModal = document.getElementById('leaderboard-modal');
    const exitModal = document.getElementById('exit-confirm-modal'); // Наше новое окно

    // 1. Окно настроек оформления
    if (event.target === settingsModal) {
        closeGeneralSettingsModal();
    }

    // 2. Окно статистики
    if (event.target === statsModal) {
        closeStatsModal();
    }

    // 3. Окно рейтинга
    if (event.target === leaderboardModal) {
        closeLeaderboardModal();
    }

    // 4. НОВОЕ: Окно подтверждения выхода
    // Если кликнули мимо (на темный фон), считаем, что игрок передумал выходить
    if (event.target === exitModal) {
        closeExitModal();
    }

    // 5. Окно новой игры (закрываем только если разрешено)
    if (event.target === newGameModal) {
        if (canCancelNewGame) {
            closeNewGameModal();
        } else {
            const content = newGameModal.querySelector('div');
            content.classList.add('shake');
            setTimeout(() => content.classList.remove('shake'), 400);
        }
    }
});


const myMockEntry = { name: "Вы", score: totalScore, place: 12 };

// --- 1. ЛИДЕРБОРД ДЛЯ БОКОВОЙ ПАНЕЛИ (Если она скрыта, код всё равно сработает без ошибок) ---
async function renderLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list || !supabaseClient) return;

    const t = i18n[lang] || i18n.en;

    try {
        // Запрашиваем Топ-7 игроков, сортировка по убыванию (от большего к меньшему)
        const { data: topPlayers, error } = await supabaseClient
            .from('leaderboard')
            .select('*')
            .order('score', { ascending: false })
            .limit(7);

        if (error) throw error;

        list.innerHTML = '';
        
        const currentId = vkUserId ? String(vkUserId) : 'local_test_user_1';
        let isUserInTop = false;

        // Рисуем список Топ-7
        topPlayers.forEach((e, i) => {
            const rank = i + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
            if (e.id === currentId) isUserInTop = true;

            const row = document.createElement('div');
            row.className = 'lb-row';
            row.innerHTML = `
                <span class="lb-place" style="width:20px; text-align:center;">${medal || rank}</span>
                <img class="lb-avatar" src="${e.avatar || 'img/avatars/1.png'}" style="margin-left:4px;">
                <span class="lb-name ${e.id === currentId ? 'me' : ''}">${e.name || t.player}</span>
                <span class="lb-score ${e.id === currentId ? 'me' : ''}">${e.score}</span>
            `;
            list.appendChild(row);
        });

        // Если тебя нет в Топ-7, прилепим тебя снизу
        if (!isUserInTop) {
            // Узнаем твое реальное место (считаем, сколько людей имеют строго больше очков)
            const { count } = await supabaseClient
                .from('leaderboard')
                .select('*', { count: 'exact', head: true })
                .gt('score', totalScore);

            const myRank = count !== null ? count + 1 : '-';

            const divider = document.createElement('div');
            divider.className = 'lb-divider';
            list.appendChild(divider);

            const myAvatar = (player && player.photo_100) ? player.photo_100 : 'img/avatars/1.png';

            const myRow = document.createElement('div');
            myRow.className = 'lb-row';
            myRow.innerHTML = `
                <span class="lb-place" style="width:20px; text-align:center;">${myRank}</span>
                <img class="lb-avatar" src="${myAvatar}" style="margin-left:4px;">
                <span class="lb-name me">${t.me}</span>
                <span class="lb-score me">${totalScore}</span>
            `;
            list.appendChild(myRow);
        }
    } catch (err) {
        console.warn('Ошибка загрузки лидерборда (боковая панель):', err);
    }
}

// --- 2. ЛИДЕРБОРД ДЛЯ МОДАЛЬНОГО ОКНА (Главное меню) ---
async function openLeaderboardModal() {
    stopGameplay();
    const modal = document.getElementById('leaderboard-modal');
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    
    const t = i18n[lang] || i18n.en;
    
    const myNameLabel = document.getElementById('lbm-me-text');
    if (myNameLabel) myNameLabel.textContent = t.me;

    const myScoreEl = document.getElementById('lbm-my-score');
    if (myScoreEl) myScoreEl.textContent = totalScore;

    if (!supabaseClient) return;

    // Очищаем старый подиум, чтобы не мелькали прошлые аватарки
    [1, 2, 3].forEach(pos => {
        const avatarEl = document.getElementById(`lbm-avatar-${pos}`);
        if(avatarEl) avatarEl.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        const nameEl = document.getElementById(`lbm-name-${pos}`);
        if(nameEl) nameEl.textContent = '---';
        const scoreEl = document.getElementById(`lbm-score-${pos}`);
        if(scoreEl) scoreEl.textContent = '';
    });

    try {
        // Запрашиваем Топ-7
        const { data: topPlayers, error } = await supabaseClient
            .from('leaderboard')
            .select('*')
            .order('score', { ascending: false })
            .limit(7);

        if (error) throw error;

        const currentId = vkUserId ? String(vkUserId) : 'local_test_user_1';
        let isUserInTop = false;

        // Заполняем Подиум (Топ 1-3)
        topPlayers.slice(0, 3).forEach((e, i) => {
            const rank = i + 1;
            if (e.id === currentId) isUserInTop = true;

            const avatarEl = document.getElementById(`lbm-avatar-${rank}`);
            if (avatarEl) avatarEl.src = e.avatar || 'img/avatars/1.png';
            
            const nameEl = document.getElementById(`lbm-name-${rank}`);
            if (nameEl) nameEl.textContent = e.name || t.player;
            
            const scoreEl = document.getElementById(`lbm-score-${rank}`);
            if (scoreEl) scoreEl.textContent = e.score;
        });

        // Заполняем Список (Места 4-7)
        const list = document.getElementById('lb-modal-list');
        if (list) {
            list.innerHTML = '';
            topPlayers.slice(3, 7).forEach((e, i) => {
                const rank = i + 4;
                if (e.id === currentId) isUserInTop = true;

                const row = document.createElement('div');
                row.className = 'lb-row';
                row.innerHTML = `
                    <span class="lb-place">${rank}</span>
                    <img class="lb-avatar" src="${e.avatar || 'img/avatars/1.png'}">
                    <span class="lb-name ${e.id === currentId ? 'me' : ''}">${e.name || t.player}</span>
                    <span class="lb-score ${e.id === currentId ? 'me' : ''}">${e.score}</span>
                `;
                list.appendChild(row);
            });
        }

        // Логика нижней плашки "Вы"
        const divider = document.querySelector('.lb-divider');
        const myRow = divider ? divider.nextElementSibling : null;

        if (isUserInTop) {
            // Если мы уже в топе на экране, скрываем нижнюю плашку
            if (divider) divider.style.display = 'none';
            if (myRow) myRow.style.display = 'none';
        } else {
            // Если мы ниже 7 места, показываем плашку
            if (divider) divider.style.display = '';
            if (myRow) {
                myRow.style.display = 'flex';
                const myNameMe = myRow.querySelector('.lb-name.me');
                if (myNameMe) myNameMe.textContent = t.me; 
            }
            
            // Вычисляем реальное место
            const { count } = await supabaseClient
                .from('leaderboard')
                .select('*', { count: 'exact', head: true })
                .gt('score', totalScore);

            const myRank = count !== null ? count + 1 : '-';

            const myPlaceEl = document.getElementById('lbm-my-place');
            if (myPlaceEl) myPlaceEl.textContent = myRank;
            
            const myRowScoreEl = myRow ? myRow.querySelector('.lb-score.me') : null;
            if (myRowScoreEl) myRowScoreEl.textContent = totalScore;
        }

    } catch (err) {
        console.warn('Ошибка загрузки лидерборда (модалка):', err);
    }
}


function closeLeaderboardModal() {
    const modal = document.getElementById('leaderboard-modal');
    modal.style.display = 'none';
    modal.classList.add('hidden');
    startGameplay();
}




// --- УПРАВЛЕНИЕ GAMEPLAY API ЯНДЕКСА ---
let isGameplayRunning = false;

function startGameplay() {}
function stopGameplay() {}

// Остановка геймплея при сворачивании браузера или переключении вкладок
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopGameplay();
    } else {
        startGameplay(); // startGameplay сама проверит, можно ли запускать
    }
});





let currentRoomId = null;
let myColor = 'w'; // По умолчанию создатель играет белыми

async function startFriendGame() {
    // 1. Создаем уникальный ID комнаты (простой рандом)
    currentRoomId = 'room_' + Math.random().toString(36).substr(2, 9);
    myColor = 'w'; // Создатель — всегда белые
    gameMode = 'pvp'; // Устанавливаем режим PvP

    // 2. Создаем запись в базе Supabase
    // ВАЖНО: Убедись, что колонки white_name и white_avatar созданы в Supabase!
    const { error } = await supabaseClient.from('rooms').insert({
        id: currentRoomId,
        white_id: String(vkUserId),
        white_name: (player && player.first_name) ? player.first_name : "Игрок",
        white_avatar: (player && player.photo_100) ? player.photo_100 : "img/avatars/1.png",
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w'
    });

    if (error) {
        console.error("Supabase Error:", error.message);
        alert("Ошибка создания комнаты: " + error.message);
        return;
    }

    // 3. Формируем ссылку (ЗАМЕНИ 1234567 НА СВОЙ ID)
    const appId = '54514087'; // Твой ID из настроек ВК
    const shareLink = `https://vk.com/app${appId}#${currentRoomId}`;

    // 4. Открываем окно "Поделиться" в ВК
    vkBridge.send("VKWebAppShare", {
        link: shareLink,
        message: "Давай сыграем в шахматы! Я жду твоего хода. ♟️"
    });

    // 5. Заходим в комнату и подписываемся на Realtime
    joinRoom(currentRoomId);
}





let roomSubscription = null;

function joinRoom(roomId) {
    console.log("Выполняется joinRoom для комнаты:", roomId);
    currentRoomId = roomId;
    gameMode = 'pvp';

    const roomChannel = supabaseClient
        .channel(`room_${roomId}`)
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'rooms', 
            filter: `id=eq.${roomId}` 
        }, payload => {
            const newData = payload.new;
            if (newData.fen !== game.fen()) {
                game.load(newData.fen);
                renderBoard();
                checkStatus();
                isLocked = (game.turn() !== myColor);
                
                // Обновляем историю
                fenHistory.push(game.fen());
                currentViewIndex = fenHistory.length - 1;
                updateMoveHistory();
            }
            updateOpponentProfileFromRoom();
        })
        .subscribe();

    startGameVsFriend();
}

function startGameVsFriend() {
    console.log("Выполняется startGameVsFriend, переключаем экран...");
    
    // Прячем ВСЕ возможные меню
    document.getElementById('start-menu').style.display = 'none';
    document.getElementById('start-menu').classList.add('hidden');
    document.getElementById('new-game-modal').style.display = 'none'; // На всякий случай
    
    // Показываем контейнер игры
    document.querySelector('.game-container').style.display = 'flex';

    game = new Chess();
    playerColor = myColor; 
    isBoardFlipped = (playerColor === 'b');
    isLocked = (game.turn() !== playerColor);

    renderBoard();
    updatePlayerProfileUI();
    updateOpponentProfileFromRoom();
    console.log("Экран PvP готов. Мой цвет:", myColor);
}


// Внутри finalizeMove(from, to, promotion)
async function syncMoveToSupabase() {
    if (gameMode === 'pvp' && currentRoomId) {
        await supabaseClient
            .from('rooms')
            .update({ 
                fen: game.fen(), 
                last_move: `${from}-${to}`,
                turn: game.turn()
            })
            .eq('id', currentRoomId);
    }
}



async function updateOpponentProfileFromRoom() {
    if (!currentRoomId || !supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('rooms')
        .select('*')
        .eq('id', currentRoomId)
        .single();

    if (data) {
        // Если мы белые, противник — черный, и наоборот
        const opponentName = (myColor === 'w') ? data.black_name : data.white_name;
        const opponentAvatar = (myColor === 'w') ? data.black_avatar : data.white_avatar;
        
        if (opponentName) {
            document.getElementById('name-ai').textContent = opponentName;
        }
        
        const aiAvatarBox = document.getElementById('ai-profile-box').querySelector('.avatar');
        if (opponentAvatar && aiAvatarBox) {
            aiAvatarBox.innerHTML = `<img src="${opponentAvatar}" style="width:100%; height:100%; border-radius:24%; object-fit:cover;">`;
        }
    }
}
