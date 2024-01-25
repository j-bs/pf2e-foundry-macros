/**
 * This macro helps extend the duration of an active [Courageous Anthem] buff effect based on the outcome
 * of a [Lingering Composition] performance skill check.
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
console.log(cantripCompositions);

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
console.log(focusCompositions);

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
        console.log(radio);
        console.log(label);

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

// set duration to chosen value and apply aura effect
try {
  const spellEffectRules = spellEffect.system.rules;
  const pureSpellEffect = await game.packs
    .get("pf2e.spell-effects")
    .getName(spellEffect.name);

  // add an Aura RE to apply the effect
  const auraRE = {
    key: "Aura",
    radius: targetSpell.system.area.value,
    mergeExisting: false,
    effects: [
      {
        uuid: pureSpellEffect.uuid,
        affects: "allies",
      },
    ],
    appearance: {
      border: {
        color: "user-color",
      },
    },
  };
  if (!spellEffectRules.find((r) => r.key === "Aura")) {
    spellEffectRules.push(auraRE);
  }

  let dataUpdate = {
    "system.rules": spellEffectRules,
  };

  switch (spellChoiceSlug) {
    case "lingering-composition":
      dataUpdate = {
        ...dataUpdate,
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
  console.log(`applying updates:`);
  console.log(dataUpdate);
  await spellEffect.update(dataUpdate);
  // TODO: duplicate Player effect with .deepClone(..) and turn cloned effect into Aura that
  // provides the original (but modified) effect in aura radius.

  ui.notifications.info(
    `Successfully applied ${spellChoice.name} to ${spellEffect.name}.`
  );
} catch (ex) {
  console.log(ex);
  ui.notifications.error(
    `Failed to apply ${spellChoice.name} to ${spellEffect.name}.`
  );
}
