// --- CLASSE AUXILIAR PARA OS SPRITES DAS ENTIDADES ---
class EntitySprite extends Phaser.GameObjects.Container {
    constructor(scene, entityInfo) {
        super(scene, entityInfo.x, entityInfo.y);
        
        // --- INÍCIO DA CORREÇÃO ---
        // A ordem das operações foi reorganizada para evitar o erro.

        // 1. Armazena os dados brutos primeiro.
        this.entityData = entityInfo;
        this.entityId = entityInfo.id || entityInfo.playerId;
        this.isMonster = entityInfo.isMonster;

        // 2. Cria TODOS os elementos visuais.
        this.sprite = scene.add.sprite(0, 0, 'player').setOrigin(0.5, 0.5);
        this.add(this.sprite);

        this.nameText = scene.add.text(0, -40, '', { // Começa com texto vazio
            fontFamily: 'Arial', fontSize: '12px', color: '#ffffff', stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5);
        this.add(this.nameText);

        this.healthBar = scene.add.graphics();
        this.add(this.healthBar);

        // 3. AGORA, com tudo criado, chama as funções para preencher os dados.
        this.updateData(entityInfo);
        this.updateHealthBar();
        this.sprite.setTint(entityInfo.color);

        // --- FIM DA CORREÇÃO ---
        
        scene.add.existing(this);
    }

    updateData(entityInfo) {
        this.entityData = entityInfo;
        this.tileX = entityInfo.tileX;
        this.tileY = entityInfo.tileY;
        this.health = entityInfo.health;
        this.maxHealth = entityInfo.maxHealth;
        
        // Esta linha agora funciona, pois this.nameText já existe.
        if (this.nameText.text !== entityInfo.name) {
            this.nameText.setText(entityInfo.name);
        }
    }

    updateHealthBar() {
        this.healthBar.clear();
        this.healthBar.fillStyle(0x330000);
        this.healthBar.fillRect(-16, -28, 32, 5);
        
        const healthPercentage = this.health / this.maxHealth;
        if (healthPercentage > 0) {
            this.healthBar.fillStyle(0x00ff00);
            this.healthBar.fillRect(-16, -28, 32 * healthPercentage, 5);
        }
    }

    flash() {
        this.sprite.setTint(0xff0000);
        this.scene.time.delayedCall(100, () => {
            if (this.sprite.active) {
                this.sprite.setTint(this.entityData.color);
            }
        });
    }

    die() {
        this.healthBar.destroy();
        this.nameText.destroy();
        this.scene.tweens.add({
            targets: this,
            alpha: 0,
            duration: 500,
            onComplete: () => {
                this.destroy();
            }
        });
    }
}

// --- CLASSE PRINCIPAL DA CENA DO JOGO ---
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.entitySprites = {};
        this.TILE_SIZE = 32;
        this.movementMode = 'idle';
        this.currentTargetId = null;

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

        this.targetIndicator = this.add.graphics();
        this.targetIndicator.lineStyle(1, 0xff0000, 1);
        this.targetIndicator.strokeCircle(0, 0, 18);
        this.targetIndicator.setVisible(false);

        const centerX = this.game.config.width / 2;
        const centerY = this.game.config.height / 2;
        
