const socket = io('http://localhost:3000');

const btnStart = document.getElementById('btn-start');
const btnGuess = document.getElementById('btn-guess');
const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const results = document.getElementById('results');
const usernameInput = document.getElementById('username');
const guessInput = document.getElementById('guess-input');
const movieImg = document.querySelector('.frame-container img');
const myScoreEl = document.getElementById('my-score');
const p2ScoreEl = document.getElementById('p2-score');
const winnerText = document.getElementById('winner-text');
const currentRoundEl = document.getElementById('current-round');

btnStart.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (name) {
        socket.emit('joinGame', name);
        lobby.innerHTML = `
            <h1>Moovie<span>Quiz</span></h1>
            <h2>Aguardando oponente...</h2>
        `;
    }
});

btnGuess.addEventListener('click', () => {
    const palpite = guessInput.value.trim();
    if (palpite) {
        socket.emit('sendGuess', palpite);
        guessInput.value = '';
    }
});

guessInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnGuess.click();
});

socket.on('startGame', (data) => {
    lobby.classList.add('hidden');
    game.classList.remove('hidden');
    if (data.movieImage) {
        movieImg.src = data.movieImage;
    }
    if (data.round) {
        currentRoundEl.textContent = data.round;
    }
});

socket.on('nextRound', (data) => {
    movieImg.src = data.movieImage;
    guessInput.value = '';

    if (data.round) {
        currentRoundEl.textContent = data.round;
    }

    const feedback = document.getElementById('feedback');
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 2000);
});

socket.on('correctGuess', () => {
    const feedback = document.getElementById('feedback');
    feedback.textContent = 'Acertou! ✓';
    feedback.style.color = 'var(--green)';
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 1800);
});

socket.on('wrongGuess', () => {
    guessInput.classList.add('shake');
    setTimeout(() => guessInput.classList.remove('shake'), 400);
});

socket.on('updateScores', (playersData) => {
    const ids = Object.keys(playersData);
    const myId = socket.id;
    const rivalId = ids.find(id => id !== myId);

    if (playersData[myId]) myScoreEl.textContent = playersData[myId].score;
    if (rivalId && playersData[rivalId]) p2ScoreEl.textContent = playersData[rivalId].score;
});

socket.on('gameOver', (data) => {
    game.classList.add('hidden');
    results.classList.remove('hidden');
    winnerText.textContent = data.winner + ' venceu!';
});