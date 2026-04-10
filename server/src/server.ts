import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────

interface Movie {
  title: string;
  aliases: string[];
  image: string;
  hint: string;
}

interface PlayerState {
  name: string;
  score: number;
}

interface GameState {
  players: Record<string, PlayerState>;
  movies: Movie[];
  currentRound: number;
  guessedThisRound: Set<string>;
}

interface ServerToClientEvents {
  startGame: (data: { movieImage: string; round: number; totalRounds: number }) => void;
  nextRound: (data: { movieImage: string; round: number; totalRounds: number }) => void;
  updateScores: (players: Record<string, PlayerState>) => void;
  correctGuess: (data: { movie: string }) => void;
  wrongGuess: () => void;
  gameOver: (data: { winner: string; scores: Record<string, PlayerState> }) => void;
}

interface ClientToServerEvents {
  joinGame: (name: string) => void;
  sendGuess: (guess: string) => void;
}

interface SocketData {
  playerName: string;
  roomId: string;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

// ── App ────────────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(server, {
  cors: { origin: ['http://localhost:3000', 'https://moovie-quiz.vercel.app'] }
});

app.use(express.static(path.join(__dirname, 'public')));

// ── TMDB ───────────────────────────────────────────────────────────────────

const TMDB_KEY = '126e4fa09b7015ae0483c4813d3ca479';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

const MOVIE_IDS = [603, 597, 19995, 157336, 238, 496243, 120, 550];

async function fetchPoster(tmdbId: number): Promise<string> {
  const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}`);
  const data = await res.json() as { poster_path: string };
  return `${TMDB_IMG}${data.poster_path}`;
}

async function buildMovies(): Promise<Movie[]> {
  const posters = await Promise.all(MOVIE_IDS.map(fetchPoster));

  return [
    {
      title: 'matrix',
      aliases: ['the matrix', 'matrix'],
      image: posters[0],
      hint: 'Ficção científica - 1999',
    },
    {
      title: 'titanic',
      aliases: ['titanic'],
      image: posters[1],
      hint: 'Romance/Drama - 1997',
    },
    {
      title: 'avatar',
      aliases: ['avatar'],
      image: posters[2],
      hint: 'Ficção científica - 2009',
    },
    {
      title: 'interestelar',
      aliases: ['interestelar', 'interstellar'],
      image: posters[3],
      hint: 'Ficção científica - 2014',
    },
    {
      title: 'o poderoso chefão',
      aliases: ['o poderoso chefão', 'the godfather', 'godfather', 'poderoso chefão'],
      image: posters[4],
      hint: 'Crime/Drama - 1972',
    },
    {
      title: 'parasita',
      aliases: ['parasita', 'parasite'],
      image: posters[5],
      hint: 'Thriller - 2019',
    },
    {
      title: 'o senhor dos anéis',
      aliases: ['o senhor dos anéis', 'lord of the rings', 'senhor dos anéis', 'fellowship of the ring'],
      image: posters[6],
      hint: 'Fantasia - 2001',
    },
    {
      title: 'clube da luta',
      aliases: ['clube da luta', 'fight club'],
      image: posters[7],
      hint: 'Drama/Thriller - 1999',
    },
  ];
}

// ── Estado global ──────────────────────────────────────────────────────────

const ROUNDS = 4;
let MOVIES: Movie[] = [];
let waitingPlayer: GameSocket | null = null;
const games: Record<string, GameState> = {};

// ── Helpers ────────────────────────────────────────────────────────────────

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function checkGuess(guess: string, movie: Movie): boolean {
  const normalizedGuess = normalize(guess);
  return movie.aliases.some((alias) => normalize(alias) === normalizedGuess);
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Socket.IO ──────────────────────────────────────────────────────────────

io.on('connection', (socket: GameSocket) => {
  console.log('Conectado:', socket.id);

  socket.on('joinGame', (name: string) => {
    socket.data.playerName = name || 'Jogador';

    if (waitingPlayer && waitingPlayer.id !== socket.id) {
      const roomId = `room_${waitingPlayer.id}_${socket.id}`;
      const movies = shuffleArray(MOVIES).slice(0, ROUNDS);

      games[roomId] = {
        players: {
          [waitingPlayer.id]: { name: waitingPlayer.data.playerName, score: 0 },
          [socket.id]: { name: socket.data.playerName, score: 0 },
        },
        movies,
        currentRound: 0,
        guessedThisRound: new Set<string>(),
      };

      waitingPlayer.join(roomId);
      socket.join(roomId);
      waitingPlayer.data.roomId = roomId;
      socket.data.roomId = roomId;

      const firstMovie = movies[0];
      io.to(roomId).emit('startGame', {
        movieImage: firstMovie.image,
        round: 1,
        totalRounds: ROUNDS,
      });

      waitingPlayer = null;
    } else {
      waitingPlayer = socket;
    }
  });

  socket.on('sendGuess', (guess: string) => {
    const roomId = socket.data.roomId;
    if (!roomId || !games[roomId]) return;

    const game = games[roomId];
    const movie = game.movies[game.currentRound];

    if (game.guessedThisRound.has(socket.id)) return;

    const correct = checkGuess(guess, movie);

    if (correct) {
      game.players[socket.id].score += 1;
      game.guessedThisRound.add(socket.id);

      io.to(roomId).emit('updateScores', game.players);
      socket.emit('correctGuess', { movie: movie.title });

      game.currentRound += 1;
      game.guessedThisRound = new Set<string>();

      if (game.currentRound >= ROUNDS) {
        const scores = Object.entries(game.players).map(([id, p]) => ({ id, ...p }));
        scores.sort((a, b) => b.score - a.score);

        const winnerName =
          scores[0].score === scores[1].score ? 'Empate! Ninguém' : scores[0].name;

        io.to(roomId).emit('gameOver', { winner: winnerName, scores: game.players });
        delete games[roomId];
      } else {
        const nextMovie = game.movies[game.currentRound];
        io.to(roomId).emit('nextRound', {
          movieImage: nextMovie.image,
          round: game.currentRound + 1,
          totalRounds: ROUNDS,
        });
      }
    } else {
      socket.emit('wrongGuess');
    }
  });

  socket.on('disconnect', () => {
    if (waitingPlayer?.id === socket.id) {
      waitingPlayer = null;
    }

    const roomId = socket.data.roomId;
    if (roomId && games[roomId]) {
      io.to(roomId).emit('gameOver', {
        winner: 'Oponente desconectou. Você',
        scores: {},
      });
      delete games[roomId];
    }

    console.log('Desconectado:', socket.id);
  });
});

// ── Start ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3000;

buildMovies()
  .then((movies) => {
    MOVIES = movies;
    server.listen(PORT, () => console.log(`🎬 MoovieQuiz rodando em http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Erro ao buscar posters do TMDB:', err);
    process.exit(1);
  });