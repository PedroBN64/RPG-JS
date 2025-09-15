const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

const map = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];
const TILE_SIZE = 32;

const players = {};

function isTileBlocked(x, y) {
    if (!map[y] || map[y][x] === 1) {
        return true;
    }
    for (const playerId in players) {
        const player = players[playerId];
        if (player.tileX === x && player.tileY === y) {
            return true;
        }
    }
    return false;
}

app.use(express.static(path.join(__dirname, '../client')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

io.on('connection', (socket) => {
  console.log('Um jogador conectou:', socket.id);

  const startTileX = 1;
  const startTileY = 1;

  players[socket.id] = {
    tileX: startTileX,
    tileY: startTileY,
    x: startTileX * TILE_SIZE + TILE_SIZE / 2,
    y: startTileY * TILE_SIZE + TILE_SIZE / 2,
    playerId: socket.id,
    color: `0x${Math.floor(Math.random()*16777215).toString(16)}`,
    // --- NOVA PROPRIEDADE ---
    // Este valor é a duração do movimento em milissegundos. Menor = mais rápido.
    speed: 50 
  };

  socket.emit('currentPlayers', players);
  socket.emit('mapData', map);
  socket.broadcast.emit('newPlayer', players[socket.id]);

  socket.on('disconnect', () => {
    console.log('Jogador desconectou:', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });

  socket.on('requestMove', (direction) => {
    const player = players[socket.id];
    if (!player) return;

    let dx = 0;
    let dy = 0;

    if (direction.includes('up')) dy = -1;
    if (direction.includes('down')) dy = 1;
    if (direction.includes('left')) dx = -1;
    if (direction.includes('right')) dx = 1;
    
    const targetTileX = player.tileX + dx;
    const targetTileY = player.tileY + dy;

    if (!isTileBlocked(targetTileX, targetTileY)) {
        player.tileX = targetTileX;
        player.tileY = targetTileY;
        player.x = targetTileX * TILE_SIZE + TILE_SIZE / 2;
        player.y = targetTileY * TILE_SIZE + TILE_SIZE / 2;
        io.emit('playerMoved', player); // A propriedade 'speed' já está inclusa aqui
    } else {
        socket.emit('moveRejected');
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});