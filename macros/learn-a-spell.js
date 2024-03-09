/**
 * This macro helps step through the [Learn A Spell] activity for a spellcaster.
 *
 * Pending improvements:
 *  - Automate DC adjustments for uncommon/rare.
 */

let actor = token.actor;

if (!actor || canvas.tokens.controlled.length !== 1) {
  ui.notifications.warn(`You must select your token.`);
  return;
}
if (!actor.isSpellcaster || !actor.spellcasting?.spellcastingFeatures[0]) {
  ui.notifications.warn(
    `You must be a spellcaster and have a spellcasting entry to <em>Learn a Spell</em>.`
  );
  return;
}

const dryRun = false; // don't deduct gold or add spell to known spells
const dialogTitle = `${actor.name}: Learn A Spell`;
const learnSpellData = [
  { rank: 1, price: 2, dc: 15 },
  { rank: 2, price: 6, dc: 18 },
  { rank: 3, price: 16, dc: 20 },
  { rank: 4, price: 36, dc: 23 },
  { rank: 5, price: 70, dc: 26 },
  { rank: 6, price: 140, dc: 28 },
  { rank: 7, price: 300, dc: 31 },
  { rank: 8, price: 650, dc: 34 },
  { rank: 9, price: 1500, dc: 36 },
  { rank: 10, price: 7000, dc: 41 },
];
const traditionSkills = {
  arcane: "arcana",
  divine: "religion",
  occult: "occultism",
  primal: "nature",
};
const rarityDC = {
  common: 0,
  uncommon: 2,
  rare: 5,
  unique: 10,
};
function adjustDCByRarity(dc, spell) {
  const rarity = spell.rarity;
  if (!spell || !rarity) {
    return dc;
  }

  return dc + (rarityDC[rarity] ?? 0);
}
const spellcasting = actor.spellcasting.spellcastingFeatures[0];
const maxSpellRank = spellcasting.highestRank;
const tradition = spellcasting.tradition;

const spellRankTemplate = `
<div class="form-group" data-tooltip-class="pf2e">
    <p>What spell are you attempting to learn?</p>
    <div style="display: flex; align-items: center;">
      <input id="target-spell" placeholder="Drag and drop a compendium spell here..." style="flex: 1;"/>
      <a onclick="game.pf2e.compendiumBrowser.openSpellTab({tradition: '${tradition}'}, ${maxSpellRank}, 'spell')" data-tooltip="PF2E.OpenSpellBrowserTitle"><i class="fa-solid fa-search fa-fw"></i></a>
    </div>
    <sub>Drag a spell from the Spell Compendium browser into this box.</sub>
</div>

<p>
    <table style="text-align: center">
        <caption>Costs and DCs for learning a spell</caption>
        <thead>
            <tr>
                <th>Spell Rank</th>
                <th>Price (gp)</th>
                <th>Suggested DC</th>
            </tr>
        </thead>
        <tbody>
            {{#each learnSpellData}}
            <tr id="row-{{this.rank}}">
                <td>{{this.rank}}</td>
                <td>{{this.price}}</td>
                <td>{{this.dc}}</td>
            </tr>
            {{/each}}
        </tbody>
    </table>
</p>`;
const compiledSpellRankTemplate = Handlebars.compile(spellRankTemplate);
const spellRankFormHtml = compiledSpellRankTemplate({ learnSpellData });

const hasMagicalShorthand = !!actor.itemTypes.feat.find(
  (f) => f.system.slug === "magical-shorthand"
);
const hasSpellbookProdigy = !!actor.itemTypes.feat.find(
  (f) => f.system.slug === "spellbook-prodigy"
);
let spell = {};

await Dialog.wait({
  title: dialogTitle,
  content: spellRankFormHtml,
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
      if (spell.rank > maxSpellRank) {
        ui.notifications.warn(
          `You cannot learn Rank ${spell.rank} spells yet.`
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
      const spellRankRow = html.find(`#row-${spell.rank}`);
      spellRankRow?.css("font-weight", "bold").css("border", "1px black solid");
    };
  },
});

console.log(
  `Player selected to learn ${spell.name}, a Rank ${spell.rank} spell.`
);

if (!spell) {
  ui.notifications.warn(`You must select a Spell Rank to learn.`);
  return;
}

let targetRank = spell.rank;
let targetDC = adjustDCByRarity(learnSpellData.find((d) => d.rank === targetRank).dc, spell);
let targetPrice = learnSpellData.find((d) => d.rank === targetRank).price;
const timeTaken = hasMagicalShorthand
  ? "10 minutes"
  : `${targetRank} hour` + (targetRank > 1 ? `s` : "");

