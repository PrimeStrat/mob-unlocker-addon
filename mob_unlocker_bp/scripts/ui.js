import { Player } from "@minecraft/server";
import { ModalFormData, ActionFormData, MessageFormData, FormCancelationReason } from "@minecraft/server-ui";
import { getSettings, saveSettings } from "./settings.js";
import { loadPlayerKilled, loadGlobalKilled } from "./storage.js";
import { nameKey } from "./mob.js";
import { allMobKeys, totalMobs } from "./registry.js";

/**
 * Shows a form, retrying while the player is busy with another screen.
 * @param {ModalFormData|ActionFormData|MessageFormData} form Form to display.
 * @param {Player} player Target player.
 * @returns {Promise<any>} The form response.
 */
async function showSafe(form, player) {
    let response;
    do {
        response = await form.show(player);
    } while (response.canceled && response.cancelationReason === FormCancelationReason.UserBusy);
    return response;
}

/**
 * Opens the settings form and persists any changes the player makes.
 * @param {Player} player Player opening settings.
 * @returns {Promise<void>} Resolves once the form is handled.
 */
export async function openSettingsForm(player) {
    const settings = getSettings();
    const form = new ModalFormData()
        .title("Unlocker Settings")
        .toggle("§eGlobal Counter§r", { defaultValue: settings.globalCounter })
        .toggle("§eDisable Unlock Sound§r", { defaultValue: settings.disableSound })
        .toggle("§eDisable Unlock Message§r", { defaultValue: settings.disableMessage });
    const response = await showSafe(form, player);
    if (response.canceled) {
        return;
    }
    const values = response.formValues;
    saveSettings(values[0] === true, values[1] === true, values[2] === true);
    player.sendMessage("§aMob Unlocker settings saved.§r");
}

/**
 * Opens a warning form and runs the reset callback only if confirmed.
 * @param {Player} player Player requesting the reset.
 * @param {() => void} onConfirm Callback that performs the reset.
 * @returns {Promise<void>} Resolves once the form is handled.
 */
export async function openResetForm(player, onConfirm) {
    const form = new MessageFormData()
        .title("§4Reset All Progress§r")
        .body(
            "§cThis will erase §lALL§r§c killed mobs for §levery player§r§c and the\n" +
                "global collection. This cannot be undone.\n\n§eAre you sure?§r"
        )
        .button1("§4Reset Everything§r")
        .button2("§8Cancel§r");
    const response = await showSafe(form, player);
    if (response.canceled || response.selection !== 0) {
        return;
    }
    onConfirm();
    player.sendMessage("§cAll Mob Unlocker progress has been reset.§r");
}

/**
 * Resolves the active killed set for a viewer based on the counter mode.
 * @param {Player} player Player viewing progress.
 * @returns {{killed: Set<string>, global: boolean}} Progress view data.
 */
function progressView(player) {
    const settings = getSettings();
    const killed = settings.globalCounter ? loadGlobalKilled() : loadPlayerKilled(player);
    return { killed, global: settings.globalCounter };
}

/**
 * Sends the viewer their current progress in chat.
 * @param {Player} player Player checking progress.
 * @returns {void}
 */
export function sendProgress(player) {
    const view = progressView(player);
    const have = view.killed.size;
    const total = totalMobs();
    const percent = ((have / total) * 100).toFixed(1);
    const label = view.global ? "§6Global progress (all players):§r " : "§6Your progress:§r ";
    player.sendMessage(label + "§a" + have + "§r / §e" + total + "§r (§b" + percent + "%%§r)");
}

/**
 * Selects the mob keys that match a filter mode.
 * @param {Set<string>} killed The viewer's killed keys.
 * @param {string} filter One of "all", "collected", or "missing".
 * @returns {string[]} The keys to display, in canonical order.
 */
function filterKeys(killed, filter) {
    const keys = allMobKeys();
    if (filter === "collected") {
        return keys.filter((key) => killed.has(key));
    }
    if (filter === "missing") {
        return keys.filter((key) => !killed.has(key));
    }
    return keys;
}

/**
 * Opens a form listing killed and missing mobs as body text.
 * @param {Player} player Player viewing the collection.
 * @param {string} filter One of "all", "collected", or "missing".
 * @returns {Promise<void>} Resolves once the form is handled.
 */
export async function openCollectionForm(player, filter) {
    const view = progressView(player);
    const keys = filterKeys(view.killed, filter);
    const scope = view.global ? "§6Global collection (all players)§r" : "§6Your collection§r";
    const label = filter === "all" ? "" : " §7[" + filter + "]§r";
    const rawtext = [{ text: scope + label + " - §a" + view.killed.size + "§r / §e" + totalMobs() + "§r\n\n" }];
    if (keys.length === 0) {
        rawtext.push({ text: "§7No mobs match this filter.§r" });
    }
    for (const key of keys) {
        rawtext.push({ text: view.killed.has(key) ? "§a[X] " : "§c[ ] §7" });
        rawtext.push({ translate: nameKey(key) });
        rawtext.push({ text: "§r\n" });
    }
    const form = new ActionFormData().title("Mob Collection").body({ rawtext }).button("§8Close§r");
    await showSafe(form, player);
}
