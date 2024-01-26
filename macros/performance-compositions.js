/**
 * This macro helps apply the modifications of a [Lingering Composition] or
 * [Fortissimo Composition] performance skill check to an active effect from an
 * appropriate Spell Effect that is already on the invoking actor.
 */

const RESULTS = {
  failure: 1,
  success: 2,
  criticalSuccess: 3,
};
const RESULT_MODIFIERS = {
  "fortissimo-composition": {
    1: 1,
    2: 2,
    3: 3,
  },
  "lingering-composition": {
    1: 1,
    2: 3,
    3: 4,
  },
};

const getResultModifier = (slug, result) => RESULT_MODIFIERS[slug][result];

if (!actor) {
  ui.notifications.warn(`You must select your token.`);
}

const cantripCompositions = actor.itemTypes.spell.filter(
  (s) =>
    s.isFocusSpell &&
    s.isCantrip &&
    s.system.duration.value === "1 round" &&
    s.system.area.type === "emanation"
);

const spellEffect = actor.itemTypes.effect
  .filter((e) => !e.expired && e.parent === actor)
  .find((e) => cantripCompositions.some((s) => e.name.includes(s.name)));

if (!spellEffect) {
  ui.notifications.warn(
    `You must have a valid composition cantrip effect active and not expired.`
  );
  return;
}

const targetSpell = cantripCompositions.find(
  (spell) => spell.slug === spellEffect.rollOptionSlug
);

const fortissimoTargets = [
  "courageous-anthem",
  "rallying-anthem",
  "song-of-strength",
];
// TODO: support dirge of doom
const lingeringTargets = [
  ...fortissimoTargets,
  /*"dirge-of-doom",*/ "triple-time",
];

const compositionValidation = {
  "lingering-composition": {
    targets: (slug) => lingeringTargets.includes(slug),
  },
  "fortissimo-composition": {
    targets: (slug) => fortissimoTargets.includes(slug),
  },
};

const focusCompositions = actor.itemTypes.spell.filter(
  (s) => s.isFocusSpell && s.traits.has("spellshape")
);

const spellOptionHtml = (spell) => {
  return `<img style="width:48px;height:48px;border:none;" src="${spell.img}" /><span style="margin: 3px;">${spell.name}</span>`;
};

const dialogContent = `
<p>Which composition are you using:</p>
<div style="display: flex; margin-bottom: 5px">
${focusCompositions
  .map(
    (spell) => `<input type="radio" name="spell" id="${
      spell.system.slug
    }" value="${spell.system.slug}" style="display: none;" />
    <label for="${
      spell.system.slug
    }" style="cursor: pointer; display: flex; align-items: center; border: 2px solid transparent; border-radius: 5px;">
      ${spellOptionHtml(spell)}
    </label>`
  )
  .join("<hr />")}
</div>
<hr>
<p>Your choice will modify the <em><strong>${
  spellEffect.name
}</strong></em> effect on your character.</p>
<hr>
<p>What was the outcome of your <em>Performance</em> check:</p>`;

let spellChoiceSlug = null;

let performanceOutcome = await Dialog.wait(
  {
    title: "Apply Your Composition Performance",
    content: dialogContent,
    buttons: {
      reset: {
        label: `Default / Failure`,
        callback: () => RESULTS.failure,
      },
      success: {
        label: `Success`,
        callback: () => RESULTS.success,
      },
      crit_success: {
        label: `<span style="color:green">Critical Success</span>`,
        callback: () => RESULTS.criticalSuccess,
      },
    },
    render: (html) => {
      // Add an event listener to each radio button
      focusCompositions.forEach((spell) => {
        const radio = html.find(`input#${spell.system.slug}`)[0];
        const label = html.find(`label[for=${spell.system.slug}]`);

        radio.onchange = (_) => {
          html.find(`label`).css("border", "2px solid transparent");
          label?.css("border", "2px solid black");
          spellChoiceSlug = spell.system.slug;
          console.log(`Setting choice to: ${spellChoiceSlug}`);
        };
      });
    },
  },
  {
    width: 450,
  }
);

if (!spellChoiceSlug) {
  ui.notifications.error(`You must select a composition spell.`);
  return;
}

const spellChoice = focusCompositions.find(
  (spell) => spell.system.slug === spellChoiceSlug
);

// validate composition chocie against the target spell effect
if (
  !compositionValidation[spellChoiceSlug].targets(spellEffect.rollOptionSlug)
) {
  ui.notifications.warn(
    `${spellChoice.name} cannot be applied to ${spellEffect.name}.`
  );
  return;
}

const actorHasMacroAura = (actor, spell) =>
  actor.itemTypes.effect.find((e) => e.name === `Aura: ${spell.name}`);

const getAuraDuration = (choice) => {
  return choice === "lingering-composition"
    ? getResultModifier(choice, performanceOutcome)
    : 1;
};

const generateAuraEffect = (actor, spell, effect) => {
  return {
    flags: {
      core: { sourceId: effect.uuid },
      pf2e: { itemGrants: {}, rulesSelections: {} },
    },
    img: spell.img,
    name: `Aura: ${spell.name}`,
    system: {
      badge: null,
      context: { origin: actor },
      description: effect.system.description,
      duration: {
        expiry: "turn-start",
        sustained: false,
        unit: "rounds",
        value: getAuraDuration(spellChoiceSlug),
      },
      expired: false,
      fromSpell: false,
      level: { value: 1 },
      publication: effect.system.publication,
      rules: [
        {
          key: "Aura",
          radius: spell.system.area.value,
          mergeExisting: true,
          effects: [
            {
              uuid: effect.uuid,
              affects: "allies",
            },
          ],
          appearance: {
            border: { color: "user-color" },
          },
        },
      ],
      slug: `aura-${spell.slug}`,
      start: { value: 0, initiative: null },
      tokenIcon: { show: true },
      traits: { otherTags: [], value: [] },
    },
    type: "effect",
  };
};

// set duration to chosen value and apply aura effect
try {
  const spellEffectRules = spellEffect.system.rules;
  let primaryDataUpdate = {
    "system.rules": spellEffectRules,
  };

  switch (spellChoiceSlug) {
    case "lingering-composition":
      primaryDataUpdate = {
        ...primaryDataUpdate,
        "system.duration.value": getResultModifier(
          spellChoiceSlug,
          performanceOutcome
        ),
      };
      break;
    case "fortissimo-composition":
      spellEffectRules.map((rule) => {
        if (rule.key === "FlatModifier" && rule.type === "status") {
          rule.value = getResultModifier(spellChoiceSlug, performanceOutcome);
        }
      });
      break;
    default:
      break;
  }
  console.log(
    `[Performance Compositions] Updating primary spell effect:`,
    primaryDataUpdate
  );
  await spellEffect.update(primaryDataUpdate);

  // add an Aura to actor that will apply the effect
  if (!actorHasMacroAura(actor, targetSpell)) {
    const aura = generateAuraEffect(actor, targetSpell, spellEffect);
    console.log(`[Performance Compositions] Adding aura to actor`, aura);
    await actor.createEmbeddedDocuments("Item", [aura]);
  } else {
    console.debug(
      `[Performance Composition] Actor already has an aura from macro.`
    );
  }

  ui.notifications.info(
    `Successfully applied ${spellChoice.name} to ${spellEffect.name}.`
  );
} catch (ex) {
  console.log(
    `[Performance Compositions] Failed to modify and apply spell effects:`,
    ex
  );
  ui.notifications.error(
    `Failed to apply ${spellChoice.name} to ${spellEffect.name}.`
  );
}
