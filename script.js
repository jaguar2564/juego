// =========================================================================
// TUERCA Y EL RESCATE DE M MICHI - script.js (versión corregida)
// =========================================================================

// ---------- 1. SELECTORES Y CONFIGURACIÓN GENERAL ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const startScreen = document.getElementById('start-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const winScreen = document.getElementById('win-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const nextBtn = document.getElementById('next-btn');
const pauseScreen = document.getElementById('pause-screen');
const resumeBtn = document.getElementById('resume-btn');
const recordText = document.getElementById('record-text');

const CX = canvas.width / 2;
const CY = canvas.height / 2;
const CANTIDAD_NIVELES = 6;
const ENERGIA_MAX = 100;
const SNACKS_NECESARIOS = 3;
const CAJA_X = canvas.width - 85;
const CAJA_Y = CY - 15;

const pistaFondo = { cx: CX, cy: CY, ancho: 260, alto: 130 };
const pistaFrente = { cx: CX, cy: CY, ancho: 740, alto: 360 };

// Límites donde pueden moverse los obstáculos y el robot
const LIM_X_MIN = 20;
const LIM_X_MAX = canvas.width - 20;
const Y_MIN = CY - pistaFrente.alto / 2 + 15; // 60
const Y_MAX = CY + pistaFrente.alto / 2 - 15; // 390

// ---------- 2. DATOS DEL JUEGO ----------
const nombreRobot = "Tuerca";
const nombreGato = "M michi";

// Cada sector se describe con un objeto: agregar o cambiar niveles es fácil
const niveles = [
    { nombre: "Sector 1: Conectores de Popa - Conexión Tranquila" },
    { nombre: "Sector 2: Laboratorio Hidropónico - ¡ATAQUE DE ASPIRADORA!", aspiradora: true },
    { nombre: "Sector 3: Sector de Impacto - ¡BATERÍA DETECTADA!", bateria: true, alien: true },
    { nombre: "Sector 4: Generador Principal - PUERTA BLOQUEADA (Busca Tarjeta)", tarjeta: true },
    { nombre: "Sector 5: Cabina de Escape - Junta los Snacks" },
    { nombre: "Sector 6: Zona de Salvamento - ¡RESCATA AL MICHI CON 3 SNACKS!", final: true }
];

const robot = {
    x: 40, y: 185, width: 24, height: 30,
    speed: 4.5, color: '#00f0ff',
    invulnerableFrames: 0
};

const gato = { width: 20, height: 15 };

const keys = {
    arrowup: false, arrowdown: false, arrowleft: false, arrowright: false,
    w: false, s: false, a: false, d: false
};

// ---------- 3. VARIABLES DE ESTADO ----------
let gameState = 'START'; // START | PLAYING | WIN | GAMEOVER
let level = 1;
let energia = ENERGIA_MAX;
let snacks = 0;
let snacksAlInicioDelSector = 0; // para no perder snacks al reintentar
let tieneTarjeta = false;
let logroRescatarlo = false;

let puntaje = 0;
let puntajeAlInicioDelSector = 0; // para no perder puntos al reintentar
let tiempoSector = 0;             // segundos jugados en el sector actual
let silenciado = false;

let obstacles = [];
let stars = [];
let itemsNivel = [];

const aviso = { texto: "", tiempo: 0 }; // mensaje corto en pantalla

// ---------- 3b. SONIDO (Web Audio API, sin archivos de audio) ----------
let audioCtx = null;

// Los navegadores solo permiten audio después de un click: se llama desde los botones
function iniciarAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// Reproduce un tono: frecuencia, duración (s), forma de onda, volumen,
// frecuencia final (para "deslizar" el tono) y retraso (para armar melodías)
function tono(freq, dur, tipo = 'square', vol = 0.08, freqFinal = null, retraso = 0) {
    if (!audioCtx || silenciado) return;
    const t0 = audioCtx.currentTime + retraso;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqFinal) osc.frequency.exponentialRampToValueAtTime(freqFinal, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
}

