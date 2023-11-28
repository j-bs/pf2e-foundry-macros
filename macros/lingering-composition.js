/**
 * This macro helps extend the duration of an active [Courageous Anthem] buff effect based on the outcome
 * of a [Lingering Composition] performance skill check.
 */

if (!actor) {
  ui.notifications.warn(`You must select your token.`);
}
let spellEffects = actor.items.filter((i) => i.type === "effect");
let inspireCourageEffect = spellEffects.find(
  (e) => e.name === "Spell Effect: Courageous Anthem" && !e.expired
);

if (!inspireCourageEffect) {
  ui.notifications.warn(
    `You must have the 'Courageous Anthem' effect active and not expired.`
  );
}

// avoid heavy compendium load
const lingeringCompositionSpellImg =
  "systems/pf2e/icons/spells/lingering-composition.webp";

const dialogContent = `<div style="display: flex">
<img style="width:48px;height:48px" src="${lingeringCompositionSpellImg}" />
<p>Extend your active <em>${inspireCourageEffect.name}</em> to last based on the <em>Lingering Composition</em> performance check outcome.</p>
</div>`;

let duration = await Dialog.wait(
  {
    title: "Apply Lingering Composition",
    content: dialogContent,
    buttons: {
      reset: {
        label: `Reset (1)`,
        callback: () => 1,
      },
      success: {
        label: `Success (3)`,
        callback: () => 3,
      },
      crit_success: {
        label: `<span style="color:green">Critical Success (4)</span>`,
        callback: () => 4,
      },
    },
  },
  {
    width: 450,
  }
);

// set duration to chosen value
try {
  await inspireCourageEffect.update({ "system.duration.value": duration });
  ui.notifications.info("Successfully updated duration.");
} catch {
  ui.notifications.error("Failed to update duration.");
}
