import {
    world,
    system,
    Player,
    Entity,
    Dimension,
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
const HIT_TAG_PREFIX = "muc:hit:";
const CREAKING_ID = "minecraft:creaking";
const CREAKING_HEART_ID = "minecraft:creaking_heart";
const HEART_RANGE = 48;
const PLAYER_RANGE = 48;

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
 * Tags a challenge mob with the id of a player who hit it.
 * @param {Entity} entity Mob that was hit.
 * @param {Entity|undefined} attacker Entity that hit it.
 * @returns {void}
 */
function tagHit(entity, attacker) {
    if (!(attacker instanceof Player) || !entity || !entity.isValid) {
        return;
    }
    if (!isMob(mobKey(entity.typeId))) {
        return;
    }
    const tag = HIT_TAG_PREFIX + attacker.id;
    if (!entity.hasTag(tag)) {
        entity.addTag(tag);
    }
}

/**
 * Unlocks a dead mob for every online player who hit it, plus its killer.
 * @param {string} typeId Entity type id of the dead mob.
 * @param {string[]} tags Tags the mob carried when it died.
 * @param {Entity|undefined} killer Entity that dealt the final blow.
 * @returns {void}
 */
function creditHitters(typeId, tags, killer) {
    const ids = new Set();
    for (const tag of tags) {
        if (tag.startsWith(HIT_TAG_PREFIX)) {
            ids.add(tag.slice(HIT_TAG_PREFIX.length));
        }
    }
    if (killer instanceof Player) {
        ids.add(killer.id);
    }
    if (ids.size === 0) {
        return;
    }
    for (const player of world.getAllPlayers()) {
        if (ids.has(player.id)) {
            recordKill(player, typeId);
        }
    }
}

/**
 * Finds the players who earn a Creaking when a Creaking Heart breaks: the
 * breaker and everyone near any Creaking around the heart.
 * @param {Player} breaker Player breaking the heart.
 * @param {Dimension} dimension Dimension of the heart.
 * @param {{x: number, y: number, z: number}} location Block location of the heart.
 * @returns {string[]} Ids of the players to credit, empty if no Creaking is near.
 */
function creakingWitnesses(breaker, dimension, location) {
    const creakings = dimension.getEntities({ type: CREAKING_ID, location, maxDistance: HEART_RANGE });
    if (creakings.length === 0) {
        return [];
    }
    const ids = new Set([breaker.id]);
    for (const creaking of creakings) {
        for (const player of dimension.getPlayers({ location: creaking.location, maxDistance: PLAYER_RANGE })) {
            ids.add(player.id);
        }
    }
    return [...ids];
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

world.afterEvents.entityHitEntity.subscribe((event) => {
    tagHit(event.hitEntity, event.damagingEntity);
});

world.afterEvents.projectileHitEntity.subscribe((event) => {
    tagHit(event.getEntityHit().entity, event.source);
});

world.afterEvents.entityHurt.subscribe((event) => {
    tagHit(event.hurtEntity, event.damageSource.damagingEntity);
});

world.afterEvents.entityDie.subscribe((event) => {
    const dead = event.deadEntity;
    const tags = dead.isValid ? dead.getTags() : [];
    creditHitters(dead.typeId, tags, event.damageSource.damagingEntity);
});

world.beforeEvents.playerBreakBlock.subscribe((event) => {
    if (event.block.typeId !== CREAKING_HEART_ID) {
        return;
    }
    const ids = creakingWitnesses(event.player, event.dimension, event.block.location);
    if (ids.length === 0) {
        return;
    }
    system.run(() => {
        for (const player of world.getAllPlayers()) {
            if (ids.includes(player.id)) {
                recordKill(player, CREAKING_ID);
            }
        }
    });
});
