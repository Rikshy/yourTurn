Hooks.on("init", () => {
	game.settings.register("your-turn", "tokenImage", {
		scope: "world",
		config: true,
		name: game.i18n.localize('YOUR-TURN.Setting-TokenImage'),
		type: Boolean,
		default: false
	});
    if (game.system.id === "pf2e") {
        game.settings.register("your-turn", "ScaleImageToSize", {
            scope: "world",
            config: true,
            name: game.i18n.localize('YOUR-TURN.Setting-ScaleImageToSize'),
            type: Boolean,
            default: false
        });
    }
	game.settings.register("your-turn", "UseFixedNpcColor", {
		scope: "world",
		config: true,
		name: game.i18n.localize('YOUR-TURN.Setting-UseFixedNpcColor'),
		type: Boolean,
		default: false
	});
    ColorPicker.register("your-turn", "NpcColor", {
        name: game.i18n.localize('YOUR-TURN.Setting-FixedNpcColor'),
        default: "#004040",
        scope: "world",
        config: true
    }, {
        format: "hex"
    });
});

Hooks.on("ready", () => {
    Hooks.on("updateCombat", (combat, update, options, userId) => {
        TurnSubscriber.onUpdateCombat(combat, update);
    });
});

export default class TurnSubscriber {
    static myTimer;

    static lastCombatant;

    static onUpdateCombat(combat, update) {
        if (!(update["turn"] || update["round"])) { return; }

        if (combat === null || !combat.started) { return; }

        if (combat.combatant == this.lastCombatant) { return; }

        this.lastCombatant = combat.combatant;

        let color = "";
        if (combat.combatant?.hasPlayerOwner && combat.combatant?.players[0].active) {
            color = combat?.combatant?.players[0]["color"];
        }
        else if (game.settings.get("your-turn", "UseFixedNpcColor")) {
            color = game.settings.get("your-turn", "NpcColor");
        } else {
            const gm = game.users.find((u) => u.isGM && u.active);
            if (gm)
                color = gm["color"];
            else
                color = game.settings.get("your-turn", "NpcColor");
        }

        var r = document.querySelector(':root');
        r.style.setProperty('--yourTurnPlayerColor', color);
        r.style.setProperty('--yourTurnPlayerColorTransparent', color + "80");

        var container = this.getOrCreateContainer();
        container.append(this.createCurrentImg(combat.combatant));
        container.append(this.createBanner(combat));

        this.handleUnload();
    }

    static getOrCreateContainer() {
        var container = document.getElementById("yourTurnContainer");
        if (container == null) {
            let uiTOP = document.getElementById("ui-top");

            let containerDiv = document.createElement("div");
            containerDiv.id = "yourTurnContainer";
            uiTOP.appendChild(containerDiv);

            container = document.getElementById("yourTurnContainer");
        }

        return container;
    }

    static createCurrentImg(combatant) {
        this.checkAndDelete("yourTurnImg");
        
        //current Actor Image
        var ytImgClass = new Array();
        ytImgClass.push("adding");
        if (combatant?.hidden && !game.user.isGM) {
            ytImgClass.push("silhoutte");
        }   

        if (game.settings.get("your-turn", "ScaleImageToSize")) {
            if (game.system.id === "pf2e") {
                switch (combatant.actor.size) {
                    case "tiny":
                        ytImgClass.push("tiny");
                        break;
                    case "sm":
                        ytImgClass.push("sm");
                        break;
                    case "med":
                        ytImgClass.push("med");
                        break;
                    default:
                        break;
                }
            }
        } else {
            ytImgClass.push("med");
        }

        const img = this.getCombatantImage(combatant);

        let currentImgHTML = document.createElement("img");
        currentImgHTML.id = "yourTurnImg";
        currentImgHTML.className = "yourTurnImg";
        currentImgHTML.src = img;

        while (ytImgClass.length > 0) {
            currentImgHTML.classList.add(ytImgClass.pop());
        }

        return currentImgHTML;
    }

