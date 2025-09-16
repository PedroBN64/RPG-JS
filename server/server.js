const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');
const GameManager = require('./game/GameManager'); // Importa nossa nova classe

// 1. Configuração do Servidor Web
app.use(express.static(path.join(__dirname, '../client')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// 2. Criação e Inicialização do Jogo
const gameManager = new GameManager(io);
gameManager.setup();

// 3. Gerenciamento de Conexões
io.on('connection', (socket) => {
    console.log('Um jogador conectou:', socket.id);
    gameManager.handleConnection(socket);
});

// 4. Inicia o Servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});