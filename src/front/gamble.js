const SYMBOLS = [
    { id: 'banana', glyph: '🍌', weight: 22000, pays: [0.6, 4, 15, 50], tone: '#ffd93d' },
    { id: 'watermelon', glyph: '🍉', weight: 18000, pays: [0.5, 6, 25, 80], tone: '#ff6b81' },
    { id: 'plum', glyph: '🫐', weight: 16000, pays: [0, 14, 60, 180], tone: '#9b6dff' },
    { id: 'apple', glyph: '🍎', weight: 14000, pays: [0, 20, 100, 300], tone: '#ff5a5a' },
    { id: 'grape', glyph: '🍇', weight: 12000, pays: [0, 28, 160, 550], tone: '#b08bff' },
    { id: 'heart', glyph: '❤️', weight: 9000, pays: [0, 40, 260, 1100], tone: '#ff3b6b' },
    { id: 'skull', glyph: '💀', weight: 5000, pays: [0, 70, 700, 6000], tone: '#d7dce6' },
    { id: 'bomb10', glyph: '💣', weight: 260, pays: [0, 0, 0, 0], tone: '#7ce0c0', multiplier: 10 },
    { id: 'bomb25', glyph: '💣', weight: 75, pays: [0, 0, 0, 0], tone: '#6ec7ff', multiplier: 25 },
    { id: 'bomb100', glyph: '💣', weight: 13, pays: [0, 0, 0, 0], tone: '#ffb347', multiplier: 100 },
    { id: 'bomb1000', glyph: '💣', weight: 1, pays: [0, 0, 0, 0], tone: '#ff4fd8', multiplier: 1000 },
];
const REELS = 5;
const ROWS = 3;
const STRIP_LENGTH = 24;
const BET_STEPS = [10, 25, 50, 100];
const START_BALANCE = 1000;
const STORAGE_KEY = 'intermap.gamble';
const TOTAL_WEIGHT = SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
let seed = (Date.now() ^ 0x5f3759df) >>> 0;
function nextRandom() {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 0x100000000;
}
function pickSymbol() {
    let ticket = nextRandom() * TOTAL_WEIGHT;
    for (const symbol of SYMBOLS) {
        ticket -= symbol.weight;
        if (ticket <= 0)
            return symbol;
    }
    return SYMBOLS[SYMBOLS.length - 1];
}
function evaluateLine(line) {
    let bombPay = 0;
    let bombCount = 0;
    for (const symbol of line) {
        if (symbol.multiplier) {
            bombPay += symbol.multiplier;
            bombCount += 1;
        }
    }
    const first = line[0];
    if (first.multiplier)
        return { matched: 0, symbol: null, linePay: 0, bombPay, bombCount };
    let matched = 1;
    while (matched < line.length && line[matched].id === first.id)
        matched += 1;
    const linePay = matched >= 2 ? first.pays[matched - 2] : 0;
    if (linePay <= 0)
        return { matched: 0, symbol: null, linePay: 0, bombPay, bombCount };
    return { matched, symbol: first, linePay, bombPay, bombCount };
}
function readBalance() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null)
            return START_BALANCE;
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : START_BALANCE;
    }
    catch (error) {
        return START_BALANCE;
    }
}
function writeBalance(value) {
    try {
        localStorage.setItem(STORAGE_KEY, String(value));
    }
    catch (error) {
    }
}
function easeOutBack(t) {
    const c1 = 1.15;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function buildMarkup() {
    const reels = Array.from({ length: REELS }, (_, index) => `
        <div class="gamble-reel" data-reel="${index}"><div class="gamble-strip"></div></div>`).join('');
    const bets = BET_STEPS.map((bet, index) => `
        <button type="button" class="gamble-bet${index === 0 ? ' is-active' : ''}" data-bet="${bet}">${bet}</button>`).join('');
    return `
        <div class="gamble-card" role="dialog" aria-modal="true" aria-labelledby="gamble-title">
            <button type="button" class="gamble-close" id="gamble-close" aria-label="Закрыть">×</button>

            <header class="gamble-head">
                <h2 id="gamble-title">Gamble</h2>
                <p class="gamble-sub">Пять барабанов, линия по центру. Нажмите на поле, чтобы крутить.</p>
            </header>

            <div class="gamble-stats">
                <div class="gamble-stat">
                    <span class="gamble-stat-label">Баланс</span>
                    <strong class="gamble-stat-value" id="gamble-balance">0</strong>
                </div>
                <div class="gamble-stat gamble-stat-bets">
                    <span class="gamble-stat-label">Ставка</span>
                    <div class="gamble-bets" id="gamble-bets">${bets}</div>
                </div>
                <div class="gamble-stat">
                    <span class="gamble-stat-label">Выигрыш</span>
                    <strong class="gamble-stat-value gamble-win-value" id="gamble-win">0</strong>
                </div>
            </div>

            <div class="gamble-machine" id="gamble-machine" role="button" tabindex="0" aria-label="Крутить барабаны">
                <div class="gamble-reels">${reels}</div>
                <div class="gamble-line" aria-hidden="true"></div>
                <div class="gamble-hint" id="gamble-hint">Нажмите, чтобы крутить</div>
            </div>

            <p class="gamble-message" id="gamble-message" role="status" aria-live="polite"></p>
        </div>`;
}
class SlotMachine {
    constructor(root) {
        this.reels = [];
        this.symbolHeight = 96;
        this.balance = readBalance();
        this.bet = BET_STEPS[0];
        this.spinning = false;
        this.rafId = 0;
        this.lastFrame = 0;
        this.pendingLine = [];
        this.root = root;
        this.balanceOut = this.query('#gamble-balance');
        this.winOut = this.query('#gamble-win');
        this.message = this.query('#gamble-message');
        this.hint = this.query('#gamble-hint');
        this.machine = this.query('#gamble-machine');
        this.betsBox = this.query('#gamble-bets');
        this.root.querySelectorAll('.gamble-reel').forEach((element) => {
            const strip = element.querySelector('.gamble-strip');
            for (let i = 0; i < STRIP_LENGTH + ROWS; i += 1) {
                strip.appendChild(this.createCell(pickSymbol()));
            }
            this.reels.push({
                element,
                strip,
                offset: Math.floor(nextRandom() * STRIP_LENGTH) * this.symbolHeight,
                speed: 0,
                stopAt: null,
                settling: false,
                settleFrom: 0,
                settleTo: 0,
                settleStart: 0,
                settleDuration: 0,
            });
        });
        this.machine.addEventListener('click', () => this.spin());
        this.machine.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ')
                return;
            event.preventDefault();
            this.spin();
        });
        this.betsBox.addEventListener('click', (event) => {
            const target = event.target.closest('.gamble-bet');
            if (!target || this.spinning)
                return;
            const value = Number.parseInt(target.dataset.bet ?? '', 10);
            if (!Number.isFinite(value))
                return;
            this.bet = value;
            this.betsBox.querySelectorAll('.gamble-bet').forEach((node) => node.classList.remove('is-active'));
            target.classList.add('is-active');
        });
        window.addEventListener('resize', () => this.measure());
        new ResizeObserver(() => this.measure()).observe(this.machine);
        this.renderBalance();
        this.measure();
    }
    measure() {
        const cell = this.root.querySelector('.gamble-cell');
        if (!cell)
            return;
        const height = Number.parseFloat(getComputedStyle(cell).height);
        if (!Number.isFinite(height) || height <= 0 || this.spinning)
            return;
        const ratio = height / this.symbolHeight;
        this.symbolHeight = height;
        for (const reel of this.reels) {
            reel.offset = Math.round((reel.offset * ratio) / height) * height;
        }
        this.render();
    }
    query(selector) {
        return this.root.querySelector(selector);
    }
    createCell(symbol) {
        const cell = document.createElement('div');
        cell.className = 'gamble-cell';
        const face = document.createElement('span');
        face.className = 'gamble-face';
        const mult = document.createElement('span');
        mult.className = 'gamble-mult';
        cell.append(face, mult);
        this.paintCell(cell, symbol);
        return cell;
    }
    paintCell(cell, symbol) {
        cell.dataset.symbol = symbol.id;
        cell.style.setProperty('--tone', symbol.tone);
        cell.classList.toggle('is-bomb', Boolean(symbol.multiplier));
        const face = cell.querySelector('.gamble-face');
        const mult = cell.querySelector('.gamble-mult');
        if (face)
            face.textContent = symbol.glyph;
        if (mult)
            mult.textContent = symbol.multiplier ? `×${symbol.multiplier}` : '';
    }
    renderBalance() {
        this.balanceOut.textContent = this.balance.toLocaleString('ru-RU');
    }
    get stripHeight() {
        return this.symbolHeight * STRIP_LENGTH;
    }
    render() {
        for (const reel of this.reels) {
            const shift = ((reel.offset % this.stripHeight) + this.stripHeight) % this.stripHeight;
            reel.strip.style.transform = `translate3d(0, ${-shift}px, 0)`;
        }
    }
    setCell(reelIndex, cellIndex, symbol) {
        const reel = this.reels[reelIndex];
        const write = (index) => {
            const cell = reel.strip.children[index];
            if (!cell)
                return;
            this.paintCell(cell, symbol);
        };
        write(cellIndex);
        if (cellIndex < ROWS)
            write(cellIndex + STRIP_LENGTH);
    }
    centerIndexFor(offset) {
        const shift = ((offset % this.stripHeight) + this.stripHeight) % this.stripHeight;
        return (Math.round(shift / this.symbolHeight) + 1) % STRIP_LENGTH;
    }
    centerCell(reelIndex) {
        const reel = this.reels[reelIndex];
        const index = this.centerIndexFor(reel.offset);
        return reel.strip.children[index] ?? null;
    }
    refreshStrip(reelIndex) {
        const reel = this.reels[reelIndex];
        for (let i = 0; i < STRIP_LENGTH; i += 1) {
            this.setCell(reelIndex, i, pickSymbol());
        }
        reel.strip.querySelectorAll('.is-win').forEach((cell) => cell.classList.remove('is-win'));
    }
    spin() {
        if (this.spinning)
            return;
        if (this.balance < this.bet) {
            this.message.textContent = 'Баланс закончился, алмазы очень близко.';
            this.message.dataset.tone = 'lose';
            return;
        }
        this.measure();
        this.spinning = true;
        this.balance -= this.bet;
        this.renderBalance();
        writeBalance(this.balance);
        this.winOut.textContent = '0';
        this.winOut.classList.remove('is-hot');
        this.message.textContent = '';
        this.message.dataset.tone = '';
        this.hint.classList.add('is-hidden');
        this.machine.classList.add('is-spinning');
        this.root.querySelectorAll('.gamble-cell.is-win').forEach((cell) => cell.classList.remove('is-win'));
        this.pendingLine = Array.from({ length: REELS }, () => pickSymbol());
        const now = performance.now();
        this.reels.forEach((reel, index) => {
            this.refreshStrip(index);
            reel.speed = this.symbolHeight * (26 + nextRandom() * 8);
            reel.settling = false;
            reel.stopAt = now + 420 + index * 175 + nextRandom() * 110;
        });
        this.lastFrame = now;
        if (!this.rafId)
            this.rafId = requestAnimationFrame((time) => this.frame(time));
    }
    frame(time) {
        const delta = Math.min((time - this.lastFrame) / 1000, 0.05);
        this.lastFrame = time;
        let active = false;
        this.reels.forEach((reel, index) => {
            if (reel.settling) {
                const progress = Math.min((time - reel.settleStart) / reel.settleDuration, 1);
                reel.offset = reel.settleFrom + (reel.settleTo - reel.settleFrom) * easeOutBack(progress);
                if (progress < 1) {
                    active = true;
                }
                else {
                    reel.offset = reel.settleTo;
                    reel.settling = false;
                    reel.stopAt = null;
                    this.onReelStopped(index);
                }
                return;
            }
            if (reel.stopAt === null)
                return;
            active = true;
            reel.offset += reel.speed * delta;
            if (time >= reel.stopAt) {
                const target = Math.ceil((reel.offset + this.symbolHeight * 3) / this.symbolHeight) * this.symbolHeight;
                reel.settleFrom = reel.offset;
                reel.settleTo = target;
                reel.settleStart = time;
                reel.settleDuration = 480;
                reel.settling = true;
                this.setCell(index, this.centerIndexFor(target), this.pendingLine[index]);
            }
        });
        this.render();
        if (active) {
            this.rafId = requestAnimationFrame((next) => this.frame(next));
        }
        else {
            this.rafId = 0;
            this.finishSpin();
        }
    }
    onReelStopped(index) {
        const reel = this.reels[index];
        reel.element.classList.remove('is-landing');
        void reel.element.offsetWidth;
        reel.element.classList.add('is-landing');
    }
    finishSpin() {
        this.spinning = false;
        this.machine.classList.remove('is-spinning');
        const outcome = evaluateLine(this.pendingLine);
        const win = Math.round((outcome.linePay + outcome.bombPay) * this.bet);
        if (win > 0) {
            this.balance += win;
            this.renderBalance();
            writeBalance(this.balance);
            this.winOut.textContent = `+${win.toLocaleString('ru-RU')}`;
            this.winOut.classList.add('is-hot');
            const parts = [];
            if (outcome.symbol)
                parts.push(`${outcome.symbol.glyph} ×${outcome.matched} — ×${outcome.linePay}`);
            if (outcome.bombPay > 0)
                parts.push(`💣 ${outcome.bombCount > 1 ? `${outcome.bombCount} шт. — ` : ''}×${outcome.bombPay}`);
            this.message.textContent = parts.join('  +  ');
            this.message.dataset.tone = 'win';
            for (let i = 0; i < outcome.matched; i += 1) {
                this.centerCell(i)?.classList.add('is-win');
            }
            if (outcome.bombPay > 0) {
                this.pendingLine.forEach((symbol, index) => {
                    if (symbol.multiplier)
                        this.centerCell(index)?.classList.add('is-win');
                });
            }
            this.machine.classList.add('is-win');
            window.setTimeout(() => this.machine.classList.remove('is-win'), 1000);
        }
        else {
            this.message.textContent = 'Линии нет. Совпадения слева выпадают чаще, чем кажется.';
            this.message.dataset.tone = 'lose';
        }
        this.hint.classList.remove('is-hidden');
    }
}
let overlay = null;
let machine = null;
function closeGamble() {
    if (!overlay)
        return;
    overlay.classList.remove('is-open');
    document.body.classList.remove('gamble-open');
    window.setTimeout(() => overlay?.setAttribute('hidden', ''), 220);
}
function openGamble() {
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'gamble-overlay';
        overlay.setAttribute('hidden', '');
        overlay.innerHTML = buildMarkup();
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay)
                closeGamble();
        });
        overlay.querySelector('#gamble-close')?.addEventListener('click', () => closeGamble());
        machine = new SlotMachine(overlay);
    }
    overlay.removeAttribute('hidden');
    document.body.classList.add('gamble-open');
    requestAnimationFrame(() => {
        overlay?.classList.add('is-open');
        machine?.measure();
    });
}
export function initGamble() {
    const button = document.getElementById('gamble-btn');
    if (!button)
        return;
    button.addEventListener('click', () => openGamble());
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && overlay && !overlay.hasAttribute('hidden'))
            closeGamble();
    });
}
