class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.entitySprites = {};
        this.TILE_SIZE = 32;
        this.movementMode = 'idle'; // 'idle', 'keyboard', 'pathfinding'

        this.mapDataLoaded = false;
        this.playerDataLoaded = false;
        this.monsterDataLoaded = false;
    }

    preload() {
        this.load.image('player', 'assets/player.png');
        this.load.spritesheet('tiles', 'assets/tileset.png', { frameWidth: 32, frameHeight: 32 });
    }

    create() {
        this.socket = io();
        this.setupNetworkListeners();
    }
    
    setupNetworkListeners() {
        this.socket.on('mapData', (mapData) => { this.mapData = mapData; this.mapDataLoaded = true; this.initializeGame(); });
        this.socket.on('currentPlayers', (players) => { this.playersInfo = players; this.playerDataLoaded = true; this.initializeGame(); });
        this.socket.on('currentMonsters', (monsters) => { this.monstersInfo = monsters; this.monsterDataLoaded = true; this.initializeGame(); });
        this.socket.on('newPlayer', (playerInfo) => { if (this.map) this.addEntity(playerInfo); });
        this.socket.on('playerDisconnected', (playerId) => {
            if (this.entitySprites[playerId]) { this.entitySprites[playerId].destroy(); delete this.entitySprites[playerId]; }
        });
        
        this.socket.on('entityMoved', (entityInfo) => {
            const movedSprite = this.entitySprites[entityInfo.playerId || entityInfo.id];
            if (!movedSprite) return;
            const isOurPlayer = entityInfo.playerId === this.socket.id;

            this.tweens.add({
                targets: movedSprite, x: entityInfo.x, y: entityInfo.y,
                duration: entityInfo.speed, ease: 'Linear',
                onComplete: () => {
                    if (isOurPlayer) {
                        if (this.movementMode === 'keyboard') this.movementMode = 'idle';
                        if (this.movementMode === 'pathfinding' && entityInfo.pathComplete) this.movementMode = 'idle';
                    }
                }
            });
        });

        this.socket.on('moveRejected', () => {
            if (this.movementMode === 'keyboard') this.movementMode = 'idle';
        });
    }
    
    initializeGame() {
        if (!this.mapDataLoaded || !this.playerDataLoaded || !this.monsterDataLoaded) return;
        this.createMap();
        Object.values(this.playersInfo).forEach(p => this.addEntity(p));
        Object.values(this.monstersInfo).forEach(m => this.addEntity(m));
        this.setupCamera();
        this.input.on('pointerdown', this.handlePointerDown, this);
        this.cursors = this.input.keyboard.createCursorKeys();
    }
    
    handlePointerDown(pointer) {
        if (this.movementMode === 'keyboard') return;
        this.movementMode = 'pathfinding';
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const targetTileX = Math.floor(worldPoint.x / this.TILE_SIZE);
        const targetTileY = Math.floor(worldPoint.y / this.TILE_SIZE);
        this.socket.emit('requestPath', { x: targetTileX, y: targetTileY });
    }
    
    createMap() {
        this.map = this.make.tilemap({ data: this.mapData, tileWidth: this.TILE_SIZE, tileHeight: this.TILE_SIZE });
        const tiles = this.map.addTilesetImage('tiles'); this.map.createLayer(0, tiles, 0, 0);
    }
    
    addEntity(entityInfo) {
        const entityId = entityInfo.playerId || entityInfo.id; if (this.entitySprites[entityId]) return;
        const sprite = this.add.sprite(entityInfo.x, entityInfo.y, 'player').setOrigin(0.5, 0.5);
        sprite.setTint(entityInfo.color); this.entitySprites[entityId] = sprite;
        if (entityInfo.playerId === this.socket.id) this.player = sprite;
    }
    
    setupCamera() {
        if (this.player && this.map) {
            this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
            this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
        }
    }

    update() {
        if (this.player && this.movementMode !== 'keyboard') {
            let direction = [];
            if (this.cursors.up.isDown) direction.push('up');
            if (this.cursors.down.isDown) direction.push('down');
            if (this.cursors.left.isDown) direction.push('left');
            if (this.cursors.right.isDown) direction.push('right');
            
            if (direction.length > 0) {
                this.movementMode = 'keyboard'; 
                this.socket.emit('requestMove', direction.join('-'));
            }
        }
    }
}

const config = {
    type: Phaser.AUTO,
    // A resolução base do jogo continua a mesma (nosso campo de visão)
    width: 352,
    height: 352,
    
    // --- NOVA CONFIGURAÇÃO DE ESCALA ---
    scale: {
        parent: 'game-container', // ID do nosso div no HTML
        mode: Phaser.Scale.FIT, // FIT ajusta o jogo na tela mantendo a proporção
        autoCenter: Phaser.Scale.CENTER_BOTH // Centraliza o jogo na horizontal e vertical
    },
    // --- FIM DA NOVA CONFIGURAÇÃO ---

    scene: [GameScene],
    pixelArt: true,
};

const game = new Phaser.Game(config);