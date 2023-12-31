/**
 * This macro helps step through the [Learn A Spell] activity for a spellcaster.
 * For now, it assumes the character is a Wizard and rolls the skill check with Arcana.
 *
 * Pending improvements:
 *  - Automate DC adjustments for uncommon/rare.
 */

let actor = token.actor;

if (!actor || canvas.tokens.controlled.length !== 1) {
  ui.notifications.warn(`You must select your token.`);
  return;
}
if (!actor.isSpellcaster) {
  ui.notifications.warn(`You must be a spellcaster to <em>Learn a Spell</em>.`);
  return;
}

const dryRun = false; // don't deduct gold or add spell to known spells
const dialogTitle = `${actor.name}: Learn A Spell`;
const learnSpellData = [
  { level: 1, price: 2, dc: 15 },
  { level: 2, price: 6, dc: 18 },
  { level: 3, price: 16, dc: 20 },
  { level: 4, price: 36, dc: 23 },
  { level: 5, price: 70, dc: 26 },
  { level: 6, price: 140, dc: 28 },
  { level: 7, price: 300, dc: 31 },
  { level: 8, price: 650, dc: 34 },
  { level: 9, price: 1500, dc: 36 },
  { level: 10, price: 7000, dc: 41 },
];
const traditionSkills = {
  arcane: "arcana",
  divine: "religion",
  occult: "occultism",
  primal: "nature",
};

const spellLevelTemplate = `
<div class="form-group">
    <p>What spell are you attempting to learn?</p>
    <input id="target-spell" placeholder="Drag and drop a compendium spell here..." style="width: 100%;"/>
    <sub>Drag the spell from the Spell Compendium browser into this box.</sub>
</div>

<p>
    <table style="text-align: center">
        <caption>Costs and DCs for learning a spell</caption>
        <thead>
            <tr>
                <th>Spell Level</th>
                <th>Price (gp)</th>
                <th>Suggested DC</th>
            </tr>
        </thead>
        <tbody>
            {{#each learnSpellData}}
            <tr id="row-{{this.level}}">
                <td>{{this.level}}</td>
                <td>{{this.price}}</td>
                <td>{{this.dc}}</td>
            </tr>
            {{/each}}
        </tbody>
    </table>
</p>`;
const compiledSpellLevelTemplate = Handlebars.compile(spellLevelTemplate);
const spellLevelFormHtml = compiledSpellLevelTemplate({ learnSpellData });

const spellcasting = actor.spellcasting?.spellcastingFeatures[0];
const maxSpellLevel = spellcasting.highestLevel;
const spellTradition = spellcasting.system.tradition.value;
const hasMagicalShorthand = actor.items.filter(
  (i) => i.system.slug === "magical-shorthand"
)?.length;
const hasSpellbookProdigy = actor.items.filter(
  (i) => i.system.slug === "spellbook-prodigy"
)?.length;
let spell = {};

await Dialog.wait({
  title: dialogTitle,
  content: spellLevelFormHtml,
  buttons: {
    roll: {
      label: "Continue",
    },
  },
  render: (html) => {
    const dragSpellEl = html.find("#target-spell")[0];

    // configure onDrop event for target spell
    dragSpellEl.ondrop = async (event) => {
      event.preventDefault();
      const droppedSpell = JSON.parse(event.dataTransfer.getData("text/plain"));

      // get 'complete' spell object directly from compendium
      spell = await fromUuid(droppedSpell.uuid);

      if (!spell) {
        ui.notifications.error(
          `Something went wrong, could not load spell details`
        );
        return;
      }
      if (spell.system.level.value > maxSpellLevel) {
        ui.notifications.warn(
          `You cannot learn Level ${spell.system.level.value} spells yet.`
        );
        return;
      }
      if (spellcasting?.spells.getName(spell.name)) {
        ui.notifications.warn(`You already know ${spell.name}.`);
        return;
      }

      dragSpellEl.value = spell.name;

      // remove existing row highlight
      html.find(`tr`).css("font-weight", "").css("border", "");

      // add highlight for target spell level
      const spellLevelRow = html.find(`#row-${spell.system.level.value}`);
      spellLevelRow
        ?.css("font-weight", "bold")
        .css("border", "1px black solid");
    };
  },
});

console.log(
  `Player selected to learn ${spell.name}, a Level ${spell.system.level.value} spell.`
);

if (!spell) {
  ui.notifications.warn(`You must select a Spell Level to learn.`);
  return;
}

let targetLevel = spell.system.level.value;
let targetDC = learnSpellData.find((d) => d.level === targetLevel)?.dc;
let targetPrice = learnSpellData.find((d) => d.level === targetLevel)?.price;
const timeTaken = hasMagicalShorthand
  ? "10 minutes"
  : `${targetLevel} hour` + (targetLevel > 1 ? `s` : "");