const sonidos = {
    snack:    () => { tono(660, 0.08); tono(990, 0.12, 'square', 0.08, null, 0.08); },
    bateria:  () => tono(300, 0.3, 'triangle', 0.15, 900),
    tarjeta:  () => { tono(880, 0.07); tono(1175, 0.07, 'square', 0.08, null, 0.07); tono(1480, 0.14, 'square', 0.08, null, 0.14); },
    golpe:    () => tono(220, 0.25, 'sawtooth', 0.12, 50),
    rescate:  () => [660, 880, 1100, 1320].forEach((f, i) => tono(f, 0.12, 'triangle', 0.12, null, i * 0.09)),
    victoria: () => [523, 659, 784, 1047].forEach((f, i) => tono(f, 0.16, 'square', 0.08, null, i * 0.13)),
    // Fanfarria final: arpegio ascendente + acorde largo + brillo agudo
    victoriaFinal: () => {
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tono(f, 0.14, 'square', 0.08, null, i * 0.11));
        [523, 659, 784, 1047].forEach(f => tono(f, 0.9, 'triangle', 0.07, null, 0.7));
        tono(1568, 0.6, 'sine', 0.06, null, 0.95);
    },
    derrota:  () => tono(330, 0.7, 'sawtooth', 0.1, 55),
    pausa:    () => tono(440, 0.1, 'square', 0.06)
};

// ---------- 3c. RÉCORD (se guarda en el navegador) ----------
function leerRecord() {
    try { return Number(localStorage.getItem('tuerca_record')) || 0; }
    catch (e) { return 0; }
}

function guardarRecord(valor) {
    try { localStorage.setItem('tuerca_record', String(valor)); }
    catch (e) { /* si el navegador no deja guardar, seguimos sin récord */ }
}

function actualizarTextoRecord() {
    const r = leerRecord();
    recordText.innerText = r > 0 ? `Mejor puntaje: ${r}` : "";
}

// ---------- 3d. PAUSA ----------
function enPartida() {
    return gameState === 'PLAYING' || gameState === 'PAUSED';
}

function alternarPausa() {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        pauseScreen.classList.add('active');
        sonidos.pausa();
    } else if (gameState === 'PAUSED') {
        gameState = 'PLAYING';
        pauseScreen.classList.remove('active');
    }
}

// ---------- 4. FUNCIONES AUXILIARES ----------
function restarEnergia(energiaActual, gasto) {
    return Math.max(0, energiaActual - gasto);
}

function mostrarAviso(texto) {
    aviso.texto = texto;
    aviso.tiempo = 90;
}

// Colisión rectángulo contra rectángulo (para ítems)
function rectsChocan(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
           a.y < b.y + b.height && a.y + a.height > b.y;
}

// Colisión del robot (como círculo) contra un obstáculo ROTADO.
// Se pasa el centro del robot al sistema de coordenadas del obstáculo,
// así la hitbox gira igual que el dibujo.
function chocaConObstaculo(obs) {
    const cx = robot.x + robot.width / 2;
    const cy = robot.y + robot.height / 2;
    const ox = obs.x + obs.width / 2;
    const oy = obs.y + obs.height / 2;
    const cos = Math.cos(-obs.rotation);
    const sin = Math.sin(-obs.rotation);
    const lx = (cx - ox) * cos - (cy - oy) * sin;
    const ly = (cx - ox) * sin + (cy - oy) * cos;
    const px = Math.max(-obs.width / 2, Math.min(lx, obs.width / 2));
    const py = Math.max(-obs.height / 2, Math.min(ly, obs.height / 2));
    const radio = 12;
    return (lx - px) ** 2 + (ly - py) ** 2 < radio * radio;
}

// Posición aleatoria SIEMPRE dentro de los límites (evita obstáculos atascados)
function posicionAleatoria(ancho, alto) {
    return {
        x: 160 + Math.random() * (canvas.width - 320 - ancho),
        y: Y_MIN + Math.random() * (Y_MAX - Y_MIN - alto)
    };
}

