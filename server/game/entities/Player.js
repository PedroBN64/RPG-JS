// server/game/entities/Player.js
const Entity = require('./Entity');

class Player extends Entity {
    constructor(id, tileX, tileY) {
        super(id, tileX, tileY, 180); // speed padrão para players
        this.name = `Player-${id.substring(0, 4)}`;

        this.playerId = id; // Duplicado para consistência com o código antigo
        this.color = `0x${Math.floor(Math.random()*16777215).toString(16)}`;
        this.experience = 0;
        this.level = 1;
        this.targetId = null; // ID da entidade que o jogador está mirando
    }

    gainExperience(amount) {
        this.experience += amount;
        console.log(`${this.id} ganhou ${amount} de XP! Total: ${this.experience}`);
        // Aqui iria a lógica para subir de nível
    }
}

module.exports = Player;