const rollLearnTemplate =
  `<p>You are attempting to learn <b>${
    spell.name
  } (Level ${targetLevel})</b>.</p>
<p>You need to succeed on a <b>DC ${targetDC}</b> skill check.</p>
<p>Attempting to learn this spell will take <b>${timeTaken}</b>, regardless of the outcome.</p>
<p>The outcomes for this attempt are summarised below:</p>
<table style="text-align: center">
    <thead>
        <tr>
            <th>Outcome</th>
            <th>Spell Learned?</th>
            <th>Price (gp)</th>
        </tr>
    </thead>
    <tbody>
        <tr style="color:green">
            <td>Critical Success</td>
            <td>Yes</td>
            <td>${targetPrice / 2}</td>
        </tr>
        <tr>
            <td>Success</td>
            <td>Yes</td>
            <td>${targetPrice}</td>
        </tr>
        <tr>
            <td>Failure</td>
            <td>No *</td>
            <td>–</td>
        </tr>
        <tr style="color:red">
            <td>Critical Failure</td>
            <td>No *</td>
            <td>${targetPrice / 2}</td>
        </tr>
    </tbody>
</table>
<p><em>* On any failure you cannot try again until` +
  (hasMagicalShorthand ? ` one week passes or ` : "") +
  `you gain a level.` +
  (!hasMagicalShorthand
    ? ` You can reduce this to <b>one week</b> by having the <a class="content-link" draggable="true" data-uuid="Compendium.pf2e.feats-srd.Item.v7Bt6hjmzYnLFLeG" data-id="v7Bt6hjmzYnLFLeG" data-type="Item" data-pack="pf2e.feats-srd" data-tooltip="Feat/Feature Item"><i class="fa-solid fa-medal"></i>Magical Shorthand</a> skill feat.</em></p>`
    : "");

await Dialog.wait({
  title: dialogTitle,
  content: rollLearnTemplate,
  buttons: {
    roll: {
      icon: `<i class="fas fa-dice-d20"></i>`,
      label: "Roll Check",
    },
  },
});

options = [...actor.getRollOptions()];
notes = [
  {
    outcome: ["criticalSuccess"],
    selector: traditionSkills[spellTradition],
    text: `<b>Critical Success</b> You learn @UUID[${
      spell.uuid
    }] and expend only half of the materials worth <b>${
      targetPrice / 2
    }gp</b>.`,
  },
  {
    outcome: ["success"],
    selector: traditionSkills[spellTradition],
    text: `<b>Success</b> You learn @UUID[${spell.uuid}] and expend materials worth <b>${targetPrice}gp</b>.`,
  },
  {
    outcome: ["failure"],
    selector: traditionSkills[spellTradition],
    text: `<b>Failure</b> You do not learn @UUID[${spell.uuid}].`,
  },
  {
    outcome: ["criticalFailure"],
    selector: traditionSkills[spellTradition],
    text: `<b>Critical Failure</b> You do not learn @UUID[${
      spell.uuid
    }] and expend half of the materials worth <b>${targetPrice / 2}gp</b>.`,
  },
];
const dosAdjustments = [];
if (hasMagicalShorthand) {
  dosAdjustments.push({
    adjustments: {
      success: { label: "Magical Shorthand", amount: "criticalSuccess" },
    },
  });
}
if (hasSpellbookProdigy) {
  dosAdjustments.push({
    adjustments: {
      criticalFailure: { label: "Spellbook Prodigy", amount: "failure" },
    },
  });
}

const rollResult = await game.pf2e.Check.roll(
  new game.pf2e.CheckModifier(
    `learn-a-spell`,
    actor.skills[traditionSkills[spellTradition]]
  ),
  {
    type: ["skill-check"],
    identifier: "learn-a-spell",
    action: "learn-a-spell",
    actor: actor,
    token: token ?? null,
    title: `Skill Check: Learning a Spell (${spell.name} Lv ${targetLevel})`,
    options,
    notes,
    dc: { value: targetDC },
    dosAdjustments,
  }
);

const success =
  rollResult.options.degreeOfSuccess === 2 ||
  rollResult.options.degreeOfSuccess === 3;

// add spell to prepared spell list
if (!dryRun && success) {
  if (!spellcasting) {
    ui.notifications.error(
      `Could not find spellcasting entry to automatically add new spell.`
    );
  }

  try {
    await spellcasting.addSpell(spell);
    ui.notifications.info(`Added ${spell.name} to your spellcasting list!`);
  } catch {
    ui.notifications.error(
      `Something went wrong while adding new spell to spellcasting entry.`
    );
  }
}

// determine price based on outcome
let resultPrice =
  rollResult.options.degreeOfSuccess === 2
    ? targetPrice
    : rollResult.options.degreeOfSuccess === 0 ||
      rollResult.options.degreeOfSuccess === 3
    ? targetPrice / 2
    : 0;

if (resultPrice > 0) {
  let autoDeductGold = await Dialog.wait({
    title: dialogTitle,
    content: `<p>Deduct the <b>${resultPrice}gp</b> material cost from your inventory?</p>`,
    buttons: {
      yes: {
        label: "Yes",
        callback: () => true,
      },
      no: {
        label: "No",
        callback: () => false,
      },
    },
    default: "yes",
  });

  if (autoDeductGold && !dryRun) {
    if (!(await actor.inventory.removeCoins({ gp: resultPrice }))) {
      ui.notifications.error(
        `Failed to deduct expended gold from your inventory. Take a loan from a party member?`
      );
    } else {
      ui.notifications.info(
        `Spent <b>${resultPrice}gp</b> from inventory for <em>Learning a Spell</em>.`
      );
    }
  }

  const chatMessage = `Spent <b>${resultPrice}gp</b> worth of materials while learning @UUID[${spell.uuid}].`;
  ChatMessage.create({
    flavor: "Learn a Spell",
    content: chatMessage,
    speaker: ChatMessage.getSpeaker({ actor: actor }),
    type: CONST.CHAT_MESSAGE_TYPES.EMOTE,
  });
}