function terminarJuego(mensaje = "Misión fallida. El robot se quedó sin energía.") {
    document.getElementById('gameover-text').innerText = `${mensaje}\nPuntaje: ${puntaje}`;
    gameState = 'GAMEOVER';
    sonidos.derrota();
    gameoverScreen.classList.add('active');
}

function ganarSector() {
    gameState = 'WIN';
    const ultimo = (level === niveles.length);

    // Cuanto más rápido, más puntos (mínimo 100) + 5 puntos por cada punto de energía
    const bonusTiempo = Math.max(100, Math.round(1000 - tiempoSector * 20));
    const bonusEnergia = energia * 5;
    puntaje += bonusTiempo + bonusEnergia;

    let texto = ultimo
        ? `¡${nombreGato.toUpperCase()} FUE RESCATADO! Misión cumplida con éxito.`
        : "Avanzando rápido al siguiente sector de la estación.";
    texto += `\n\nTiempo: ${tiempoSector.toFixed(1)} s  (+${bonusTiempo})`;
    texto += `\nEnergía restante: ${energia}  (+${bonusEnergia})`;
    texto += `\nPUNTAJE: ${puntaje}`;

    if (ultimo && puntaje > leerRecord()) {
        guardarRecord(puntaje);
        texto += "\n¡NUEVO RÉCORD!";
    }

    document.getElementById('win-text').innerText = texto;
    nextBtn.innerText = ultimo ? "Terminar Aventura" : "Siguiente Sector";
    winScreen.classList.add('active');
    if (ultimo) sonidos.victoriaFinal();
    else sonidos.victoria();
}

// Devuelve el motivo por el que la compuerta derecha está bloqueada (o null)
function motivoPuertaBloqueada() {
    if (level === 4 && !tieneTarjeta) return "PUERTA BLOQUEADA: buscá la tarjeta";
    if (level === 6 && !logroRescatarlo) return `Primero rescatá a ${nombreGato}`;
    return null;
}

// ---------- 5. CREACIÓN DE NIVELES ----------
function initStars() {
    stars = [];
    const radioVentana = pistaFondo.alto / 2;
    const xMin = pistaFondo.cx - pistaFondo.ancho / 2 - radioVentana + 10;
    const xMax = pistaFondo.cx + pistaFondo.ancho / 2 + radioVentana - 10;
    const yMin = pistaFondo.cy - radioVentana + 10;
    const yMax = pistaFondo.cy + radioVentana - 10;
    for (let i = 0; i < 40; i++) {
        stars.push({
            x: xMin + Math.random() * (xMax - xMin),
            y: yMin + Math.random() * (yMax - yMin),
            size: Math.random() * 1.5 + 0.5,
            opacity: Math.random()
        });
    }
}

function initObstacles() {
    obstacles = [];
    itemsNivel = [];

    const cfg = niveles[level - 1];
    if (cfg.final) return; // el sector 6 no tiene obstáculos

    const esAlien = !!cfg.alien;
    const vel = 2.0 + level * 0.4;

    // Vigas reticuladas giratorias
    for (let i = 0; i < level; i++) {
        const cant = Math.floor(Math.random() * 3) + 6;
        const ancho = 14 * cant;
        const pos = posicionAleatoria(ancho, 14);
        obstacles.push({
            tipo: 'VIGA_RETICULADA',
            x: pos.x, y: pos.y,
            cantLadrillos: cant, wLadrillo: 14, hLadrillo: 14,
            width: ancho, height: 14,
            speedX: (Math.random() - 0.5) * vel * 0.7,
            speedY: (Math.random() - 0.5) * vel * 0.7,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.04,
            esAlien
        });
    }

    // Cuadrados de chatarra
    for (let i = 0; i < 4 + level; i++) {
        const size = 16 + Math.random() * 24;
        const pos = posicionAleatoria(size, size);
        obstacles.push({
            tipo: 'CUADRADO_CHATARRA',
            x: pos.x, y: pos.y,
            width: size, height: size,
            speedX: (Math.random() - 0.5) * vel,
            speedY: (Math.random() - 0.5) * vel,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.06,
            esAlien
        });
    }

    // Un snack obligatorio en cada sector del 1 al 5
    itemsNivel.push({
        tipo: 'SNACK',
        x: 250 + Math.random() * (canvas.width - 450),
        y: 80 + Math.random() * (canvas.height - 180),
        width: 16, height: 16, recolectado: false
    });

    if (cfg.aspiradora) {
        obstacles.push({
            tipo: 'ASPIRADORA_ENEMIGA',
            x: CX - 20, y: 150, width: 35, height: 35,
            speedX: 0, speedY: 0, speedPerseguidora: 1.8,
            rotation: 0, rotationSpeed: 0.04, esAlien: false
        });
    }
    if (cfg.bateria) {
        itemsNivel.push({ tipo: 'BATERIA', x: CX - 12, y: CY - 40, width: 24, height: 24, recolectado: false });
    }
    if (cfg.tarjeta) {
        itemsNivel.push({ tipo: 'TARJETA', x: CX - 15, y: CY - 40, width: 30, height: 20, recolectado: false });
    }
}

