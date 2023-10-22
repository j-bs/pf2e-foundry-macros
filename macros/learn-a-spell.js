/**
 * This macro helps step through the [Learn A Spell] activity for a spellcaster.
 * It assumes the character is a Wizard and rolls the skill check with Arcana for now.
 */

if (!actor || canvas.tokens.controlled.length !== 1) {
  ui.notifications.warn(`You must select your token.`);
  return;
}
if (!actor.isSpellcaster) {
  ui.notifications.warn(`You must be a spellcaster to <em>Learn a Spell</em>.`);
  return;
}

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

const spellLevelTemplate = `
<p>
    <div class="form-group">
        <label for="spell-level">What level spell are you attempting to learn?</label>
        <input id="target-spell" />
        <select id="spell-level">
            {{#each learnSpellData}}
            <option value={{this.level}}>Level {{this.level}}</option>
            {{/each}}
        </select>
    </div>
</p>
<p>
    <table style="text-align: center">
        <caption>Costs and DCs for learning a spell</caption>
        <thead>
            <tr>
                <th>Spell Level</th>
                <th>Price (gp)</th>
                <th>Base DC</th>
            </tr>
        </thead>
        <tbody>
            {{#each learnSpellData}}
            <tr>
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

const spellLevel = await Dialog.wait({
  title: dialogTitle,
  content: spellLevelFormHtml,
  buttons: {
    roll: {
      label: "Continue",
      callback: (html) => {
        return +html.find(`select#spell-level`).val();
      },
    },
  },
  // render: (html) => {
  //   // console.log(html.find("#target-spell"));
  //   html.find("#target-spell")[0].addEventListender("drop", (event) => {
  //     console.log(event);
  //     event.preventDefault();
  //     const targetSpell = event.dataTransfer.getData("text/plain");
  //     console.log(targetSpell);
  //   });
  // },
});

console.log(`Player selected to learn a Level ${spellLevel} spell.`);

let selectedData = learnSpellData.find((d) => d.level === spellLevel);

if (!selectedData) {
  ui.notifications.warn(`You must select a Spell Level to learn.`);
}

const rollLearnTemplate = `
<p>You are attempting to learn a <b>Level ${selectedData.level}</b> spell.</p>
<p>You need to succeed on a <b>DC ${selectedData.dc}</b> skill check.</p>
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
            <td>${selectedData.price / 2}</td>
        </tr>
        <tr>
            <td>Success</td>
            <td>Yes</td>
            <td>${selectedData.price}</td>
        </tr>
        <tr>
            <td>Failure</td>
            <td>No *</td>
            <td>N/A</td>
        </tr>
        <tr style="color:red">
            <td>Critical Failure</td>
            <td>No *</td>
            <td>${selectedData.price / 2}</td>
        </tr>
    </tbody>
</table>
<p><em>* On a failure or critical failure you cannot try again until you gain a level.</em></p>`;

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

targetDC = selectedData.dc;
options = [`test`];
notes = [
  {
    outcome: ["criticalSuccess"],
    selector: "arcana",
    text: `<p>You learn the Spell and expend only half of the materials: <b>${
      selectedData.price / 2
    }gp</b>.</p>`,
  },
  {
    outcome: ["success"],
    selector: "arcana",
    text: `<p>You learn the Spell and expend all of the materials: <b>${selectedData.price}gp</b>.</p>`,
  },
  {
    outcome: ["failure"],
    selector: "arcana",
    text: `<p>You do not learn the Spell.</p>`,
  },
  {
    outcome: ["criticalFailure"],
    selector: "arcana",
    text: `<p>You do not learn the Spell and you must expend half of the materials: <b>${
      selectedData.price / 2
    }gp</b>.</p>`,
  },
];

const rollResult = await game.pf2e.Check.roll(
  new game.pf2e.CheckModifier(`learn-a-spell`, actor.skills.arcana),
  {
    actor: actor,
    token: token ?? null,
    type: "skill-check",
    action: "learn-a-spell",
    title: `Skill Check: Learning a Spell (Lv ${selectedData.level})`,
    options,
    notes,
    dc: { value: targetDC },
  }
);

// determine price based on outcome
let resultPrice = selectedData.price;
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

  if (playerGold?.system?.quantity >= resultPrice) {
    spendGoldResult = await Dialog.wait({
      title: dialogTitle,
      content: `<p>Deduct the required <b>${resultPrice}gp</b> from your inventory (<em>${playerGold?.system?.quantity}gp</em>)?</p>`,
      buttons: {
        yes: {
          label: "Yes",
          callback: () => 1,
        },
        no: {
          label: "No",
          callback: () => 0,
        },
      },
      default: "yes",
    });

    if (!!spendGoldResult) {
      try {
        const adjustedGold = duplicate(playerGold);
        adjustedGold.system.quantity -= resultPrice;
        await actor.updateEmbeddedDocuments("Item", [adjustedGold]);
      } catch {
        ui.notifications.error(
          `Failed to deduct expended gold from inventory.`
        );
      }

      ui.notifications.info(
        `Spent <b>${resultPrice}gp</b> from inventory for <em>Learning a Spell</em>.`
      );
      ChatMessage.create({
        content: `<em>I successfully learned a new Level <b>${spellLevel}</b> spell and spent <b>${resultPrice}gp</b> on materials.</em>`,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
      });
    }
  } else {
    ui.notifications.warn(
      `You do not have enough gp to cover the price of Learning a Spell.`
    );
  }
}
