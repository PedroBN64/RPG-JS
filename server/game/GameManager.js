const easystarjs = require('easystarjs');
const { map, TILE_SIZE } = require('../config/map'); // Importa o mapa e o tamanho do tile

class GameManager {
    constructor(io) {
        this.io = io;
        this.players = {};
        this.monsters = {};
        this.monsterTypes = [
            { idPrefix: 'orc', speed: 300, color: '0x228B22', detectionRange: 5 },
            { idPrefix: 'cyclops', speed: 350, color: '0xff4500', detectionRange: 4 }
        ];
        
        this.easystar = new easystarjs.js();
        this.easystar.setGrid(map);
        this.easystar.setAcceptableTiles([0]);
        this.easystar.enableDiagonals();
    }

    setup() {
        this.spawnMonsters();
        this.startGameLoop();
    }

    startGameLoop() {
        setInterval(() => {
            this.executeMovement();
            this.updateMonsterAI();
        }, 200);
    }

    // --- LÓGICA DE GERENCIAMENTO DE ENTIDADES ---

    isTileBlocked(x, y) {
        if (!map[y] || map[y][x] === undefined || map[y][x] === 1) return true;
        for (const id in this.players) if (this.players[id].tileX === x && this.players[id].tileY === y) return true;
        for (const id in this.monsters) if (this.monsters[id].tileX === x && this.monsters[id].tileY === y) return true;
        return false;
    }

    findEmptyTile() {
        let tileX, tileY;
        do {
            tileX = Math.floor(Math.random() * map[0].length);
            tileY = Math.floor(Math.random() * map.length);
        } while (this.isTileBlocked(tileX, tileY));
        return { tileX, tileY };
    }

    spawnMonsters() {
        this.monsterTypes.forEach((type, index) => {
            const id = `${type.idPrefix}_${index + 1}`;
            const { tileX, tileY } = this.findEmptyTile();
            this.monsters[id] = { 
                id, tileX, tileY, x: tileX*32+16, y: tileY*32+16, 
                speed: type.speed, movePath: null, isMonster: true, color: type.color, 
                lastMoveTime: 0,
                spawnPoint: { x: tileX, y: tileY },
                state: 'patrolling',
                detectionRange: type.detectionRange,
                targetId: null
            };
        });
    }

    // --- LÓGICA DE CONEXÃO E SOCKETS ---

    handleConnection(socket) {
        const { tileX, tileY } = this.findEmptyTile();
        this.players[socket.id] = {
            tileX, tileY, x: tileX*32+16, y: tileY*32+16, playerId: socket.id,
            color: `0x${Math.floor(Math.random()*16777215).toString(16)}`, speed: 180, movePath: null,
            lastMoveTime: 0
        };
        
        socket.emit('currentPlayers', this.players);
        socket.emit('currentMonsters', this.monsters);
        socket.emit('mapData', map);
        socket.broadcast.emit('newPlayer', this.players[socket.id]);

        socket.on('disconnect', () => {
            delete this.players[socket.id];
            this.io.emit('playerDisconnected', socket.id);
        });

        socket.on('requestMove', (direction) => this.handleRequestMove(socket, direction));
        socket.on('requestPath', (targetTile) => this.handleRequestPath(socket, targetTile));
    }

    handleRequestMove(socket, direction) {
        const player = this.players[socket.id];
        if (!player) return;
        const now = Date.now();
        if (now < player.lastMoveTime + player.speed) {
            socket.emit('moveRejected');
            return;
        }
        player.lastMoveTime = now;
        player.movePath = null;
        let dx = 0, dy = 0;
        if (direction.includes('up')) dy = -1; if (direction.includes('down')) dy = 1;
        if (direction.includes('left')) dx = -1; if (direction.includes('right')) dx = 1;
        const targetTileX = player.tileX + dx;
        const targetTileY = player.tileY + dy;
        if (!this.isTileBlocked(targetTileX, targetTileY)) {
            player.tileX = targetTileX; player.tileY = targetTileY;
            player.x = targetTileX*32+16; player.y = targetTileY*32+16;
            this.io.emit('entityMoved', player);
        } else {
            socket.emit('moveRejected');
        }
    }