function startLevel() {
    robot.x = 40;
    robot.y = CY - robot.height / 2;
    robot.invulnerableFrames = 0;

    if (level === 1) snacks = 0;
    if (level > 1) energia = restarEnergia(energia, 10);
    if (level === 1) puntaje = 0;
    snacksAlInicioDelSector = snacks;
    puntajeAlInicioDelSector = puntaje;
    tiempoSector = 0;

    tieneTarjeta = false;
    logroRescatarlo = false;
    aviso.tiempo = 0;

    if (energia <= 0) {
        terminarJuego();
        return;
    }
    initStars();
    initObstacles();
}

// ---------- 6. EVENTOS (TECLADO Y BOTONES) ----------
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (e.repeat) return;
    if (key === 'p' || key === 'escape') { alternarPausa(); return; }
    if (key === 'm') { silenciado = !silenciado; return; }
    if (key in keys) {
        keys[key] = true;
        e.preventDefault(); // evita que las flechas muevan la página
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = false;
});

// Si la ventana pierde el foco, soltamos todas las teclas
window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    if (gameState === 'PLAYING') alternarPausa();
});

startBtn.addEventListener('click', () => {
    iniciarAudio();
    puntaje = 0;
    energia = ENERGIA_MAX;
    snacks = 0;
    level = 1;
    gameState = 'PLAYING';
    startScreen.classList.remove('active');
    startLevel();
});

restartBtn.addEventListener('click', () => {
    energia = ENERGIA_MAX;
    iniciarAudio();
    snacks = snacksAlInicioDelSector; // conserva los snacks que ya tenías
    puntaje = puntajeAlInicioDelSector;
    gameState = 'PLAYING';
    gameoverScreen.classList.remove('active');
    startLevel();
});

nextBtn.addEventListener('click', () => {
    winScreen.classList.remove('active');
    if (level < niveles.length) {
        level++;
        gameState = 'PLAYING';
        startLevel();
    } else {
        level = 1;
        gameState = 'START';
        actualizarTextoRecord();
        startScreen.classList.add('active');
    }
});

resumeBtn.addEventListener('click', alternarPausa);

// ---------- 7. ACTUALIZACIÓN (UPDATE) ----------
// dt = cuántos "frames de 60 FPS" pasaron: así el juego va igual en cualquier monitor
function moverRobot(dt) {
    let dx = 0, dy = 0;
    if (keys.arrowleft || keys.a) dx -= 1;
    if (keys.arrowright || keys.d) dx += 1;
    if (keys.arrowup || keys.w) dy -= 1;
    if (keys.arrowdown || keys.s) dy += 1;

    const largo = Math.hypot(dx, dy); // normaliza la diagonal
    if (largo > 0) {
        robot.x += (dx / largo) * robot.speed * dt;
        robot.y += (dy / largo) * robot.speed * dt;
    }

    if (robot.x < 15) robot.x = 15;
    if (robot.y < Y_MIN) robot.y = Y_MIN;
    if (robot.y > Y_MAX - robot.height) robot.y = Y_MAX - robot.height;
}

