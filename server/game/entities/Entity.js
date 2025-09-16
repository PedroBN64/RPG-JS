// server/game/entities/Entity.js
class Entity {
    constructor(id, tileX, tileY, speed) {
        this.id = id;
        this.name = 'Entity';
        this.tileX = tileX;
        this.tileY = tileY;
        this.x = tileX * 32 + 16;
        this.y = tileY * 32 + 16;
        this.speed = speed;

        this.maxHealth = 100;
        this.health = this.maxHealth;

        this.movePath = null;
        this.lastMoveTime = 0;
    }

    respawn(tileX, tileY) {
        this.health = this.maxHealth;
        this.tileX = tileX;
        this.tileY = tileY;
        this.x = tileX * 32 + 16;
        this.y = tileY * 32 + 16;
        this.movePath = null;
    }

    isAlive() {
        return this.health > 0;
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health < 0) {
            this.health = 0;
        }
    }

    // Retorna os dados essenciais da entidade para enviar aos clientes
    getSnapshot() {
        return {
            id: this.id,
            name: this.name,
            playerId: this.playerId, // playerId existe apenas para Player
            tileX: this.tileX,
            tileY: this.tileY,
            x: this.x,
            y: this.y,
            speed: this.speed,
            color: this.color,
            isMonster: this.isMonster,
            health: this.health,
            maxHealth: this.maxHealth,
        };
    }
}

module.exports = Entity;