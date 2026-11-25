import { G } from './state.js';
import { CORPS } from './data.js';

// Each entry returns a dialogue node: { text, choices: [{ t, next?, act? }] }.
// A choice with no `next` closes the conversation after running `act`.

const Q = () => G.quests;
const S = () => G.save;
const bye = (t = 'Farewell.') => ({ t });

function originLine(who) {
  const o = S().origin;
  const L = {
    maren: {
      farm: "A Lowmarch kid. You've heard their footsteps through the wall at night, then. Good. Fear keeps you sharp.",
      forge: 'Forge-born, are you? Then you know what a tether rig costs. Try not to wrap it around a chimney.',
      crown: "A Solspire accent, out here by the Outer Bulwark? Whatever you ran from, the Hollows won't care about your family name.",
    },
    voss: {
      farm: 'Lowmarch born. Then this is your home they nearly took.',
      forge: 'Your family probably forged half the rigs in my barracks.',
      crown: 'I knew a Solspire family that disowned a child for joining the Wardens. I hope that is not your story. If it is, you are welcome here.',
    },
  };
  return L[who][o] || '';
}

export const DIALOGUE = {
  // ------------------------------------------------------------ LOWMARCH
  maren() {
    const q = Q();
    if (!q.S.q_tether) {
      const main = () => ({
        text: `Another recruit with a fresh harness and clean boots. I'm Maren Holt. I've trained Wardens in this yard for nineteen years, and I've buried more of them than I'd like.\n\n${originLine('maren')}`,
        choices: [
          { t: 'Teach me the rig.', next: {
            text: 'Your rig fires two tethers. Q is the left line, E is the right, right mouse fires both. Hold to reel in, let go to release.\n\nSpace in the air burns aether gas and thrusts you where you look. Shift is a quick dash. Your gas is not infinite, so mind the gauge.\n\nFly through the five rings above the frames. Hook a crossbeam, swing, and let go at the bottom of the arc. That is where you are fastest.',
            choices: [{ t: "I'm on it.", act: () => q.start('q_tether') }],
          } },
          { t: 'What are the Hollows, exactly?', next: () => ({
            text: "Giants. Grey skin, empty eyes, and a grin that never changes. They don't eat, they don't sleep and they don't stop.\n\nThree hundred years ago they came out of the deep forest. The old books call it the Pale Tide. When it was over, all that was left of us was this city and the three walls around it.\n\nYou can't kill one by hacking at it. There's a glowing seam at the back of the neck, like an ember under the skin. Cut that, fast and deep, and it crumbles to ash. Anywhere else just makes it angry.",
            choices: [{ t: 'And the ankles?', next: { text: "Clever. Cut an ankle tendon and it drops to its knees for a few breaths. Lower nape, easier cut. The big ones need both.", choices: [{ t: 'Back to training.', next: main }] } }, { t: 'Back to training.', next: main }],
          }) },
          bye('Later.'),
        ],
      });
      return main();
    }
    const st = q.step('q_tether');
    if (st === 0) {
      if (!G.rings.active) G.rings.start('yard', 0, 'q_tether');
      return { text: "The rings won't fly through themselves. Hook a crossbeam on the frames and swing through. The glowing ring is the next one.", choices: [bye('Right.')] };
    }
    if (st === 1) return { text: "Now the dummies. See the orange seam on the back of the neck? Come in fast and left click as you pass. A slow cut won't get through.\n\nHit the ankles if you want to practise dropping one first.", choices: [bye('Got it.')] };
    if (st === 2) {
      const pick = (id) => ({
        t: `${CORPS[id].name}: "${CORPS[id].motto}"  (${CORPS[id].perk})`,
        next: () => {
          S().corps = id;
          G.player.refreshStats();
          G.player.setCape(CORPS[id].color);
          q.advance('q_tether');
          const line = {
            vanguard: "The Vanguard. You want to see what's out there. Most who join never come back to tell anyone. Make sure you do.",
            watch: "The Watch. Good. Somebody has to stand on that wall and mean it.",
            lancers: "The Lancers. Polished boots and palace duty. I hope you know they'll still send you where the Hollows are.",
          }[id];
          return {
            text: `${line}\n\nWelcome to the Wardens, ${S().name}.\n\n(A bell begins to clang from the south. Then another. Then all of them.)\n\nThat's the breach bell. Hollows are inside the Outer Bulwark. Go! South wall, east of the gate. Cut down every one you see!`,
            choices: [{ t: 'Draw blades.', act: () => q.start('q_breach') }],
          };
        },
      });
      return {
        text: "Not bad. Not bad at all. You fly like you've done this before.\n\nEvery Warden swears to a corps. It decides where you serve and what they hand you. Choose.",
        choices: [pick('vanguard'), pick('watch'), pick('lancers')],
      };
    }
    if (q.isActive('q_breach')) return { text: 'Why are you talking to me? The breach is south-east! Go!', choices: [bye('Going!')] };
    return {
      text: q.isDone('q_lantern') ? "They're telling stories about you now, recruit. I keep telling them you still land like a sack of turnips." : 'Still alive? Good. Keep it that way. Come back to the yard whenever you need practice; the dummies stand back up.',
      choices: [
        { t: 'Run the ring course again.', act: () => { G.rings.start('yard', 0, null); G.ui.toast('Practice course started'); } },
        bye(),
      ],
    };
  },

  ilsa() {
    const q = Q();
    const st = q.step('q_breach');
    if (st === 0) return { text: "Recruit! Don't stand there, they're still coming through! Cut them down, then find me.", choices: [bye('On it!')] };
    if (st === 1) return {
      text: "You're the recruit Maren sent? You cut down five of them on your first day. Remember that when the nightmares come.\n\nThis crack has been spreading for a month. I sent three requests to the Council in Solspire. Three. They told me repairs could wait until spring.\n\nMy engineers can seal it with timber and quick-stone, but they need time. Keep the Hollows off them. A little over a minute. Can you do that?",
      choices: [{ t: 'I will hold them.', act: () => q.advance('q_breach') }, { t: 'Why does the Council not care?', next: { text: "Because Hollows have never come past the Middle Bulwark. Solspire has never seen one. It's easy to be patient when it's someone else's wall.\n\nNow. Will you hold?", choices: [{ t: 'I will hold them.', act: () => q.advance('q_breach') }] } }],
    };
    if (st === 2) return { text: 'Keep them off the engineers! Not long now!', choices: [bye('Holding!')] };
    if (st === 3) return {
      text: "It holds. By the stones, it actually holds.\n\nYou did well today, Warden. Better than well.\n\nI want High Command to hear what happened here from someone who was in it, not from a Council report. Go north through the gate to Ironvale and find Commander Voss at Warden HQ. I'll have the gate opened.",
      choices: [{ t: "I'll go.", act: () => q.advance('q_breach') }],
    };
    if (q.isActive('q_greyhorn') && q.step('q_greyhorn') === 0) return { text: "Voss is sending you beyond the wall? Then you'll want the South Gate, west of the breach. The gatekeepers know your name. Bring back what you go out for, and bring yourself back too.", choices: [bye('I will.')] };
    return { text: 'The patch is holding. My people check it twice a day. If you are heading for the Wilds, the South Gate is open to you.', choices: [bye()] };
  },

  pell() {
    const q = Q();
    if (!q.S.s_satchel) return {
      text: "Ah, a Warden! Could you do an old man a kindness?\n\nI used to climb the bell tower to watch the sunset over the fields. Last week the bell-ringers chased me down and I left my satchel at the very top. My late wife's letters are in it.\n\nI can't climb like I used to. You, though... you fly.",
      choices: [{ t: "I'll fetch it.", act: () => q.start('s_satchel') }, bye('Not now, sorry.')],
    };
    if (q.step('s_satchel') === 0) return { text: "It's right at the top of the bell tower in the market square. Can't miss it, it's the tallest thing in Lowmarch.", choices: [bye()] };
    if (q.step('s_satchel') === 1) return {
      text: "That's it! That's... thank you. Truly.\n\nShe always said the Wardens were mad for flying around like swallows. She'd have liked you. Here, take this. It's not much.",
      choices: [{ t: 'Take care, Pell.', act: () => q.advance('s_satchel') }],
    };
    return { text: G.alarm ? 'Stay safe out there!' : 'I read one of her letters every night now. Thank you again, Warden.', choices: [bye()] };
  },

  bry() {
    return {
      text: "Bry Callow, quartermaster. If it cuts, burns gas or keeps you breathing, I sell it. Lowmarch prices, which is to say robbery, but honest robbery.",
      choices: [{ t: 'Show me your stock.', act: () => G.ui.openShop('bry') }, { t: 'Resupply me.', act: () => G.resupply() }, bye()],
    };
  },

  // ------------------------------------------------------------ IRONVALE
  voss() {
    const q = Q();
    if (q.step('q_word') === 1) return {
      text: `So. Lowmarch nearly fell, and the Council's runner called it "a manageable incident."\n\n${originLine('voss')}\n\nI'll tell you something we don't tell recruits. The Hollows are coming more often. Every year, a little more. Our scouts used to see one a week near the Outer Bulwark. Now it's one a day.`,
      choices: [{ t: 'Why?', next: {
        text: "That is the question. Eight years ago a Vanguard scout named Ysolde Marrin climbed Greyhorn Tower, out in the Wilds, to watch where they walk. She sent one signal, then nothing.\n\nShe kept a journal. If it's still in that tower, I want it.\n\nYou'll go out through Lowmarch's South Gate. A scout called Fenn is holding the Forward Cache. Start there.",
        choices: [{ t: "I'll find the journal.", act: () => q.advance('q_word') }],
      } }],
    };
    if (q.isActive('q_greyhorn')) {
      const st = q.step('q_greyhorn');
      if (st === 4) return {
        text: "You found it. And you killed a Thornback on the way back? Saints.\n\nLet me read it.\n\n(Voss turns the brittle pages slowly, then stops.)\n\n\"They do not wander. I have watched for forty days. Every one of them walks toward the city, the way water runs downhill. Toward the light above the palace.\"\n\nThe Lantern.",
        choices: [{ t: 'The Lantern? In Solspire?', next: {
          text: "This is above my rank, and it's above the Council's honesty. Take the journal to Archivist Oriel Sarn in Solspire. Oriel has never once lied to me, which makes Oriel rare in that city.\n\nThe Crown Gate will open for you. Go north.",
          choices: [{ t: 'To Solspire, then.', act: () => q.advance('q_greyhorn') }],
        } }],
      };
      return { text: "The journal, Warden. Greyhorn Tower, out in the Wilds. Lowmarch's South Gate will let you out. Fenn is at the Forward Cache.", choices: [bye('Understood.')] };
    }
    if (q.isActive('q_lantern')) return { text: 'Oriel will be at the Archive, on the west side of Solspire. Go.', choices: [bye()] };
    if (q.isDone('q_lantern')) return { text: `Whatever happens with the Lantern now, the Wildlands are still full of Hollows. Wren has bounties if you want them. And ${S().name}... thank you.`, choices: [bye()] };
    return { text: 'Commander Voss. Make it quick, Warden.', choices: [bye()] };
  },

  tamsin() {
    return {
      text: "Tamsin Quill, rig engineer. Bring me your harness and I'll make it sing. Stronger reel, longer throw, bigger tank. Just don't ask me to fix one after you've flown it through a chimney.",
      choices: [{ t: 'Upgrade my rig.', act: () => G.ui.openShop('tamsin') }, { t: 'Any advice?', next: { text: "Two tethers pull harder than one, but they fight each other if they're spread wide. For speed, hook ahead and to the side, then let go just as you swing past. And always keep enough gas to get home.", choices: [{ t: 'Upgrade my rig.', act: () => G.ui.openShop('tamsin') }, bye('Thanks.')] } }, bye()],
    };
  },

  oren() {
    return {
      text: "Oren Kade. Sunsteel blades. Every edge I forge is folded forty times. A Hollow's seam is like cutting wet clay wrapped in rope, so you want an edge that doesn't argue.",
      choices: [{ t: 'Show me blades.', act: () => G.ui.openShop('oren') }, bye()],
    };
  },

  clerk() {
    const q = Q();
    if (!q.isActive('q_greyhorn') && !q.isDone('q_greyhorn')) return { text: "Wren Ashby, bounty office. Wilds bounties are for Wardens cleared to go beyond the wall. Come back when High Command sends you out.", choices: [bye()] };
    if (q.step('s_bounty') === 1) return { text: "Five more Hollows culled. Ironvale thanks you, in coin.", choices: [{ t: 'Collect bounty.', act: () => q.advance('s_bounty') }] };
    if (q.isActive('s_bounty')) return { text: `Still ${5 - q.S.s_bounty.prog} to go. The Wilds are through Lowmarch's South Gate.`, choices: [bye()] };
    return { text: "Standing bounty: five Hollows culled in the Wilds, two hundred marks. You can take it as often as you like.", choices: [{ t: 'Take the bounty.', act: () => q.start('s_bounty') }, bye('Not now.')] };
  },

  pip() {
    const q = Q();
    if (q.step('s_courier') === 1) {
      const best = S().best.courier;
      return { text: `Not bad! ${best ? `Your best is ${best.toFixed(1)} seconds.` : ''} I'd have done it faster, obviously. Here, you've earned it.`, choices: [{ t: 'Pay up.', act: () => q.advance('s_courier') }] };
    }
    if (q.isActive('s_courier') && !G.rings.active) return { text: 'Ran out of time? Happens to everyone. Well, not me. Want another go?', choices: [{ t: 'Again!', act: () => G.rings.start('courier', 90, 's_courier') }, bye('Later.')] };
    if (q.isActive('s_courier')) return { text: 'Go go go! The clock is running!', choices: [bye()] };
    return {
      text: "You're a Warden? Bet you can't fly my courier route. Ten rings across Ironvale, ninety seconds. I do it in sixty. Probably.",
      choices: [{ t: "You're on.", act: () => q.start('s_courier') }, bye('Maybe later, kid.')],
    };
  },

  // ------------------------------------------------------------ WILDS
  fenn() {
    const q = Q();
    if (q.step('q_greyhorn') === 1) return {
      text: "Another Warden! I'd hug you, but I haven't washed in nine days.\n\nVoss sent you for Marrin's journal? Greyhorn Tower is south-west of here, the tall broken one. Climb to the top. If the journal survived anywhere, it's in the signal room.\n\nAnd listen. Something big nests in the eastern meadow. Huge, with bone plates on its back. Its nape is armored. If you meet it, cut both ankles and get it on its knees before you go for the neck.",
      choices: [{ t: 'Thanks, Fenn.', act: () => q.advance('q_greyhorn') }],
    };
    return {
      text: 'The giant trees are your friends out here. Hook the trunks, swing between them, never touch the ground if you can help it. The caches have gas if you run low.',
      choices: [{ t: 'Resupply me.', act: () => G.resupply() }, bye()],
    };
  },

  // ------------------------------------------------------------ SOLSPIRE
  oriel() {
    const q = Q();
    const st = q.step('q_lantern');
    if (st === 0) return {
      text: "A Warden, in my courtyard. Voss sent you? Then it must be bad.\n\n(Oriel reads the journal for a long time.)\n\nI was afraid of this. I have been reading the founders' ledgers for eleven years. The histories say the Lantern was lit to guide survivors home. The ledgers say something else.",
      choices: [{ t: 'What do they say?', next: {
        text: "They found the Lantern-stone in a cavern beneath the deep forest. It burned without fuel and gave off warmth like summer. They carried it here and built the palace around it.\n\nThe Pale Tide came out of that same forest the very next winter.\n\nThe Hollows are not hunting us, Warden. They are walking toward the Lantern, the way moths fly to a flame. We are simply standing in the way.",
        choices: [{ t: '...', next: {
          text: "(The ground shudders. Paving stones crack across the plaza. Somewhere, someone screams.)\n\nThe old cisterns under the Archive. They've been digging. Toward the light. Warden, go!",
          choices: [{ t: 'Draw blades!', act: () => q.advance('q_lantern') }],
        } }],
      } }],
    };
    if (st === 1) return { text: "They're in the plaza! Please, go!", choices: [bye()] };
    if (st === 2) {
      const end = (id, text) => ({ t: { douse: 'Put out the Lantern.', keep: 'Keep it lit. The Wardens will hold.', tell: 'Tell everyone the truth. Let the people decide.' }[id], next: () => { S().flags.ending = id; return { text, choices: [{ t: 'Close the journal.', act: () => { q.advance('q_lantern'); G.ui.chapterCard(id); } }] }; } });
      return {
        text: "Hollows. In Solspire. For three hundred years this city told itself that could never happen.\n\nYou know the truth now, as I do. And someone has to decide what to do with it. The Council won't. They'd sooner bury this journal than admit the founders called the Tide down on us.\n\nThe Wardens trust you. If you go to them with a choice, they will follow it. So, Warden. What do we do about the Lantern?",
        choices: [
          end('douse', "Then I'll show you the old valve in the Lantern tower. Without it the inner ring will freeze in winter. The forges will have to burn coal again.\n\nMaybe the Hollows will stop coming. Maybe they'll just stop coming here. We won't know for years. But the people who live by the walls will finally get to sleep."),
          end('keep', "The Lantern is warmth and light for a hundred thousand people. Perhaps you're right that we can't throw that away.\n\nBut the Hollows will keep coming, more every year. You're asking the Wardens to stand between them and the flame forever. I hope you know what that costs."),
          end('tell', "Then we print it. Every page of the ledgers, every line of Marrin's journal, posted in every square from Lowmarch to the palace steps.\n\nThe Council will be furious. There will be riots, probably. But it will be the people's choice, made with open eyes, for the first time in three hundred years."),
        ],
      };
    }
    if (q.isDone('q_lantern')) {
      const e = S().flags.ending;
      const t = { douse: 'The Lantern is dark now. It is colder here. Somehow I sleep better.', keep: 'The Lantern still burns. Every night I look at it and think of moths.', tell: 'The squares are full of arguments. It is the most alive this city has been in my lifetime.' }[e] || 'Thank you, Warden.';
      return { text: t, choices: [bye()] };
    }
    return { text: 'The Archive is closed to visitors. Unless you bring something worth reading.', choices: [bye()] };
  },

  veyra() {
    const q = Q();
    if (q.step('s_spire') === 1) {
      const best = S().best.spire;
      return { text: `Exquisite! You threaded my spires like a needle through silk.${best ? ` ${best.toFixed(1)} seconds is your finest time.` : ''} Your purse, Warden.`, choices: [{ t: 'Thank you, my lady.', act: () => q.advance('s_spire') }] };
    }
    if (q.isActive('s_spire') && !G.rings.active) return { text: 'Out of time? How tragic. Shall we try again?', choices: [{ t: 'Again.', act: () => G.rings.start('spire', 120, 's_spire') }, bye('Not now.')] };
    if (q.isActive('s_spire')) return { text: 'Fly, Warden! The court is watching!', choices: [bye()] };
    return {
      text: "Lady Veyra Castell. I sponsor the Spire Run: twelve rings strung between the highest towers in Solspire. Two minutes. Most Wardens end up decorating a rooftop garden.\n\nShall we see if you're different?",
      choices: [{ t: 'I accept.', act: () => q.start('s_spire') }, bye('Perhaps later.')],
    };
  },

  ambrose() {
    const f = S().flags;
    const have = S().found.length - (f.turned || 0);
    if (have > 0) {
      return {
        text: `Ambrose Lark, collector. Ah, you carry lost insignia! ${have} of them. Each belonged to a Warden who never came home. I return them to their families. I'll pay thirty-five marks apiece.`,
        choices: [{ t: `Hand over ${have} insignia.`, act: () => {
          f.turned = (f.turned || 0) + have;
          G.addMarks(have * 35); G.addXP(have * 15);
          if (f.turned >= 12 && !f.sunsteel) { f.sunsteel = true; G.player.refreshStats(); G.ui.questBanner('Reward', 'Ambrose gifts you a Founders\' Edge: +15% blade damage'); }
          G.saveGame();
        } }, bye()],
      };
    }
    return {
      text: `There are twenty-four insignia scattered across the rings, mostly on the highest rooftops, where their owners made a last stand. You have returned ${f.turned || 0}. Bring me twelve and I have something special for you.`,
      choices: [bye()],
    };
  },
};

export function folkDialogue(folk) {
  return { speaker: 'Resident', text: folk.lineText, choices: [bye()] };
}
