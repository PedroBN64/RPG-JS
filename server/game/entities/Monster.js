// server/game/entities/Monster.js
const Entity = require('./Entity');

class Monster extends Entity {
    constructor(id, tileX, tileY, type) {
        super(id, tileX, tileY, type.speed);
        this.name = type.name;
        
        this.isMonster = true;
        this.color = type.color;
        this.maxHealth = type.health || 100;
        this.health = this.maxHealth;
        this.damage = type.damage || 5;
        this.experience = type.experience || 10;
        this.lootTable = type.lootTable || [{ itemId: 'gold', chance: 0.75, min: 1, max: 10 }];

        // --- Novas propriedades de Combate e IA ---
        this.attackRange = type.attackRange || 1.5; // Alcance para atacar (1.5 permite diagonais)
        this.attackCooldown = type.attackCooldown || 2000; // Tempo em ms entre ataques (2 segundos)
        this.lastAttackTime = 0; // Guarda quando foi o último ataque

        this.spawnPoint = { x: tileX, y: tileY };
        this.state = 'patrolling';
        this.detectionRange = type.detectionRange;
        this.targetId = null;
    }
}

module.exports = Monster;