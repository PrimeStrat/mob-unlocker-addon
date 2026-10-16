import {
    world,
    system,
    Player,
    StartupEvent,
    CommandPermissionLevel,
    CustomCommandStatus,
    CustomCommandParamType
} from "@minecraft/server";
import { mobKey, nameKey } from "./mob.js";
import {
    loadPlayerKilled,
    loadGlobalKilled,
    addPlayerKey,
    addGlobalKey,
    resetAllProgress,
    reconcilePlayerEpoch
} from "./storage.js";
import { getSettings } from "./settings.js";
import { openSettingsForm, openCollectionForm, sendProgress, openResetForm } from "./ui.js";
import { isMob, totalMobs } from "./registry.js";

const UNLOCK_SOUND = "random.orb";

const playerCache = new Map();
let globalCache = new Set();

/**
 * Loads a player's killed set into the in-memory cache.
 * @param {Player} player Player to cache.
 * @returns {Set<string>} The cached set for that player.
 */
function cachePlayer(player) {
    const killed = loadPlayerKilled(player);
    playerCache.set(player.id, killed);
    return killed;
}

/**
 * Returns a player's cached killed set, loading it if absent.
 * @param {Player} player Player whose cache is needed.
 * @returns {Set<string>} The cached set for that player.
 */
function getPlayerCache(player) {
    const existing = playerCache.get(player.id);
    if (existing) {
        return existing;
    }
    return cachePlayer(player);
}

/**
 * Resets all stored progress and rebuilds the in-memory caches to match.
 * @returns {void}
 */
function performReset() {
    resetAllProgress();
    globalCache = new Set();
    playerCache.clear();
    for (const player of world.getAllPlayers()) {
        cachePlayer(player);
    }
}

/**
 * Announces a newly unlocked mob and plays its sound for a player.
 * @param {Player} player Player who unlocked the mob.
 * @param {string} key Mob key that was unlocked.
 * @param {number} playerCount How many mobs that player has unlocked.
 * @returns {void}
 */
function announceUnlock(player, key, playerCount) {
    const settings = getSettings();
    const have = settings.globalCounter ? globalCache.size : playerCount;
    if (!settings.disableMessage) {
        world.sendMessage({
            rawtext: [
                { text: "§b" + player.name + "§r unlocked §a" },
                { translate: nameKey(key) },
                { text: "§r! §7(" + have + "/" + totalMobs() + ")§r" }
            ]
        });
    }
    if (!settings.disableSound) {
        const fresh = world.getPlayers({ name: player.name })[0];
        if (fresh) {
            fresh.playSound(UNLOCK_SOUND);
        }
    }
}

/**
 * Records a mob kill for a player and the global registry.
 * Only mobs that belong to the fixed challenge list are counted.
 * @param {Player} player Player who got the kill.
 * @param {string} typeId Entity type id of the dead mob.
 * @returns {void}
 */
function recordKill(player, typeId) {
    const key = mobKey(typeId);
    if (!isMob(key)) {
        return;
    }
    const cache = getPlayerCache(player);
    if (cache.has(key)) {
        return;
    }
    cache.add(key);
    addPlayerKey(player, key);
    if (!globalCache.has(key)) {
        globalCache.add(key);
        addGlobalKey(key);
    }
    announceUnlock(player, key, cache.size);
}

/**
 * Registers the custom commands on world startup.
 * @param {StartupEvent} event Startup registration event.
 * @returns {void}
 */
function registerCommands(event) {
    const registry = event.customCommandRegistry;
    registry.registerEnum("muc:filter", ["all", "collected", "missing"]);
    registry.registerCommand(
        {
            name: "muc:settings",
            description: "Open the Mob Unlocker Challenge settings.",
            permissionLevel: CommandPermissionLevel.Any,
            cheatsRequired: false
        },
        (origin) => {
            const player = origin.sourceEntity;
            if (!player || player.typeId !== "minecraft:player") {
                return { status: CustomCommandStatus.Failure, message: "Run this as a player." };
            }
            system.run(() => openSettingsForm(player));
            return { status: CustomCommandStatus.Success };
        }
    );
    registry.registerCommand(
        {
            name: "muc:progress",
            description: "Show your Mob Unlocker Challenge progress.",
            permissionLevel: CommandPermissionLevel.Any,
            cheatsRequired: false
        },
        (origin) => {
            const player = origin.sourceEntity;
            if (!player || player.typeId !== "minecraft:player") {
                return { status: CustomCommandStatus.Failure, message: "Run this as a player." };
            }
            system.run(() => sendProgress(player));
            return { status: CustomCommandStatus.Success };
        }
    );
    registry.registerCommand(
        {
            name: "muc:collection",
            description: "Browse killed and missing mobs.",
            permissionLevel: CommandPermissionLevel.Any,
            cheatsRequired: false,
            optionalParameters: [{ name: "muc:filter", type: CustomCommandParamType.Enum }]
        },
        (origin, filter) => {
            const player = origin.sourceEntity;
            if (!player || player.typeId !== "minecraft:player") {
                return { status: CustomCommandStatus.Failure, message: "Run this as a player." };
            }
            const mode = filter || "all";
            system.run(() => openCollectionForm(player, mode));
            return { status: CustomCommandStatus.Success };
        }
    );
    registry.registerCommand(
        {
            name: "muc:reset",
            description: "Reset all Mob Unlocker Challenge progress.",
            permissionLevel: CommandPermissionLevel.GameDirectors,
            cheatsRequired: false
        },
        (origin) => {
            const player = origin.sourceEntity;
            if (!player || player.typeId !== "minecraft:player") {
                return { status: CustomCommandStatus.Failure, message: "Run this as a player." };
            }
            system.run(() => openResetForm(player, performReset));
            return { status: CustomCommandStatus.Success };
        }
    );
}

system.beforeEvents.startup.subscribe(registerCommands);

world.afterEvents.worldLoad.subscribe(() => {
    globalCache = loadGlobalKilled();
    for (const player of world.getAllPlayers()) {
        cachePlayer(player);
    }
});

world.afterEvents.playerSpawn.subscribe((event) => {
    if (event.initialSpawn) {
        reconcilePlayerEpoch(event.player);
        cachePlayer(event.player);
    }
});

world.afterEvents.playerLeave.subscribe((event) => {
    playerCache.delete(event.playerId);
});

world.afterEvents.entityDie.subscribe((event) => {
    const killer = event.damageSource.damagingEntity;
    if (!(killer instanceof Player)) {
        return;
    }
    recordKill(killer, event.deadEntity.typeId);
});