    handleRequestPath(socket, targetTile) {
        const player = this.players[socket.id];
        if (!player || player.movePath) return;
        const allEntities = {...this.players, ...this.monsters};
        Object.values(allEntities).forEach(entity => {
            const entityId = entity.playerId || entity.id;
            if(entityId !== socket.id) this.easystar.avoidAdditionalPoint(entity.tileX, entity.tileY);
        });
        this.easystar.findPath(player.tileX, player.tileY, targetTile.x, targetTile.y, (path) => {
            if (path && path.length > 1) {
                path.shift();
                player.movePath = path;
            }
            this.easystar.stopAvoidingAllAdditionalPoints(); 
        });
        this.easystar.calculate();
    }

    // --- LÓGICA DO GAME LOOP ---

    executeMovement() {
        const now = Date.now();
        const allEntities = {...this.players, ...this.monsters};
        Object.values(allEntities).forEach(entity => {
            if (entity.movePath && entity.movePath.length > 0) {
                if (now < entity.lastMoveTime + entity.speed) return;
                entity.lastMoveTime = now;
                const nextStep = entity.movePath[0];
                if (this.isTileBlocked(nextStep.x, nextStep.y)) {
                    entity.movePath = null;
                    if (entity.isMonster) entity.state = 'patrolling';
                    return;
                }
                entity.movePath.shift();
                entity.tileX = nextStep.x; entity.tileY = nextStep.y;
                entity.x = nextStep.x*32+16; entity.y = nextStep.y*32+16;
                const payload = { ...entity, pathComplete: entity.movePath.length === 0 };
                this.io.emit('entityMoved', payload);
                if(entity.movePath.length === 0) {
                    entity.movePath = null;
                    if (entity.isMonster && entity.state === 'returning') entity.state = 'patrolling';
                }
            }
        });
    }

    updateMonsterAI() {
        const allEntities = {...this.players, ...this.monsters};
        Object.values(this.monsters).forEach(monster => {
            if (!monster.movePath && Object.keys(this.players).length > 0) {
                let closestPlayer = null;
                let minDistance = Infinity;

                Object.values(this.players).forEach(player => {
                    const distance = Math.sqrt(Math.pow(monster.tileX - player.tileX, 2) + Math.pow(monster.tileY - player.tileY, 2));
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestPlayer = player;
                    }
                });

                if (closestPlayer) {
                    switch(monster.state) {
                        case 'patrolling':
                            if (minDistance <= monster.detectionRange) {
                                monster.state = 'chasing';
                                monster.targetId = closestPlayer.playerId;
                            } 
                            else {
                                let patrolTargetX = monster.spawnPoint.x + Math.floor(Math.random() * 5) - 2;
                                let patrolTargetY = monster.spawnPoint.y + Math.floor(Math.random() * 5) - 2;
                                patrolTargetX = Math.max(0, Math.min(map[0].length - 1, patrolTargetX));
                                patrolTargetY = Math.max(0, Math.min(map.length - 1, patrolTargetY));
                                
                                this.easystar.findPath(monster.tileX, monster.tileY, patrolTargetX, patrolTargetY, (path) => {
                                    if (path && path.length > 1) {
                                        path.shift();
                                        monster.movePath = path;
                                    }
                                });
                                this.easystar.calculate();
                            }
                            break;

                        case 'chasing':
                            const target = this.players[monster.targetId];
                            if (target && minDistance <= monster.detectionRange) {
                                Object.values(allEntities).forEach(e => {
                                    const eId = e.playerId || e.id;
                                    if (eId !== monster.id && eId !== target.playerId) this.easystar.avoidAdditionalPoint(e.tileX, e.tileY);
                                });
                                this.easystar.findPath(monster.tileX, monster.tileY, target.tileX, target.tileY, (path) => {
                                    if (path && path.length > 1) {
                                        path.pop(); path.shift();
                                        if (path.length > 0) monster.movePath = path;
                                    }
                                    this.easystar.stopAvoidingAllAdditionalPoints();
                                });
                                this.easystar.calculate();
                            } 
                            else {
                                monster.state = 'returning';
                                monster.targetId = null;
                            }
                            break;
                        
                        case 'returning':
                            this.easystar.findPath(monster.tileX, monster.tileY, monster.spawnPoint.x, monster.spawnPoint.y, (path) => {
                                if (path && path.length > 1) {
                                    path.shift();
                                    monster.movePath = path;
                                } else if (path && path.length <= 1) {
                                    monster.state = 'patrolling';
                                }
                            });
                            this.easystar.calculate();
                            break;
                    }
                }
            }
        });
    }
}

module.exports = GameManager;