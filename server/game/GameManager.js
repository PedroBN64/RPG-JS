const easystarjs = require('easystarjs');
const { map, TILE_SIZE } = require('../config/map');
const Player = require('./entities/Player');
const Monster = require('./entities/Monster');

class GameManager {
    constructor(io) {
        this.io = io;
        this.players = {};
        this.monsters = {};
        
        this.monsterTypes = [
            { idPrefix: 'orc', name: 'Orc', speed: 300, color: '0x228B22', detectionRange: 5, health: 70, damage: 8, experience: 25, attackCooldown: 2200, attackRange: 1.5, spawnPoint: { x: 15, y: 4 } },
            { idPrefix: 'cyclops', name: 'Cyclops', speed: 350, color: '0xff4500', detectionRange: 4, health: 150, damage: 15, experience: 70, attackCooldown: 2800, attackRange: 1.5, spawnPoint: { x: 30, y: 18 } }
        ];
        
        this.playerSpawnPoint = { x: 2, y: 2 };

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

    isTileBlocked(x, y) {
        if (!map[y] || map[y][x] === undefined || map[y][x] === 1) return true;
        for (const id in this.players) {
            const player = this.players[id];
            if (player.isAlive() && player.tileX === x && player.tileY === y) return true;
        }
        for (const id in this.monsters) {
            const monster = this.monsters[id];
            if (monster.isAlive() && monster.tileX === x && monster.tileY === y) return true;
        }
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
            const { x, y } = type.spawnPoint;
            this.monsters[id] = new Monster(id, x, y, type);
        });
    }
    
    getSnapshot(object) {
        const snapshot = {};
        for (const id in object) {
            snapshot[id] = object[id].getSnapshot();
        }
        return snapshot;
    }

    handleConnection(socket) {
        const { x, y } = this.playerSpawnPoint;
        const player = new Player(socket.id, x, y);
        this.players[socket.id] = player;
        
        socket.emit('currentPlayers', this.getSnapshot(this.players));
        socket.emit('currentMonsters', this.getSnapshot(this.monsters));
        socket.emit('mapData', map);
        socket.broadcast.emit('newPlayer', player.getSnapshot());

        socket.on('disconnect', () => {
            delete this.players[socket.id];
            this.io.emit('playerDisconnected', socket.id);
        });

        socket.on('requestRespawn', () => {
            const player = this.players[socket.id];
            if (player && !player.isAlive()) {
                const { x, y } = this.playerSpawnPoint;
                player.respawn(x, y);
                this.io.emit('entityRespawned', player.getSnapshot());
            }
        });

        socket.on('requestMove', (direction) => this.handleRequestMove(socket, direction));
        socket.on('requestPath', (targetTile) => this.handleRequestPath(socket, targetTile));
        socket.on('requestTarget', (targetId) => this.handleRequestTarget(socket, targetId));
        socket.on('requestAttack', () => this.handleRequestAttack(socket));
    }

    handleRequestTarget(socket, targetId) {
        const player = this.players[socket.id];
        const target = this.monsters[targetId] || this.players[targetId];
        if (player && target && target.isAlive()) {
            player.targetId = targetId;
            socket.emit('updateTarget', targetId);
        }
    }

    handleRequestAttack(socket) {
        const player = this.players[socket.id];
        if (!player || !player.targetId || !player.isAlive()) return;

        const target = this.monsters[player.targetId];
        if (!target || !target.isAlive()) {
            player.targetId = null;
            socket.emit('updateTarget', null);
            return;
        }

        const distance = Math.sqrt(Math.pow(player.tileX - target.tileX, 2) + Math.pow(player.tileY - target.tileY, 2));
        if (distance > 1.5) return;

        const damage = 10;
        target.takeDamage(damage);
        this.io.emit('entityDamaged', { id: target.id, health: target.health, damage });

        if (!target.isAlive()) {
            this.io.emit('entityDied', target.id);
            player.gainExperience(target.experience);
            console.log(`${player.id} matou ${target.id} e ganhou ${target.experience} XP.`);
            if (player.targetId === target.id) {
                player.targetId = null;
                socket.emit('updateTarget', null);
            }
            
            const monsterType = this.monsterTypes.find(t => target.id.includes(t.idPrefix));
            if (monsterType) {
                setTimeout(() => {
                    const { x, y } = monsterType.spawnPoint;
                    target.respawn(x, y);
                    this.io.emit('entityRespawned', target.getSnapshot());
                    console.log(`${target.id} renasceu!`);
                }, 20000);
            }
        }
    }

    handleRequestMove(socket, direction) {
        const player = this.players[socket.id];
        if (!player || !player.isAlive()) return;
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
            player.x = player.tileX * TILE_SIZE + 16; player.y = player.tileY * TILE_SIZE + 16;
            this.io.emit('entityMoved', player.getSnapshot());
        } else {
            socket.emit('moveRejected');
        }
    }

    handleRequestPath(socket, targetTile) {
        const player = this.players[socket.id];
        if (!player || player.movePath || !player.isAlive()) return;
        const allEntities = {...this.players, ...this.monsters};
        Object.values(allEntities).forEach(entity => {
            const entityId = entity.playerId || entity.id;
            if (entity.isAlive() && entityId !== socket.id) {
                this.easystar.avoidAdditionalPoint(entity.tileX, entity.tileY);
            }
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

    executeMovement() {
        const now = Date.now();
        const allEntities = {...this.players, ...this.monsters};
        Object.values(allEntities).forEach(entity => {
            if (entity.isAlive() && entity.movePath && entity.movePath.length > 0) {
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
                entity.x = entity.tileX * TILE_SIZE + 16; entity.y = entity.tileY * TILE_SIZE + 16;
                const isPathComplete = entity.movePath.length === 0;
                this.io.emit('entityMoved', { ...entity.getSnapshot(), pathComplete: isPathComplete });
                if (isPathComplete) {
                    entity.movePath = null;
                    if (entity.isMonster && entity.state === 'returning') entity.state = 'patrolling';
                }
            }
        });
    }

    updateMonsterAI() {
        const now = Date.now();
        const allEntities = {...this.players, ...this.monsters};
        Object.values(this.monsters).forEach(monster => {
            if (!monster.isAlive()) return;

            if (!monster.movePath) {
                let closestPlayer = null;
                let minDistance = Infinity;

                Object.values(this.players).forEach(player => {
                    if (player.isAlive()) {
                        const distance = Math.sqrt(Math.pow(monster.tileX - player.tileX, 2) + Math.pow(monster.tileY - player.tileY, 2));
                        if (distance < minDistance) {
                            minDistance = distance;
                            closestPlayer = player;
                        }
                    }
                });

                if (closestPlayer) {
                    // --- CORREÇÃO E REESTRUTURAÇÃO DA LÓGICA DE PERSEGUIÇÃO ---
                    const targetIsOutOfRange = minDistance > monster.detectionRange;
                    
                    // Se o monstro estava perseguindo alguém, mas o jogador mais próximo saiu do alcance, ele desiste.
                    if (monster.state === 'chasing' && targetIsOutOfRange) {
                        monster.state = 'returning';
                        monster.targetId = null;
                    }
                    
                    // Se o jogador mais próximo está DENTRO do alcance, ele se torna o alvo.
                    if (!targetIsOutOfRange) {
                        monster.state = 'chasing';
                        monster.targetId = closestPlayer.playerId;
                    }

                    switch(monster.state) {
                        case 'patrolling':
                            // A lógica de patrulha só acontece se a lógica acima não o colocou em modo 'chasing'
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
                            break;

                        case 'chasing':
                            const target = this.players[monster.targetId]; // Pega o alvo correto (o mais próximo)
                            if (target) {
                                if (minDistance <= monster.attackRange) { // Verifica a distância para o alvo correto
                                    if (now > monster.lastAttackTime + monster.attackCooldown) {
                                        monster.lastAttackTime = now;
                                        target.takeDamage(monster.damage);
                                        this.io.emit('entityDamaged', { id: target.id, health: target.health, damage: monster.damage });
                                        
                                        if (!target.isAlive()) {
                                            this.io.emit('entityDied', target.id);
                                            monster.state = 'returning';
                                            monster.targetId = null;
                                        }
                                    }
                                } else { // Se não pode atacar, move-se em direção ao alvo correto
                                    Object.values(allEntities).forEach(e => {
                                        const eId = e.playerId || e.id;
                                        if (e.isAlive() && eId !== monster.id && eId !== target.id) {
                                            this.easystar.avoidAdditionalPoint(e.tileX, e.tileY);
                                        }
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