    static createBanner(combat) {
        this.checkAndDelete("yourTurnBanner");

        let bannerDiv = document.createElement("div");
        bannerDiv.id = "yourTurnBanner";
        bannerDiv.className = "yourTurnBanner";
        bannerDiv.style.height = 150;
        bannerDiv.innerHTML = `
            <p id="yourTurnText" class="yourTurnText">
                ${this.getTurnText(combat.combatant)}
            </p>
            <div class="yourTurnSubheading">
                ${game.i18n.localize("YOUR-TURN.Round")} #${combat.round} ${game.i18n.localize('YOUR-TURN.Turn')} #${combat.turn + 1}
            </div>
            <div class="yourTurnSubheading last">
                ${this.getTurnForcast(combat)}
            </div>
            <div class="yourTurnBannerBackground" height="150" />`;

        return bannerDiv;
    }

    static getTurnText(combatant) {
        var name = combatant.name;
        if (game.modules.get('combat-utility-belt')?.active) {
            if (game.cub.hideNames.shouldReplaceName(combatant?.actor)) {
                name = game.cub.hideNames.getReplacementName(combatant?.actor)
            }
        }

        let text = '';
        if (combatant?.isOwner && !game.user.isGM && combatant?.players[0]?.active) {
            text = `${game.i18n.localize('YOUR-TURN.YourTurn')}, ${name}!`;
        }
        else if (combatant?.hidden && !game.user.isGM) {
            text = game.i18n.localize('YOUR-TURN.SomethingHappens');
        }
        else {
            text = `${name}'s ${game.i18n.localize('YOUR-TURN.Turn')}!`;
        }

        return text;
    }

    static getTurnForcast(combat) {
        const combatant = this.getNextCombatant(combat);
        
        let name = combatant.name;
        let imgClass = "yourTurnImg yourTurnSubheading";

        if (game.modules.get('combat-utility-belt')?.active) {
            if (game.cub.hideNames.shouldReplaceName(combatant?.actor)) {
                name = game.cub.hideNames.getReplacementName(combatant?.actor)
                imgClass = imgClass + " silhoutte";
            }
        }

        const img = this.getCombatantImage(combatant);

        return `${game.i18n.localize('YOUR-TURN.NextUp')}: <img class="${imgClass}" src="${img}" />${name}`;
    }

    static getNextCombatant(combat) {
        let combatant = '';
        let j = 1;

        let turns = combat.turns;
        if (game.modules.get('monks-little-details')?.active && !game.user.isGM && game.settings.get('monks-little-details', 'hide-until-turn')) {
            const started = (combat.turns.length > 0) && (combat.round > 0);

            turns = combat.turns.filter((t, index) => {
                let combatant = combat.turns.find(c => c.id == t.id);
                return combatant.hasPlayerOwner || (started && (combat.round > 1 || combat.turn >= index));
            });        
        }

        do {
            combatant = turns[(combat.turn + j++) % turns.length];
        } while (combatant.hidden && (j < turns.length) && !game.user.isGM)

        return combatant;
    }

    static getCombatantImage(combatant) {
        let img = "";
        if (game.settings.get("your-turn", "tokenImage") && combatant.token) {
            img = combatant.token.texture.src;
        }
        else {
            img = combatant.actor.img;
        }
        return img;
    }

    static checkAndDelete(elementID) {
        var prevImg = document.getElementById(elementID);
        if (prevImg != null) {
            prevImg.remove();
        }
    }

    static handleUnload() {
        clearInterval(this?.myTimer);
        this.myTimer = setInterval(() => {
            clearInterval(this.myTimer);

            var element = document.getElementById("yourTurnBanner");
            element.classList.add("removing");
    
            element = document.getElementById("yourTurnImg");
            element.classList.add("removing");
        }, 5000);
    }
}