function recogerItems() {
    itemsNivel.forEach(item => {
        if (!item.recolectado && rectsChocan(robot, item)) {
            item.recolectado = true;
            if (item.tipo === 'BATERIA') { energia = Math.min(ENERGIA_MAX, energia + 15); puntaje += 100; sonidos.bateria(); }
            else if (item.tipo === 'TARJETA') { tieneTarjeta = true; puntaje += 100; sonidos.tarjeta(); }
            else if (item.tipo === 'SNACK') { snacks += 1; puntaje += 200; sonidos.snack(); }
        }
    });
}

function controlarCajaDelGato() {
    if (logroRescatarlo || robot.x + robot.width < CAJA_X - 10) return;
    if (snacks >= SNACKS_NECESARIOS) {
        logroRescatarlo = true;
        puntaje += 500;
        sonidos.rescate();
    } else {
        robot.x = CAJA_X - 10 - robot.width; // bloqueo si faltan snacks
        mostrarAviso(`Faltan snacks: ${snacks}/${SNACKS_NECESARIOS}`);
    }
}

function moverObstaculos(dt) {
    obstacles.forEach(obs => {
        if (obs.tipo === 'ASPIRADORA_ENEMIGA') {
            const dx = (robot.x + robot.width / 2) - (obs.x + obs.width / 2);
            const dy = (robot.y + robot.height / 2) - (obs.y + obs.height / 2);
            const distancia = Math.hypot(dx, dy);
            if (distancia > 0) {
                obs.x += (dx / distancia) * obs.speedPerseguidora * dt;
                obs.y += (dy / distancia) * obs.speedPerseguidora * dt;
            }
        } else {
            obs.x += obs.speedX * dt;
            obs.y += obs.speedY * dt;
        }
        obs.rotation += obs.rotationSpeed * dt;

        // Rebote: se corrige la posición Y se invierte la velocidad (no se traba en el borde)
        if (obs.x < LIM_X_MIN) { obs.x = LIM_X_MIN; obs.speedX = Math.abs(obs.speedX); }
        if (obs.x + obs.width > LIM_X_MAX) { obs.x = LIM_X_MAX - obs.width; obs.speedX = -Math.abs(obs.speedX); }
        if (obs.y < Y_MIN) { obs.y = Y_MIN; obs.speedY = Math.abs(obs.speedY); }
        if (obs.y + obs.height > Y_MAX) { obs.y = Y_MAX - obs.height; obs.speedY = -Math.abs(obs.speedY); }

        if (robot.invulnerableFrames <= 0 && chocaConObstaculo(obs)) {
            robot.invulnerableFrames = 45;
            sonidos.golpe();
            energia = restarEnergia(energia, obs.tipo === 'ASPIRADORA_ENEMIGA' ? 20 : 15);
            robot.x = Math.max(15, robot.x - 15); // empuje hacia atrás
        }
    });
}

function update(dt) {
    if (gameState !== 'PLAYING') return;

    if (robot.invulnerableFrames > 0) robot.invulnerableFrames = Math.max(0, robot.invulnerableFrames - dt);
    if (aviso.tiempo > 0) aviso.tiempo -= dt;
    tiempoSector += dt / 60; // dt está en frames de 60 FPS

    moverRobot(dt);
    recogerItems();
    if (level === 6) controlarCajaDelGato();

    // Compuerta derecha
    if (robot.x + robot.width >= canvas.width - 35) {
        const motivo = motivoPuertaBloqueada();
        if (motivo) {
            robot.x = canvas.width - 35 - robot.width;
            mostrarAviso(motivo);
        } else {
            ganarSector();
            return; // importante: no seguir actualizando este frame
        }
    }

    moverObstaculos(dt);

    if (energia <= 0) terminarJuego();
}

// ---------- 8. FUNCIONES DE DIBUJO ----------
function dibujarRecta(x1, y1, x2, y2, color, grosor = 2) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = grosor;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

