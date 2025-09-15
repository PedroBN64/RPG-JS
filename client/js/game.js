class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.playerSprites = {};
        this.isMoving = false;
        this.TILE_SIZE = 32;
    }

    preload() {
        this.load.image('player', 'assets/player.png');
        this.load.spritesheet('tiles', 'assets/tileset.png', { frameWidth: 32, frameHeight: 32 });
    }

    create() {
        this.socket = io();
        this.otherPlayers = this.add.group();
        this.setupNetworkListeners();
    }
    
    setupNetworkListeners() {
        this.socket.on('connect', () => {
            console.log('Conectado ao servidor!');
            this.mapDataLoaded = false;
            this.playerDataLoaded = false;
        });

        this.socket.on('mapData', (mapData) => {
            this.mapData = mapData;
            this.mapDataLoaded = true;
            this.initializeGame();
        });

        this.socket.on('currentPlayers', (players) => {
            this.playersInfo = players;
            this.playerDataLoaded = true;
            this.initializeGame();
        });

        this.socket.on('newPlayer', (playerInfo) => {
            if (this.map) this.addOtherPlayer(playerInfo);
        });

        this.socket.on('playerDisconnected', (playerId) => {
            if (this.playerSprites[playerId]) {
                this.playerSprites[playerId].destroy();
                delete this.playerSprites[playerId];
            }
        });

        this.socket.on('playerMoved', (playerInfo) => {
            const movedPlayerSprite = this.playerSprites[playerInfo.playerId];
            if (!movedPlayerSprite) return;

            const isOurPlayer = playerInfo.playerId === this.socket.id;

            this.tweens.add({
                targets: movedPlayerSprite,
                x: playerInfo.x,
                y: playerInfo.y,
                // --- MUDANÇA PRINCIPAL ---
                // Usa a velocidade enviada pelo servidor
                duration: playerInfo.speed, 
                ease: 'Linear',
                onComplete: () => {
                    if (isOurPlayer) {
                        this.isMoving = false;
                    }
                }
            });
        });

        this.socket.on('moveRejected', () => {
            this.isMoving = false;
        });
    }

    initializeGame() {
        if (!this.mapDataLoaded || !this.playerDataLoaded) return;
        
        this.createMap();

        Object.values(this.playersInfo).forEach(playerInfo => {
            if (playerInfo.playerId === this.socket.id) {
                this.addPlayer(playerInfo);
            } else {
                this.addOtherPlayer(playerInfo);
            }
        });
        
        this.setupCamera();
        
        this.cursors = this.input.keyboard.createCursorKeys();
    }
    
    createMap() {
        this.map = this.make.tilemap({ data: this.mapData, tileWidth: this.TILE_SIZE, tileHeight: this.TILE_SIZE });
        const tiles = this.map.addTilesetImage('tiles');
        this.map.createLayer(0, tiles, 0, 0);
    }
    
    addPlayer(playerInfo) {
        this.player = this.add.sprite(playerInfo.x, playerInfo.y, 'player').setOrigin(0.5, 0.5);
        this.player.setTint(playerInfo.color);
        this.playerSprites[playerInfo.playerId] = this.player;
    }

    addOtherPlayer(playerInfo) {
        const otherPlayer = this.add.sprite(playerInfo.x, playerInfo.y, 'player').setOrigin(0.5, 0.5);
        otherPlayer.setTint(playerInfo.color);
        this.otherPlayers.add(otherPlayer);
        this.playerSprites[playerInfo.playerId] = otherPlayer;
    }
    
    setupCamera() {
        if (this.player && this.map) {
            this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
            this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
        }
    }

    update() {
        if (this.player && !this.isMoving) {
            let direction = [];

            if (this.cursors.up.isDown) direction.push('up');
            if (this.cursors.down.isDown) direction.push('down');
            if (this.cursors.left.isDown) direction.push('left');
            if (this.cursors.right.isDown) direction.push('right');
            
            if (direction.length > 0) {
                this.isMoving = true;
                this.socket.emit('requestMove', direction.join('-'));
            }
        }
    }
}

const config = {
    type: Phaser.AUTO,
    width: 352,
    height: 352,
    scene: [GameScene],
    pixelArt: true,
};

const game = new Phaser.Game(config);