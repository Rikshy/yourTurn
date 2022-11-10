export default class TurnSubscriber {
    static gmColor;
    static myTimer;

    static imgCount = 1;
    static currentImgID = null;
    static nextImgID;

    static lastCombatant;
    static expectedNext;

    static begin() {
        Hooks.on("ready", () => {
            const firstGm = game.users.find((u) => u.isGM && u.active);
            if (firstGm === null)
                this.gmColor = "#cc3828";
            else
                this.gmColor = firstGm["color"];
            Hooks.on("updateCombat", (combat, update, options, userId) => {
                TurnSubscriber.onUpdateCombat(combat, update, options, userId);
            });
        });
    }

    static onUpdateCombat(combat, update, options, userId) {
        if (!(update["turn"] || update["round"])) { return; }

        if (combat === null || !combat.started) { return; }

        if (combat.combatant == this.lastCombatant) { return; }

        this.lastCombatant = combat.combatant;       

        var r = document.querySelector(':root');
        if (combat?.combatant?.hasPlayerOwner && combat?.combatant?.players[0].active) {
            const ytPlayerColor = combat?.combatant?.players[0]["color"];
            r.style.setProperty('--yourTurnPlayerColor', ytPlayerColor);
            r.style.setProperty('--yourTurnPlayerColorTransparent', ytPlayerColor + "80");
        }
        else {
            r.style.setProperty('--yourTurnPlayerColor', this.gmColor);
            r.style.setProperty('--yourTurnPlayerColorTransparent', this.gmColor + "80");
        }

        var container = this.getOrCreateContainer(); 

        container.append(this.createNextImage(combat));
        
        //current Actor Image
        var ytImgClass = new Array();
        ytImgClass.push("adding");        
        if (combat?.combatant?.hidden && !game.user.isGM) {
            ytImgClass.push("silhoutte");
        }

        if (this.currentImgID == null) {
            this.currentImgID = `yourTurnImg${this.imgCount - 1}`;

            let currentImgHTML = document.createElement("img");
            currentImgHTML.id = this.currentImgID;
            currentImgHTML.className = "yourTurnImg";
            currentImgHTML.src = combat?.combatant.actor.img;

            container.append(currentImgHTML);
        }

        let currentImgHTML = document.getElementById(this.currentImgID);
        while (ytImgClass.length > 0) {
            currentImgHTML.classList.add(ytImgClass.pop());
        }

        container.append(this.createBanner(combat));

        clearInterval(this?.myTimer);
        this.myTimer = setInterval(() => {
            this.unloadImage()
        }, 5000);
    }

    static loadNextImage(combat) {
        //Put next turns image in a hidden side banner
        let hiddenImgHTML = `
            <div id="yourTurnPreload">
                <img id="yourTurnPreloadImg" src=${combat?.turns[(combat.turn + 1) % combat.turns.length].actor.img} loading="eager" width="800" height="800" />
            <div>`;

        if ($("body").find(`div[id="yourTurnPreload"]`).length > 0) {
            $("body").find(`div[id="yourTurnPreload"]`).remove();
        }

        $("body").append(hiddenImgHTML);
    }

    static unloadImage() {
        clearInterval(this.myTimer);
        var element = document.getElementById("yourTurnBannerBackground");
        element.classList.add("removing");

        element = document.getElementById("yourTurnBanner");
        element.classList.add("removing");

        element = document.getElementById(this.currentImgID);
        element.classList.add("removing");
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

    static createBanner(combat) {
        this.checkAndDelete("yourTurnBanner");

        let text = this.getBannerText(combat);
        let nextCombatant = this.getNextCombatant(combat);

        let bannerDiv = document.createElement("div");
        bannerDiv.id = "yourTurnBanner";
        bannerDiv.className = "yourTurnBanner";
        bannerDiv.style.height = 150;
        bannerDiv.innerHTML = `
            <p id="yourTurnText" class="yourTurnText">${text}</p>
            <div class="yourTurnSubheading">
                ${game.i18n.localize('YOUR-TURN.Round')} #${combat.round} ${game.i18n.localize('YOUR-TURN.Turn')} #${combat.turn + 1}
            </div>
            ${this.getNextTurnHtml(nextCombatant)}
            <div id="yourTurnBannerBackground" class="yourTurnBannerBackground" height="150" />`;

        return bannerDiv;
    }

    static getBannerText(combat) {
        var name = this.getCombatantName(combat);
        let text = '';
        if (combat?.combatant?.isOwner && !game.user.isGM && combat?.combatant?.players[0]?.active) {
            text = `${game.i18n.localize('YOUR-TURN.YourTurn')}, ${name}!`;
        }
        else if (combat?.combatant?.hidden && !game.user.isGM) {
            text = game.i18n.localize('YOUR-TURN.SomethingHappens');
        }
        else {
            text = `${name}'s ${game.i18n.localize('YOUR-TURN.Turn')}!`;
        }

        return text;
    }

    static getCombatantName(combat) {
        var name = combat?.combatant.name;
        if (game.modules.get('combat-utility-belt')?.active) {
            if (game.cub.hideNames.shouldReplaceName(combat?.combatant?.actor)) {
                name = game.cub.hideNames.getReplacementName(combat?.combatant?.actor)
            }
        }

        return name;
    }

    static createNextImage(combat) {
        this.checkAndDelete(this.currentImgID);

        let expectedNext = combat?.nextCombatant;

        var nextImg = document.getElementById(this.nextImgID);

        if (nextImg != null) {
            if (combat?.combatant != this.expectedNext) {
                nextImg.remove();
                this.currentImgID = null;
            }
            else {
                this.currentImgID = this.nextImgID;
            }
        }

        this.imgCount = this.imgCount + 1;
        this.nextImgID = `yourTurnImg${this.imgCount}`;

        let imgHTML = document.createElement("img");
        imgHTML.id = this.nextImgID;
        imgHTML.className = "yourTurnImg";
        imgHTML.src = expectedNext?.actor.img;

        return imgHTML;
    }

    static getNextCombatant(combat) {
        let combatant = ''
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

    static getNextTurnHtml(combatant) {
        let name = combatant.name;
        let imgClass = "yourTurnImg yourTurnSubheading";

        if (game.modules.get('combat-utility-belt')?.active) {
            if (game.cub.hideNames.shouldReplaceName(combatant?.actor)) {
                name = game.cub.hideNames.getReplacementName(combatant?.actor)
                imgClass = imgClass + " silhoutte";
            }
        }

        return `<div class="yourTurnSubheading last">${game.i18n.localize('YOUR-TURN.NextUp')}: <img class="${imgClass}" src="${combatant.actor.img}" />${name}</div>`;
    }

    static checkAndDelete(elementID) {
        var prevImg = document.getElementById(elementID);
        if (prevImg != null) {
            prevImg.remove();
        }
    }
}
TurnSubscriber.begin();