function dibujarLadrillo(x, y, ancho, alto, color, invertido) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, ancho, alto);
    ctx.beginPath();
    if (invertido) { ctx.moveTo(x, y); ctx.lineTo(x + ancho, y + alto); }
    else { ctx.moveTo(x, y + alto); ctx.lineTo(x + ancho, y); }
    ctx.stroke();
}

// Traza el contorno de una cápsula (se usa para rellenar y para recortar)
function trazarCapsula(p) {
    const r = p.alto / 2;
    const izq = p.cx - p.ancho / 2;
    const der = p.cx + p.ancho / 2;
    ctx.beginPath();
    ctx.moveTo(izq, p.cy - r);
    ctx.lineTo(der, p.cy - r);
    ctx.arc(der, p.cy, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.lineTo(izq, p.cy + r);
    ctx.arc(izq, p.cy, r, Math.PI / 2, 3 * Math.PI / 2, false);
    ctx.closePath();
}

function rellenarCapsula(p, color) {
    trazarCapsula(p);
    ctx.fillStyle = color;
    ctx.fill();
}

function obtenerPistaIntermedia(porcentaje) {
    return {
        cx: CX, cy: CY,
        ancho: pistaFondo.ancho + (pistaFrente.ancho - pistaFondo.ancho) * porcentaje,
        alto: pistaFondo.alto + (pistaFrente.alto - pistaFondo.alto) * porcentaje
    };
}

function dibujarVentanaEspacial() {
    ctx.fillStyle = '#03030c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    stars.forEach(e => {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, 2 * Math.PI);
        ctx.fill();
    });
    const alien = !!niveles[level - 1].alien;
    const brillo = alien ? 'rgba(0, 255, 100, 0.25)' : 'rgba(103, 58, 183, 0.3)';
    const gradiente = ctx.createRadialGradient(CX, CY, 5, CX, CY, 100);
    gradiente.addColorStop(0, brillo);
    gradiente.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradiente;
    ctx.fillRect(CX - 150, CY - 100, 300, 200);
}

function dibujarTunel() {
    const alien = !!niveles[level - 1].alien;
    const base = alien ? [15, 65, 35] : [45, 45, 55];
    const c = {
        techoPiso: alien ? '#2ecc71' : '#e67e22',
        curvaIzq: '#f1c40f',
        curvaDer: '#8e44ad',
        esquinas: alien ? '#00ff66' : '#2ecc71',
        paneles: alien ? '#a55eea' : '#00bcd4'
    };

    // Capas de relleno, de la más lejana a la más cercana
    for (let i = CANTIDAD_NIVELES; i >= 0; i--) {
        const porc = i / CANTIDAD_NIVELES;
        const [r, g, b] = base.map(v => Math.floor(v + porc * 100));
        rellenarCapsula(obtenerPistaIntermedia(porc), `rgb(${r}, ${g}, ${b})`);
    }

    // Ventana al espacio (recortada con la forma de la cápsula del fondo)
    ctx.save();
    trazarCapsula(pistaFondo);
    ctx.clip();
    dibujarVentanaEspacial();
    ctx.restore();

    // Líneas de fuga: esquinas y paneles
    [-1, 1].forEach(sx => [-1, 1].forEach(sy => {
        dibujarRecta(
            pistaFondo.cx + (pistaFondo.ancho / 2) * sx, pistaFondo.cy + (pistaFondo.alto / 2) * sy,
            pistaFrente.cx + (pistaFrente.ancho / 2) * sx, pistaFrente.cy + (pistaFrente.alto / 2) * sy,
            c.esquinas);
    }));
    [-1, 1].forEach(h => [1 / 3, 2 / 3].forEach(d => {
        dibujarRecta(
            pistaFondo.cx - pistaFondo.ancho / 2 + pistaFondo.ancho * d, pistaFondo.cy + (pistaFondo.alto / 2) * h,
            pistaFrente.cx - pistaFrente.ancho / 2 + pistaFrente.ancho * d, pistaFrente.cy + (pistaFrente.alto / 2) * h,
            c.paneles);
    }));

    // Aros de perspectiva
    for (let i = 0; i <= CANTIDAD_NIVELES; i++) {
        const porc = i / CANTIDAD_NIVELES;
        const p = obtenerPistaIntermedia(porc);
        const grosor = (i === CANTIDAD_NIVELES) ? 3 : 1 + porc * 1.5;
        dibujarRecta(p.cx - p.ancho / 2, p.cy - p.alto / 2, p.cx + p.ancho / 2, p.cy - p.alto / 2, c.techoPiso, grosor);
        dibujarRecta(p.cx - p.ancho / 2, p.cy + p.alto / 2, p.cx + p.ancho / 2, p.cy + p.alto / 2, c.techoPiso, grosor);
        ctx.lineWidth = grosor;
        ctx.beginPath();
        ctx.arc(p.cx - p.ancho / 2, p.cy, p.alto / 2, Math.PI / 2, 3 * Math.PI / 2);
        ctx.strokeStyle = c.curvaIzq;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.cx + p.ancho / 2, p.cy, p.alto / 2, -Math.PI / 2, Math.PI / 2);
        ctx.strokeStyle = c.curvaDer;
        ctx.stroke();
    }

    // Compuertas izquierda y derecha
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, CY - 45, 15, 90);
    ctx.fillRect(canvas.width - 15, CY - 45, 15, 90);
    ctx.fillStyle = '#00ff66';
    ctx.fillRect(10, CY - 35, 5, 70);
    ctx.fillStyle = alien ? '#ff00ff' : '#ffcc00';
    ctx.fillRect(canvas.width - 15, CY - 35, 5, 70);
}