        this.deathText = this.add.text(centerX, centerY - 50, 'Você morreu', { 
            fontSize: '32px', color: '#ff0000', stroke: '#000', strokeThickness: 6 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(100).setVisible(false);
        
        this.reviveButton = this.add.text(centerX, centerY + 20, 'Reviver', { 
            fontSize: '24px', color: '#ffffff', backgroundColor: '#555555', padding: { x: 10, y: 5 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(100).setVisible(false).setInteractive();

        this.reviveButton.on('pointerdown', () => {
            this.socket.emit('requestRespawn');
        });
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
            movedSprite.updateData(entityInfo);
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

        this.socket.on('moveRejected', () => { if (this.movementMode === 'keyboard') this.movementMode = 'idle'; });

        this.socket.on('updateTarget', (targetId) => {
            this.currentTargetId = targetId;
            this.updateTargetIndicator();
        });

        this.socket.on('entityDamaged', ({ id, health, damage }) => {
            const sprite = this.entitySprites[id];
            if (sprite) {
                sprite.health = health;
                sprite.updateHealthBar();
                this.showDamageNumber(sprite, damage);
                sprite.flash();
            }
        });

        this.socket.on('entityDied', (id) => {
            if (id === this.socket.id) {
                this.player.setVisible(false);
                this.player.healthBar.setVisible(false);
                this.deathText.setVisible(true);
                this.reviveButton.setVisible(true);
                this.movementMode = 'dead';
            } 
            else {
                if (this.currentTargetId === id) {
                    this.currentTargetId = null;
                    this.updateTargetIndicator();
                }
                const sprite = this.entitySprites[id];
                if (sprite) {
                    sprite.die();
                    delete this.entitySprites[id];
                }
            }
        });

        this.socket.on('entityRespawned', (entityInfo) => {
            const id = entityInfo.playerId || entityInfo.id;
            let sprite = this.entitySprites[id];

            if (!sprite) {
                this.addEntity(entityInfo);
                return;
            }
            
            sprite.updateData(entityInfo);
            sprite.setPosition(entityInfo.x, entityInfo.y);
            sprite.updateHealthBar();
            sprite.setAlpha(1);
            sprite.setVisible(true);
            sprite.healthBar.setVisible(true);

            if (id === this.socket.id) {
                this.deathText.setVisible(false);
                this.reviveButton.setVisible(false);
                this.movementMode = 'idle';
            }
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

        this.input.keyboard.on('keydown-SPACE', () => {
            if (this.currentTargetId && this.movementMode !== 'dead') {
                this.socket.emit('requestAttack');
            }
        });
    }
    
    handlePointerDown(pointer) {
        if (this.movementMode === 'dead') return;

        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const targetTileX = Math.floor(worldPoint.x / this.TILE_SIZE);
        const targetTileY = Math.floor(worldPoint.y / this.TILE_SIZE);
        
        let clickedOnMonster = false;
        for (const id in this.entitySprites) {
            const sprite = this.entitySprites[id];
            if (sprite && sprite.isMonster && sprite.tileX === targetTileX && sprite.tileY === targetTileY) {
                this.socket.emit('requestTarget', id);
                clickedOnMonster = true;
                break;
            }
        }
        
        if (!clickedOnMonster) {
            if (this.movementMode === 'keyboard') return;
            this.movementMode = 'pathfinding';
            this.socket.emit('requestPath', { x: targetTileX, y: targetTileY });
        }
    }
    
    createMap() {
        this.map = this.make.tilemap({ data: this.mapData, tileWidth: this.TILE_SIZE, tileHeight: this.TILE_SIZE });
        const tiles = this.map.addTilesetImage('tiles');
        this.map.createLayer(0, tiles, 0, 0);
    }
    
    addEntity(entityInfo) {
        const id = entityInfo.playerId || entityInfo.id;
        if (this.entitySprites[id]) return;
        const sprite = new EntitySprite(this, entityInfo);
        this.entitySprites[id] = sprite;
        if (entityInfo.playerId === this.socket.id) {
            this.player = sprite;
            this.setupCamera();
        }
    }
    
    setupCamera() {
        if (this.player && this.map) {
            this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
            this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
        }
    }

    update() {
        if (this.player && this.movementMode !== 'keyboard' && this.movementMode !== 'dead') {
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
        if (this.currentTargetId) {
            this.updateTargetIndicator();
        }
    }

    updateTargetIndicator() {
        const targetSprite = this.entitySprites[this.currentTargetId];
        if (targetSprite) {
            this.targetIndicator.setPosition(targetSprite.x, targetSprite.y);
            this.targetIndicator.setVisible(true);
        } else {
            this.targetIndicator.setVisible(false);
        }
    }

    showDamageNumber(sprite, damage) {
        const damageText = this.add.text(sprite.x, sprite.y - 20, damage.toString(), {
            fontFamily: 'Arial', fontSize: '16px', color: '#ff0000', stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5).setDepth(99);

        this.tweens.add({
            targets: damageText,
            y: sprite.y - 50,
            alpha: 0,
            duration: 800,
            ease: 'Power1',
            onComplete: () => {
                damageText.destroy();
            }
        });
    }
}

const config = {
    type: Phaser.AUTO,
    width: 352,
    height: 352,
    scale: {
        parent: 'game-container',
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [GameScene],
    pixelArt: true,
};

const game = new Phaser.Game(config);