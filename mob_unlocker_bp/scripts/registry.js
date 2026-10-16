import { MOB_KEYS } from "./mobs.js";

const KEY_SET = new Set(MOB_KEYS);

/**
 * Returns the fixed total number of mobs in the challenge.
 * @returns {number} The challenge denominator.
 */
export function totalMobs() {
    return MOB_KEYS.length;
}

/**
 * Returns the full sorted list of mob keys.
 * @returns {string[]} Every mob key, sorted.
 */
export function allMobKeys() {
    return MOB_KEYS;
}

/**
 * Reports whether a key is part of the fixed challenge list.
 * @param {string} key Mob key to test.
 * @returns {boolean} True if the key counts toward the challenge.
 */
export function isMob(key) {
    return KEY_SET.has(key);
}