function dibujarItems() {
    itemsNivel.forEach(item => {
        if (item.recolectado) return;
        if (item.tipo === 'BATERIA') {
            ctx.fillStyle = '#2ecc71';
            ctx.fillRect(item.x, item.y, item.width, item.height);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(item.x + 8, item.y - 4, 8, 4);
        } else if (item.tipo === 'TARJETA') {
            ctx.fillStyle = '#2980b9';
            ctx.fillRect(item.x, item.y, item.width, item.height);
            ctx.fillStyle = '#fff';
            ctx.fillRect(item.x + 4, item.y + 4, 6, 12);
        } else if (item.tipo === 'SNACK') {
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(item.x + 8, item.y + 8, 7, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function dibujarGatito(x, y) {
    ctx.fillStyle = '#ffa502';
    ctx.fillRect(x, y, gato.width, gato.height);
    ctx.fillRect(x + 6, y - 8, 10, 10);
    ctx.beginPath();
    ctx.moveTo(x + 6, y - 8); ctx.lineTo(x + 9, y - 13); ctx.lineTo(x + 11, y - 8);
    ctx.moveTo(x + 11, y - 8); ctx.lineTo(x + 14, y - 13); ctx.lineTo(x + 16, y - 8);
    ctx.fill();
    ctx.fillStyle = '#55efc4';
    ctx.fillRect(x + 9, y - 5, 2, 2);
    ctx.fillRect(x + 13, y - 5, 2, 2);
}

function dibujarCaja() {
    if (level !== 6 || !enPartida()) return;
    ctx.fillStyle = '#d35400';
    ctx.fillRect(CAJA_X, CAJA_Y, 35, 30);
    ctx.fillStyle = '#b34700';
    ctx.fillRect(CAJA_X - 4, CAJA_Y, 4, 10);
    ctx.fillRect(CAJA_X + 35, CAJA_Y, 4, 10);
    if (logroRescatarlo) dibujarGatito(CAJA_X + 10, CAJA_Y - 10);
}

function dibujarObstaculos() {
    obstacles.forEach(obs => {
        const w = obs.width, h = obs.height;
        ctx.save();
        ctx.translate(obs.x + w / 2, obs.y + h / 2);
        ctx.rotate(obs.rotation);

        if (obs.tipo === 'VIGA_RETICULADA') {
            ctx.fillStyle = 'rgba(20, 20, 35, 0.5)';
            ctx.fillRect(-w / 2, -h / 2, w, h);
            const color = obs.esAlien ? '#f000ff' : '#ff3333';
            for (let i = 0; i < obs.cantLadrillos; i++) {
                dibujarLadrillo(-w / 2 + i * obs.wLadrillo, -h / 2, obs.wLadrillo, obs.hLadrillo, color, i % 2 === 1);
            }
        } else if (obs.tipo === 'ASPIRADORA_ENEMIGA') {
            ctx.fillStyle = '#95a5a6';
            ctx.fillRect(-17, -17, 34, 34);
            ctx.fillStyle = '#7f8c8d';
            ctx.fillRect(-10, 17, 20, 8);
            ctx.fillStyle = '#ff3333';
            ctx.beginPath();
            ctx.arc(0, -5, 6, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = obs.esAlien ? '#1b1464' : '#222831';
            ctx.strokeStyle = obs.esAlien ? '#00ff66' : '#f05454';
            ctx.lineWidth = 2;
            ctx.fillRect(-w / 2, -h / 2, w, h);
            ctx.strokeRect(-w / 2, -h / 2, w, h);
        }
        ctx.restore();
    });
}

function dibujarRobot() {
    if (!enPartida()) return;
    // Parpadeo mientras es invulnerable
    if (robot.invulnerableFrames > 0 && Math.floor(robot.invulnerableFrames / 4) % 2 !== 0) return;

    ctx.fillStyle = robot.color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = robot.color;
    ctx.fillRect(robot.x, robot.y, robot.width, robot.height);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.fillRect(robot.x + 4, robot.y + 4, robot.width - 8, 8);
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(robot.x + robot.width / 2 - 2, robot.y + 7, 4, 2);
    if (keys.arrowright || keys.d) {
        ctx.fillStyle = '#ff7700';
        ctx.fillRect(robot.x - 6, robot.y + 8, 6, 4);
        ctx.fillRect(robot.x - 6, robot.y + 18, 6, 4);
    }
}

function dibujarHUD() {
    if (!enPartida()) return;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(niveles[level - 1].nombre, 25, 25);
    ctx.fillText(`ENERGÍA DE ${nombreRobot.toUpperCase()}: ${energia}/${ENERGIA_MAX}`, 25, 45);
    ctx.fillText(`SNACKS MOCHILA: ${snacks}/${SNACKS_NECESARIOS}`, 25, 65);
    if (level === 4 && tieneTarjeta) ctx.fillText('[TARJETA ADQUIRIDA]', 25, 85);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(250, 35, 150, 10);
    ctx.fillStyle = energia > 40 ? '#00ff66' : '#ff3333';
    ctx.fillRect(250, 35, energia * 1.5, 10);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'right';
    ctx.fillText(`TIEMPO: ${tiempoSector.toFixed(1)} s`, canvas.width - 25, 25);
    ctx.fillText(`PUNTAJE: ${puntaje}`, canvas.width - 25, 45);
    if (silenciado) ctx.fillText('SONIDO: OFF (M)', canvas.width - 25, 65);
    ctx.textAlign = 'left';

    if (aviso.tiempo > 0) {
        ctx.fillStyle = '#ffcc00';
        ctx.textAlign = 'center';
        ctx.fillText(aviso.texto, CX, canvas.height - 25);
        ctx.textAlign = 'left';
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dibujarTunel();
    dibujarItems();
    dibujarCaja();
    dibujarObstaculos();
    dibujarRobot();
    dibujarHUD();
}

// ---------- 9. BUCLE PRINCIPAL ----------
let ultimoTiempo = 0;

function gameLoop(tiempo) {
    // Cuánto pasó desde el frame anterior, expresado en "frames de 60 FPS"
    const delta = Math.min(tiempo - ultimoTiempo, 50); // tope por si se cambia de pestaña
    ultimoTiempo = tiempo;
    const dt = delta / (1000 / 60);

    update(dt);
    draw();
    requestAnimationFrame(gameLoop);
}

// Arranque del juego
actualizarTextoRecord();
initStars();
initObstacles();
requestAnimationFrame(gameLoop);
