/**
 * This macro helps step through the [Learn A Spell] activity for a spellcaster.
 * For now, it assumes the character is a Wizard and rolls the skill check with Arcana.
 *
 * Improvements todo:
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

const dryRun = true; // don't deduct gold or add spell to known spells
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
      spell = await game.packs
        .get("pf2e.spells-srd")
        .getDocument(parseUuid(droppedSpell.uuid).documentId);

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
      if (spellcasting.spells.getName(spell.name)) {
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

const rollLearnTemplate = `
<p>You are attempting to learn <b>${spell.name} (Level ${targetLevel})</b>.</p>
<p>You need to succeed on a <b>DC ${targetDC}</b> skill check.</p>
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
            <td >Critical Success</td>
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
            <td>N/A</td>
        </tr>
        <tr style="color:red">
            <td>Critical Failure</td>
            <td>No *</td>
            <td>${targetPrice / 2}</td>
        </tr>
    </tbody>
</table>
<p><em>* On any failure you cannot try again until you gain a level.</em></p>`;

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

options = [];
notes = [
  {
    outcome: ["criticalSuccess"],
    selector: traditionSkills[spellTradition],
    text: `You learn the Spell and expend materials worth <b>${
      targetPrice / 2
    }gp</b>.`,
  },
  {
    outcome: ["success"],
    selector: traditionSkills[spellTradition],
    text: `You learn the Spell and expend materials worth <b>${targetPrice}gp</b>.`,
  },
  {
    outcome: ["failure"],
    selector: traditionSkills[spellTradition],
    text: `You do not learn the Spell.`,
  },
  {
    outcome: ["criticalFailure"],
    selector: traditionSkills[spellTradition],
    text: `You do not learn the Spell and expend materials worth <b>${
      targetPrice / 2
    }gp</b>.`,
  },
];

const rollResult = await game.pf2e.Check.roll(
  new game.pf2e.CheckModifier(
    `learn-a-spell`,
    actor.skills[traditionSkills[spellTradition]]
  ),
  {
    actor: actor,
    token: token ?? null,
    type: "skill-check",
    action: "learn-a-spell",
    title: `Skill Check: Learning a Spell (${spell.name} Lv ${targetLevel})`,
    options,
    notes,
    dc: { value: targetDC },
  }
);

const success =
  rollResult.options.degreeOfSuccess === 2 ||
  rollResult.options.degreeOfSuccess === 3;

// add spell to prepared spell list
if (!dryRun && success) {
  if (!spellcastingEntry) {
    ui.notifications.error(
      `Could not find spellcasting entry to automatically add new spell.`
    );
  }

  try {
    await spellcastingEntry.addSpell(spell);
    ui.notifications.info(`Added ${spell.name} to your spellcasting list!`);
  } catch {
    ui.notifications.error(
      `Something went wrong while adding new spell to spellcasting entry.`
    );
  }
}

// determine price based on outcome
let resultPrice = targetPrice;
if (
  rollResult.options.degreeOfSuccess === 0 ||
  rollResult.options.degreeOfSuccess === 3
) {
  resultPrice /= 2;
} else if (rollResult.options.degreeOfSuccess === 1) {
  resultPrice = 0;
}

if (resultPrice > 0) {
  // find Player's gold stash.
  const playerGold = actor.itemTypes.treasure.find(
    (i) => i.name === "Gold Pieces"
  );

  if (playerGold?.system?.quantity < resultPrice) {
    ui.notifications.warn(
      `You do not have enough gp to cover the price of Learning a Spell.`
    );
    return;
  }

  let autoDeductGold = await Dialog.wait({
    title: dialogTitle,
    content: `<p>Deduct the required <b>${resultPrice}gp</b> from your inventory (<em>${playerGold?.system?.quantity}gp</em>)?</p>`,
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
    try {
      const adjustedGold = duplicate(playerGold);
      adjustedGold.system.quantity -= resultPrice;
      await actor.updateEmbeddedDocuments("Item", [adjustedGold]);
    } catch {
      ui.notifications.error(`Failed to deduct expended gold from inventory.`);
    }

    ui.notifications.info(
      `Spent <b>${resultPrice}gp</b> from inventory for <em>Learning a Spell</em>.`
    );
    const chatMessage =
      `<em>I ` +
      (success ? `successfully learned` : `failed to learn`) +
      ` a new spell (<b>${spell.name} - Level ${targetLevel})</b> and spent <b>${resultPrice}gp</b> on materials.</em>`;
    ChatMessage.create({
      content: chatMessage,
      speaker: ChatMessage.getSpeaker({ actor: actor }),
    });
  }
}
