const ID_ALIASES = {
    "minecraft:villager": "minecraft:villager_v2",
    "minecraft:zombie_villager": "minecraft:zombie_villager_v2"
};

/**
 * Resolves the mob key for a dead entity's type id.
 * Legacy villager ids collapse onto their current ids.
 * @param {string} typeId Entity type id of the dead mob.
 * @returns {string} The mob key for this type.
 */
export function mobKey(typeId) {
    return ID_ALIASES[typeId] || typeId;
}

/**
 * Builds the vanilla lang key that holds a mob's display name.
 * @param {string} key Mob key from mobKey.
 * @returns {string} The entity name translation key.
 */
export function nameKey(key) {
    return "entity." + key.slice(key.indexOf(":") + 1) + ".name";
}