const rollLearnTemplate =
  `<p>You are attempting to learn <b>${spell.name} (Rank ${targetRank})</b>.</p>
<p>You need to succeed on a <b>DC ${targetDC}</b> skill check.</p>
<p>Attempting to learn this spell will take <b>${timeTaken}</b>, regardless of the outcome.</p>
<p>The outcomes for this attempt are summarised below:</p>
<table style="text-align: center" data-tooltip-class="pf2e">
    <thead>
        <tr>
            <th>Outcome</th>
            <th>Spell Learned?</th>
            <th>Price (gp)</th>
        </tr>
    </thead>
    <tbody>
        <tr style="color:green;">
            <td>Critical Success</td>
            <td>Yes</td>
            <td>${targetPrice / 2}</td>
        </tr>
        <tr ${hasMagicalShorthand ? "style=text-decoration:line-through;\" data-tooltip=\"Magical Shorthand\"" : ""}">
            <td>Success</td>
            <td>Yes</td>
            <td>${targetPrice}</td>
        </tr>
        <tr>
            <td>Failure</td>
            <td>No *</td>
            <td>–</td>
        </tr>
        <tr style="color:red;${hasSpellbookProdigy ? "text-decoration:line-through;\" data-tooltip=\"Spellbook Prodigy\"" : "\""}>
            <td>Critical Failure</td>
            <td>No *</td>
            <td>${targetPrice / 2}</td>
        </tr>
    </tbody>
</table>
<p><em>* On any failure you cannot try again until` +
  (hasMagicalShorthand ? ` one week passes or` : "") +
  ` you gain a level.` +
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

traits = ["concentrate", "exploration"];
options = [
  "action:learn-a-spell",
  "check:type:skill",
  `check:statistics:${traditionSkills[tradition]}`,
  ...traits,
  ...actor.getRollOptions(),
];
domains = [
  "all",
  "check",
  "skill-check",
  "learn-a-spell",
  "learn-a-spell-check",
];
notes = [
  {
    outcome: ["criticalSuccess"],
    selector: traditionSkills[tradition],
    text: `<b>Critical Success</b> You learn @UUID[${
      spell.uuid
    }] and expend only half of the materials worth <b>${
      targetPrice / 2
    }gp</b>.`,
  },
  {
    outcome: ["success"],
    selector: traditionSkills[tradition],
    text: `<b>Success</b> You learn @UUID[${spell.uuid}] and expend materials worth <b>${targetPrice}gp</b>.`,
  },
  {
    outcome: ["failure"],
    selector: traditionSkills[tradition],
    text: `<b>Failure</b> You do not learn @UUID[${spell.uuid}].`,
  },
  {
    outcome: ["criticalFailure"],
    selector: traditionSkills[tradition],
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
    actor.skills[traditionSkills[tradition]]
  ),
  {
    type: ["skill-check"],
    identifier: "learn-a-spell",
    action: "learn-a-spell",
    actor: actor,
    token: token ?? null,
    title: `Learn a Spell (${spell.name} Rank ${targetRank})`,
    traits,
    options,
    domains,
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
    console.log(spellcasting);
    console.log(spell);
    await spellcasting.addSpell(spell, {});
    ui.notifications.info(`Added ${spell.name} to your spellcasting list!`);
  } catch (ex) {
    console.log(ex);
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
  let spendGoldCost = await Dialog.wait({
    title: dialogTitle,
    content: `<p>You must deduct a material cost of <b>${resultPrice}gp</b> from your inventory.</p>`,
    buttons: {
      yes: {
        label: "Spend Gold",
        callback: () => true,
      },
    },
    default: "yes",
  });

  if (spendGoldCost && !dryRun) {
    if (!(await actor.inventory.removeCoins({ gp: resultPrice }))) {
      ui.notifications.error(
        `Failed to deduct expended gold from your inventory. Take a loan from a party member?`
      );
    } else {
      ui.notifications.info(
        `Spent <b>${resultPrice}gp</b> from inventory for <em>Learn a Spell</em>.`
      );
    }
  }

  const chatMessage = `Spent <b>${resultPrice}gp</b> on materials while learning @UUID[${spell.uuid}].`;
  ChatMessage.create({
    flavor: "Learn a Spell",
    content: chatMessage,
    speaker: ChatMessage.getSpeaker({ actor: actor }),
    type: CONST.CHAT_MESSAGE_TYPES.EMOTE,
  });
}
