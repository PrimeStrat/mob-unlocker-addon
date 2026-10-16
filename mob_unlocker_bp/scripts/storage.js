import { world, World, Player } from "@minecraft/server";
import { isMob } from "./registry.js";

const PLAYER_PROP = "muc:player_kills";
const GLOBAL_PROP = "muc:global_kills";
const WORLD_EPOCH_PROP = "muc:reset_epoch";
const PLAYER_EPOCH_PROP = "muc:player_epoch";

/**
 * Loads every still-valid mob key stored on a holder into one Set.
 * @param {World|Player} holder Property owner.
 * @param {string} prop Property identifier.
 * @returns {Set<string>} All killed mob keys for that holder.
 */
function loadAll(holder, prop) {
    const raw = holder.getDynamicProperty(prop);
    if (typeof raw !== "string" || raw.length === 0) {
        return new Set();
    }
    return new Set(JSON.parse(raw).filter((key) => isMob(key)));
}

/**
 * Adds a key to a holder's stored list if not already present.
 * @param {World|Player} holder Property owner.
 * @param {string} prop Property identifier.
 * @param {string} key Mob key to add.
 * @returns {boolean} True if the key was newly added, false if it existed.
 */
function addKey(holder, prop, key) {
    const keys = loadAll(holder, prop);
    if (keys.has(key)) {
        return false;
    }
    keys.add(key);
    holder.setDynamicProperty(prop, JSON.stringify([...keys]));
    return true;
}

/**
 * Loads a player's killed mob set.
 * @param {Player} player Owning player.
 * @returns {Set<string>} The player's killed mob keys.
 */
export function loadPlayerKilled(player) {
    return loadAll(player, PLAYER_PROP);
}

/**
 * Loads the global killed mob set.
 * @returns {Set<string>} All globally killed mob keys.
 */
export function loadGlobalKilled() {
    return loadAll(world, GLOBAL_PROP);
}

/**
 * Records a key against a player.
 * @param {Player} player Owning player.
 * @param {string} key Mob key to add.
 * @returns {boolean} True if newly added for that player.
 */
export function addPlayerKey(player, key) {
    return addKey(player, PLAYER_PROP, key);
}

/**
 * Records a key against the world.
 * @param {string} key Mob key to add.
 * @returns {boolean} True if newly added globally.
 */
export function addGlobalKey(key) {
    return addKey(world, GLOBAL_PROP, key);
}

/**
 * Reads the current world reset epoch.
 * @returns {number} The world epoch (0 if never reset).
 */
function worldEpoch() {
    const value = world.getDynamicProperty(WORLD_EPOCH_PROP);
    return typeof value === "number" ? value : 0;
}

/**
 * Resets all progress: the global list, every online player, and the world
 * epoch. Bumping the epoch marks offline players stale so their data is
 * wiped on their next spawn via reconcilePlayerEpoch.
 * @returns {void}
 */
export function resetAllProgress() {
    const epoch = worldEpoch() + 1;
    world.setDynamicProperty(GLOBAL_PROP, undefined);
    for (const player of world.getAllPlayers()) {
        player.setDynamicProperty(PLAYER_PROP, undefined);
        player.setDynamicProperty(PLAYER_EPOCH_PROP, epoch);
    }
    world.setDynamicProperty(WORLD_EPOCH_PROP, epoch);
}

/**
 * Wipes a player's kills if their stored epoch is behind the world epoch,
 * catching players who were offline during a reset.
 * @param {Player} player Player to reconcile.
 * @returns {boolean} True if the player was reset by this call.
 */
export function reconcilePlayerEpoch(player) {
    const current = worldEpoch();
    if (player.getDynamicProperty(PLAYER_EPOCH_PROP) === current) {
        return false;
    }
    player.setDynamicProperty(PLAYER_PROP, undefined);
    player.setDynamicProperty(PLAYER_EPOCH_PROP, current);
    return true;
}
