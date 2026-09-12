> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# The Chronicle of Đại Việt

The Chronicle of Đại Việt

Throne of Đại Việt · gameplay design draft · second pass · 16 August 2026

Sử Ký

# The Chronicle

A story is not something you complete. It is a thing that has taken an interest in you — it watches what you do, decides what to say about it, and sometimes acts without asking. You never learn how long it is, and you cannot finish it early.

Scope · brainstorm, no code
Target mode · Dragon Ascent
Verdict · 8.7 / 10

[01The first draft was a quest system](#wrong)
[02What a story is instead](#model)
[03Everything a story can make you do](#reads)
[04Everything a story can do to you](#acts)
[05Forty moments, written out](#library)
[06One story, three runs](#reed)
[07Nine ways it stays unpredictable](#unpredictable)
[08What it looks like](#screens)
[09Where the stories come from](#history)
[10What other games did](#research)
[11Pacing and cost](#pacing)
[12Honest score](#score)
[viBản tiếng Việt](su-ky-dai-viet.md)

01

## The first draft was a quest system

It had a beat counter — *Hồi 3 · 5*. It had progress pips. It had a task banner reading *"6 seasons remaining"* with a fill bar. Those three things are completion UI, and completion UI does something specific to a player's head: it converts a story into a form to fill in. Once you can see you are three-fifths done, you are no longer inside anything. You are managing a task.

The deeper fault was structural, not cosmetic. That draft had the story **issue instructions and check whether you obeyed**. Build a timber yard. Hold 200 goods. Six seasons. That is a contract, and a contract has exactly two outcomes, and a player learns both within one run.

The distinction the whole rewrite turns on

**A quest has a completion state. A story does not.** You cannot fail a story. You can only change what it becomes — and it goes on becoming whether you engage with it or not.

So the model inverts. The story stops telling you what to do and starts **watching what you were going to do anyway**. Every action you take is read by something. There is no task list because there is no task — there is a person, or a place, that the story has taken an interest in, and everything that happens to it means something.

Practically, almost none of the engineering changes. The watcher that would have checked "did they build the yard" still exists; it now checks "what did they do about him" and there is no right answer. **The watcher stays. The checklist goes.**

|  | First draft — quest | This draft — story |
| --- | --- | --- |
| **Structure** | Fixed chain of beats, authored in order. | A pool of fragments. Each time the story speaks, it picks whichever one is most *salient* right now. |
| **Length** | Declared up front. Hồi 3 of 5. | Unknown, and unknowable. It ends when it ends. Two fragments or fifteen. |
| **The player's job** | Satisfy the objective. | Govern. The story reads the governing. |
| **Ignoring it** | Lapse. Story dies, small penalty. | Impossible. Ignoring is an input, and usually the most interesting one. |
| **Time** | "6 seasons remaining", with a bar. | "He will not ask a third time." Never a number. |
| **Who acts** | The player, always. The story waits. | Both. Sometimes it simply happens to you and there is no card. |
| **Replay** | Same chain, different option picked. | Different fragments fire entirely. The same story is unrecognisable between runs. |

02

## What a story is instead

Three parts, and none of them is a sequence.

- **A cast.** The subjects it has taken an interest in — a hero, a province, a rival. Bound when the story seeds, from whatever the world happens to contain.
- **A memory.** A flat bag of numbers recording what has happened. `timesPassedOver: 2`. `wonUnderHim: 1`. `heHasAsked: true`. Nothing more exotic than that.
- **A pool of fragments.** Twenty or so, each with conditions and a weight. Not ordered. Most will never fire in any given run.

When something happens in the world, the story wakes, scores every fragment in its pool against the current state and its own memory, and speaks whichever one is most fitting — with a random draw among the top few, so the same situation does not always produce the same line. Then it writes to memory and goes quiet again.

This is *salience-based* narrative rather than branching narrative — Emily Short's distinction, and the reason it matters here is exactly the complaint above: a branching tree is a map the player can learn, and a salience pool is a personality they can only get to know.

**Something happens***land taken · battle lost · hero left idle*

→

**The story wakes***only the ones that care*

→

**Score every fragment***against the world, and against its own memory*

→

**Draw at random***among the most fitting few*

→

**It speaks***whisper · card · blow*

→

**Write to memory***then sleep*

→

**Or it ends***a terminal fired · the Chronicle records it*

↺ and back to the start — the loop has no length, so nothing can tell you how far through it you are

Fig. 1 — no chain, no counter. A pool, a memory, and a rule for choosing

### The three volumes a story speaks in

Not everything a story says should stop the game. This is what lets a story stay continuously present without ever being a modal queue — and it is what makes it feel like something happening around you rather than a form arriving.

~70% of fragments
**Whisper**

One line in the header strip. No pause, no choice, no acknowledgement. *"A boy in Hoa Lư drills other children with reed banners."* You may not even register it as a story.

~25%
**Card**

Pauses, and asks. Two to four options, exact costs, no counter in the header. This is the only volume the player answers.

~5%
**Blow**

Pauses, and *tells*. No options. A hero is dead. A host is at the border. You do not get to choose — you get to live with it.

The Blow is the one that stops this feeling like a menu. A story that only ever asks is a story you are in control of, and control is the opposite of drama. Every saga should land at least one Blow, and the player should not see it coming.

03

## Everything a story can make you do

You asked for this twice: build a building in a specific land, capture a specific land, raise relations with a specific country, prepare a number of resources, put an army under a hero — and always something to do. Here is the whole vocabulary, and the three devices that make it urgent without ever issuing an order.

### The three devices

device one
**The mark**

A small ink glyph beside a hero, a province, a rival. Tapping it says one thing: *"This is spoken of."* You know something is watching. You do not know what it wants.

device two
**The opening**

An extra row that appears in a place you already visit — the province sheet, the hero card, the army detail. An offer, never an order. Free to ignore, and ignoring it is also an answer.

device three
**The whisper**

*"Trường Yên has paid no tax this season."* No instruction. But you will go and look at Trường Yên, and the game never told you to.

The guarantee behind "always something to do"

**At least one opening is live in your realm at any moment**, and it is placed on a subject you would visit anyway. That is the replacement for a quest log: the thing to do is where you already are, it is optional, and taking it feeds something you cannot see.

### Openings, concretely

| Where it appears | What it says | What it asks of you |
| --- | --- | --- |
| **Province sheet** | "Đinh Công's men would raise the dyke for nothing, if he were asked." | Build a specific building here |
| **Hero card** | "He has asked to be sent north. He has not said why." | Post him to a specific province |
| **Army detail** | "The men from Trường Yên will not serve under anyone else." | Give this hero this host |
| **Rival's sheet** | "Their envoy is still in the city. He has not been received." | Raise relations, or refuse to |
| **Treasury** | "The temple offers to hold your gold. The abbot is a careful man." | Move a sum, and trust someone |
| **Map, on a neighbour** | "Cổ Loa's granaries are full and its lord is eighty years old." | Take a specific province, or don't |
| **Court screen** | "The Marshal's seat has been empty since spring. People have noticed." | Seat someone — or keep not doing it |

### The full action vocabulary — fifty-one verbs the stories read

Every one of these is already something the game tracks. None of them is required. All of them are read, and none has a correct value — which is the entire difference between this and a checklist.

| System | What you can do | What a story makes of it |
| --- | --- | --- |
| **Building** | Build a *named* building in a marked province · build anything at all there · raise one to a level · let one be destroyed · demolish one | Investment worth defending — or worth taking from you. A dyke built for your own reasons in season 12 is what makes a fragment possible in season 60. |
| **Province** | Set a focus and hold it · let loyalty fall · raise loyalty · grow population past a figure · garrison it · leave it bare · hold it through a wave | A province on one focus for thirty seasons means everything else was neglected — and someone lives in "everything else". |
| **Territory** | Capture a *named* province · capture any province bordering a named rival · take one from a specific rival · **the method you use** — bribe, settle, claim, or storm · lose one · refuse to retake one · reach a province count | Taking Cổ Loa by bribe and taking it by storm are different inputs entirely. Bloodless conquest opens fragments that a sack closes forever. |
| **Heroes** | Give one a host · post one to govern · seat one at court · seat *someone else* in the role he wanted · pass one over twice · let fatigue climb · rest one · dismiss one · pair two in one host · let one die in battle · let renown pass the king's | The richest source in the game. Passing a man over is not a null action, it is a sentence with a subject and an object, and the second time it happens it means something the first did not. |
| **Army** | Field a host of a size · upgrade it — equip, reinforce, drill · march to a named province · sit idle · disband · win against odds · lose · destroy a named enemy host · let rations run out · intercept a marching host | A host that has sat in the capital for forty seasons is a story about a general with nothing to do, and that is a story with a well-known ending. |
| **Diplomacy** | Raise a *named* rival past an opinion figure · lower it deliberately · sign a treaty · break one · pay tribute · refuse tribute · gift · seat an ambassador · stay out of someone else's war | Read against the story's own character. Peace with a rival reads as wisdom in a scholar's story and as weakness in a soldier's — the *same action*, opposite meaning. |
| **Economy** | Hold a figure of food, gold, goods or people at a moment · spend heavily on one thing · run a deficit · stockpile past a threshold · empty the treasury · keep the granary above the famine line | Nine hundred gold sitting still is a treasury somebody has started counting. Prosperity is an input, and not always a safe one. |
| **Court & rules** | Pass a named edict · repeal one · take a specific Power card in the draft · refuse one · leave a seat empty · fill every seat | The laws you pass are a portrait. A story about a reformer gets more salient with every edict, and its collapse fragment only exists if you took them all. |
| **Nothing** | Ignore a mark · answer "not yet" twice · never receive an envoy · leave a whisper unanswered for twenty seasons | **The strongest input on the list**, and the one the first draft was structurally incapable of reading. In the worked example it is what produces the disaster. |

### Time is never a number

Costs stay exact — that discipline is established across the interface and must not break. But duration, deadline and length are never quantified anywhere in a story. *"Before the rains."* *"He will not ask a third time."* A number invites optimisation; a phrase invites worry.

04

## Everything a story can do to you

The other half of the brief: a great army thrown at you, a rebellion rising, a hero dead, resources lost, an army gained, heroes gained. Here is the full range — and the first rule is that **every fragment pays, not only the endings**. A whisper drifts something by a small amount. A card pays at the moment you choose. A blow lands with full force. Nothing in a pool is inert.

### The catalogue — sixty-eight outcomes across eight layers

| Layer | Good | Bad |
| --- | --- | --- |
| **War** | A host arrives already raised at a named province · veterans folded into an existing host · a free elite tier on every host · a prepared trap fires and deletes most of an invading army · an enemy host disperses before it arrives · an enemy general is killed and his host loses its bonus · an ally's host serves under you for a season · the next wave splits and arrives in halves | **A great host marches on a named province immediately, outside the wave cycle** · two rivals invade in the same season · a host defects mid-march, taking its general · a host mutinies and will not move · morale floor for the realm · rations spoil on the road · your best host arrives at a battle a season late |
| **Rebellion** | A permanent loyalty floor across a region · a province that will never revolt again · a rebel band comes over to you with its men | **A province revolts and turns hostile** · **three provinces secede and become a new kingdom under a hero you knew**, keeping your buildings · a peasant rising spawns a host out of your own population · the capital riots with no enemy in sight · a noble house stops paying tax and nothing you do restarts it · the army refuses to march for several seasons |
| **Heroes** | **A hero joins** — from the deck, or a story-only figure with a trait no draft can produce · a permanent stat gain · two heroes bond and gain a bonus while serving together · a hero who left returns · a captured hero is rescued and his loyalty locks at maximum | **A hero dies** — in battle, of illness, executed, or in another hero's place · a hero defects and appears later commanding the invasion · a hero leaves with no message · a hero is captured and ransomed · two heroes feud and cannot serve together again · a hero refuses your next order |
| **Land** | **A province joins bloodlessly at full population**, buildings intact · a free building · a permanent terrain work — a dyke, a canal, stakes in a riverbed — that changes what the land is · a claim slot gained · population surge | A province is razed · plague takes a third of its people · its focus is locked by the story and you cannot change it · a claim slot lost · its best building burns |
| **Resources** | A windfall · a standing per-season gain · a rival's tribute redirected to you · a trade route that pays while it lasts | **The treasury is seized** · a debt that services itself every season · the granary spoils · tribute imposed on you and collected automatically · a per-season drain with no visible cause until a later fragment names it |
| **Diplomacy** | An alliance · a rival humbled and paying you · standing with every third party who was watching · a rival collapses into civil war | **A coalition forms against you** · trust destroyed with everyone at once · a treaty you cannot break for the rest of the run · a new rival appears where there was none |
| **Rules** | **A Power card enters your draft deck permanently** · a doctrine granted outright · an edict unlocked an era early · an extra claim slot · the wave clock slows | **A doctrine is taken away** · the draft loses a rarity tier · an edict repealed against your will · the wave clock quickens · a card you were counting on is removed from the deck |
| **Legacy** | A permanent meta-shop entry · a story-only hero added to future runs' deck · a title that carries a modifier into the next run | A Chronicle entry recording the failure, which later stories — including in later runs — are allowed to read and speak about |

### The fourteen that carry the feature

If the writing budget runs out, these are the ones that must exist, because they are the ones a player describes to somebody else afterwards.

##### Seven that should frighten people

1. Three of your provinces secede and become a hostile kingdom — keeping every building you paid for.
2. A hero you have used for forty seasons dies, permanently, with no roll to prevent it.
3. A great host launches at a named province immediately, outside the wave cycle.
4. A doctrine you built the entire run around is taken back.
5. Your capital riots. There is no enemy. It is your own people.
6. A host defects mid-march, with its general and your best cavalry.
7. A hero who quietly left in an earlier run is commanding the army now marching on you.

##### Seven that should make people cheer

1. A province joins with no battle, full population, buildings intact.
2. A hero arrives who cannot be drafted, with a trait that exists nowhere else.
3. A Power card enters your deck permanently, for the rest of the run.
4. A trap you prepared fifty seasons ago erases two-thirds of an invasion.
5. A rival collapses into civil war and their provinces come loose.
6. Two heroes bond, and every battle they fight together is better.
7. The province a hero died holding gains a loyalty floor that never falls.

### How a story acts on its own

The story is not a narrator waiting to be triggered. It is an agent with an appetite, and it moves first — raising hosts, killing heroes, flipping provinces, taking doctrines away, making two of your heroes stop speaking.

The rule that keeps this fair

A story may never act without having first spoken. **Every blow is preceded by at least two whispers**, and those whispers are in the Chronicle where they can be read back. The player who was paying attention gets to say *"I saw that."* The player who was not gets ambushed and deserves it. That is the whole difference between surprise and unfairness.

### Temperature

Each story carries one hidden number — how close it is to acting. Feeding its appetites raises it; time and countervailing actions lower it. It is never shown. The only tell is **frequency**: a story heating up whispers more often, about smaller things. When a thread that was quiet for twenty seasons starts speaking twice a cycle, something is coming — and the player learns to read that pressure the way you read weather.

### Attribution — the cheapest drama in the design

The simulation already produces famine, desertion, loyalty collapse, invasion. A story is allowed to **claim** those events. Famine arrives on its own schedule; the story running about a reforming chancellor says *"the granaries were sold last winter."* Nothing was faked, nothing new was simulated — and the world stops feeling like a spreadsheet with weather.

### Stories interfere with each other

- **They share subjects.** Two stories binding the same hero read each other's memory. He can be a martyr in one and a traitor in the other, and the game will not resolve it for you.
- **They collide.** When two want to speak about one subject in the same season they merge into a fragment authored by neither, and you save one at the other's cost.
- **They inherit.** A finished story leaves its memory in the Chronicle, and a story seeded later reads it — including in the next run. *"They say you left Đỗ Khắc to die at Vân Đồn."* Spoken by someone who was not there, in a run where it happened.

05

## Forty moments, written out

The two sections above are vocabulary. This one is content — forty real moments, each with the line the player actually reads, the thing it wants of them, and both branches written concretely rather than as a category. Read six of these and the feature is either obviously worth building or obviously not.

→ is what it asks of you. ✓ and ✗ are what actually happens.

### It wants you to build something

The Dyke at Sông Đáy*opening*

"Đinh Công's men would raise the dyke for nothing, if he were asked. He is not asking."

~~→~~Build the dyke in Sông Đáy. One build slot, no gold.

~~✓~~Forty seasons later the river takes three provinces and not this one. The province gains *Held the Flood* — loyalty never falls below 70 again.

~~✗~~The flood comes. 1,400 people, two buildings, and a whisper: *"The old man had said so."*

The Foundry Nobody Asked For*card*

"A Cham smith has walked here from Vijaya. He says he will teach, but not for money, and not to anyone you choose — to whoever he chooses."

~~→~~Build a foundry, and give him a province you were not planning to give away.

~~✓~~Every host you raise from that province is one elite tier higher, for the rest of the run.

~~✗~~He goes to Chiêm Thành instead. In thirty seasons their hosts are one tier higher than they were.

The Watchtower on a Hill*whisper → card*

"A hunter says he can see four days into Chiêm country from the ridge above Vân Đồn, on a clear morning."

~~→~~Build a watchtower there. 90 goods, a build slot, and it produces nothing.

~~✓~~Every enemy host that crosses that border is visible three seasons before it arrives — for the whole run.

~~✗~~The invasion that ends the run arrives without warning, and the Chronicle notes that a hunter once mentioned a ridge.

The Temple Your Mother Wanted*card*

"The Dowager has asked for a temple at Hoa Lư. It has no military value. She has asked four times."

~~→~~Build a temple. It gives nothing measurable.

~~✓~~Nothing, for sixty seasons. Then, when your capital is besieged, the province raises 900 men unasked and the siege breaks.

~~✗~~Nothing at all, ever. This is a real branch and it must stay a real branch.

### It wants a specific province

Cổ Loa Before the Old Lord Dies*opening*

"Cổ Loa's granaries are full and its lord is eighty years old. His sons are not speaking to each other."

~~→~~Take Cổ Loa. **How you take it is the input.**

~~✓~~By bribe or claim: it joins whole. Full population, three buildings, and its garrison folds into your army as veterans.

~~✗~~By storm: you get the walls and a permanent loyalty ceiling of 45. Its people will not forget, and two later fragments only exist because of it.

The Province He Was Born In*card*

"Đỗ Khắc has never asked you for anything. He is asking now. His village is across the border and it is being taxed to death."

~~→~~Take one named province that is strategically worthless.

~~✓~~His loyalty locks at maximum permanently. He cannot be turned, bribed, or made to defect by any later story.

~~✗~~He says nothing about it again. Eleven fragments in his pool change their weight. You will not be told which.

Let Vân Đồn Fall*card*

"If they take the river mouth they will bring their fleet up on the flood tide. The stakes are already in the water."

~~→~~**Lose a province on purpose**, and do not retake it. Loyalty falls 10 everywhere while you hold your nerve.

~~✓~~The fleet comes in on the tide. 68% of it is on the mud when the water drops. You fight a third of an army with all of yours.

~~✗~~You retake it in the second season, as everyone begged you to. The stakes rot. Nobody ever knows what almost happened.

The Salt Road*whisper*

"Salt has not come up the coast road since spring. Nobody has said why, and nobody has gone to look."

~~→~~Take, or garrison, any province on that road.

~~✓~~Bandits, not an army. You gain 200 gold and a hero from the deck who was their prisoner.

~~✗~~It was an army. It has been building a camp for nine seasons and it is now 1,800 strong and forty miles inside your border.

### It wants a hero, or an army

Four Hundred Men*card*

"He is waiting in the outer hall, which he was not asked to do. He says he is not asking for a large command."

~~→~~Give a named hero a host.

~~✓~~He never loses a man he does not have to. Two of your provinces stop needing garrisons at all.

~~✗~~Refuse twice and three provinces raise *his* banner. No battle — the garrisons open the gates. He keeps your walls and your granaries.

The Men From Trường Yên*opening*

"The men from Trường Yên will not serve under anyone else. They have not said this out loud."

~~→~~Put one specific hero in command of one specific host.

~~✓~~That host gains +14% and never routs while he lives.

~~✗~~Give it to someone else and 400 of them are simply gone by the next muster. No event fires. The number is just lower.

Who Wears Your Armour*blow → card*

"They have the ford and they know which banner is yours. Someone else could wear it out of the camp tonight."

~~→~~**Choose which of your heroes dies.** Naming him is the whole card.

~~✓~~You escape. Every surviving hero gains +15 loyalty permanently, and the province he died in gains a loyalty floor that never falls.

~~✗~~Refuse to choose and you lose the host, two provinces, and him anyway.

She Will Not Take the Post*card*

"I want to ride the strong winds and tread the fierce waves. I do not want a granary in Thanh Hóa."

~~→~~Give her a field command instead of the sensible posting, or lose her.

~~✓~~She is the best commander in the run and she knows it. Her martial climbs +2 every battle she wins, with no cap.

~~✗~~She leaves. In forty seasons she is leading the coalition, and she has not gotten worse.

Two Who Fought at Chi Lăng*whisper*

"They have started eating together. Neither of them eats with anyone else."

~~→~~Keep two specific heroes in the same host for a while.

~~✓~~Bonded. +12% each while serving together, forever, and neither will ever betray you while the other lives.

~~✗~~Split them and one of them asks for leave. He does not come back.

The Boy With the Orange*card*

"He is too young for the war council. He has been standing outside it for an hour. There is juice running down his wrist."

~~→~~Admit him, or send him away.

~~✓~~Admitted: he brings 600 men of his own household within four seasons.

~~✗~~Sent away: **he raises his banner anyway.** You do not control the host, you cannot recall it, and it attacks the strongest enemy on the map. He usually dies.

### It wants something from your neighbours

The Envoy Nobody Received*opening*

"Their envoy is still in the city. He has not been received. He has stopped asking."

~~→~~Raise a named rival above 60 opinion.

~~✓~~Their fleet stays home when the coalition sails. You fight two enemies instead of three.

~~✗~~He goes home and tells them exactly how many hosts you have and where.

The Marriage*card*

"They offer a bond, and send a son to your court. He is charming, he is competent, and his loyalty reads as *unknown*."

~~→~~Accept, and post him somewhere. He is genuinely good at the job.

~~✓~~Catch him and the plot collapses, their opinion with it — and you keep him, broken and useful.

~~✗~~**Goose feathers on the road**, at intervals of one lý. The defence bonus you have enjoyed for ten minutes expires the season they arrive.

Too Friendly by Half*blow*

"You have made peace with everyone who borders you. A fourth king, who does not, has drawn the obvious conclusion."

~~→~~Nothing. This one fires *because* you did the sensible thing.

~~✓~~—

~~✗~~A tribute demand from a country you have never met, backed by a host already at sea. Success punished, on purpose.

Six Seasons of Silence*card*

"Pay them nothing. Not this season, not next. Let them wonder whether we have stopped being afraid."

~~→~~**Refuse every tribute demand for six seasons**, whoever asks.

~~✓~~Every rival's demand frequency halves for the rest of the run. You bought it with nerve, not gold.

~~✗~~Break once and it resets, and the one you paid tells the others what you are worth.

### It wants resources, or your patience

The Monk Who Counts*card*

"The temple offers to hold your gold. The abbot is a careful man and has asked, twice, how much there is."

~~→~~Have 400 gold in one place when he returns.

~~✓~~It is safe there. When the capital is sacked, your treasury survives — the one time that has ever happened.

~~✗~~He was counting for someone else. The raid that comes knows the number and comes for exactly that.

Full Granaries in a Bad Year*opening*

"Rice is dear this year. Yours is cheap because you have so much of it."

~~→~~Hold 500 food through the winter instead of spending it.

~~✓~~Two neighbouring provinces defect *to you*, with their people, because you fed them.

~~✗~~Spend it and the famine that arrives is the one the Chronicle blames on you by name.

Nine Hundred Gold, Sitting Still*whisper*

"Somebody in the treasury has begun writing the figure down each month."

~~→~~Spend it, or move it, or accept what is coming.

~~✓~~Spent below 300 in time: nothing happens, and you never learn what would have.

~~✗~~**The Chancellor is gone in the night. So is the money.** All of it.

Keep the Army Fed*opening*

"They have not been paid in four seasons. They have not said anything, which is worse."

~~→~~Clear the arrears — a real, unglamorous gold cost.

~~✓~~Nothing. The best outcome in the game is often nothing.

~~✗~~Your strongest host **will not march**. Not routed, not lost — it simply refuses, for six seasons, and the enemy knows.

### It asks nothing at all — the blows

Three Banners*blow*

"Three of your provinces have declared for him. There was no battle. The garrisons opened the gates."

~~→~~Nothing. Two whispers came first and they are in the Chronicle.

~~✓~~—

~~✗~~A **new hostile kingdom**, carved out of your realm, keeping your walls, your granaries and your roads. It plays by rival rules from now on.

The Ford at Vân Đồn*blow*

"Đỗ Khắc held the ford. He held it for a day and a half. He is not coming back."

~~→~~Nothing. No roll, no save, no ransom.

~~✓~~Every hero who served with him gains +8 loyalty, and the ford is named after him on the map for the rest of the run.

~~✗~~Forty seasons of a Marshal, gone. His seat is empty and the court knows why.

The Assembly Voted*blow*

"The doctrine you built this run around has been struck from the rules. You were not consulted. You are the king; you were still not consulted."

~~→~~Nothing.

~~✓~~—

~~✗~~A **rule you were relying on is removed mid-run**. This is the outcome that makes the story system genuinely dangerous rather than merely dramatic.

A Commander You Know*blow*

"The host marching on Vân Đồn is under a commander you know. He is better than he was."

~~→~~Nothing. He left quietly, thirty-eight seasons ago, or in a previous run entirely.

~~✓~~—

~~✗~~He has your old drill, your old formations, and knows which of your provinces is thinnest. He is not a generic invader and the game will say his name.

The Capital, Not the Border*blow*

"There is no enemy. It is a rice riot. They are at the palace gate and they are your own people."

~~→~~Nothing. The next card asks how you answer it, and both answers are bad.

~~✓~~—

~~✗~~Stability crashes with no foreign cause and no army to fight. Prosperity plus neglected loyalty is what fires it.

Mã Viện Has Been Given an Army*whisper*

"Mã Viện has been given an army."

~~→~~Nothing. No date. No number. No province named.

~~✓~~—

~~✗~~Somewhere between eight and forty seasons from now, depending on things you cannot see. The best line in the whole design and it costs six words.

### It gives, and the giving is the trap

The Sword From the Lake*card*

"A fisherman brings up a blade in his net. The hilt is found later, in a banyan tree, and it fits."

~~→~~Take it. Nothing says you must ever give it back.

~~✓~~+30% army power, immediately, for as long as you hold it. It is not subtle and it is not a lie.

~~✗~~Keeping it past the war makes four fragments more salient every season. None of them are good. Nobody ever tells you this.

Sixty-Five Citadels*card*

"The whole province has risen against them. They are asking who will lead it. They are looking at you."

~~→~~Accept the uprising.

~~✓~~**Six provinces at once**, free, with their people and their walls. The largest single gain available in the game.

~~✗~~And a whisper, one season later, with a man's name in it. See above.

The Cham Engineer*opening*

"A prisoner from the last war has been drawing something in the dirt of his cell for a month."

~~→~~Release him, and give him materials.

~~✓~~A Power card enters your draft deck permanently — a real card, in the real deck, for the rest of the run.

~~✗~~Leave him and in twenty seasons the siege engines outside your walls are of an unfamiliar design.

The King With No Heir*whisper → blow*

"Their king is dead and his brothers are not speaking. There are three armies and no throne."

~~→~~Nothing, or everything. There is a card, and it is a gamble.

~~✓~~Their realm splits three ways. Two of the three would rather be your vassal than the other's subject.

~~✗~~Intervene and lose, and all three make peace with each other specifically to deal with you.

### The two that only exist because of the model

The Elders Answer*card, unanswerable*

"The hall is full of old men from every province. You have put the question to them: fight, or make terms."

~~→~~You present the options. **You do not choose.** They do — weighted by every province's loyalty and your court's stability.

~~✓~~They shout to fight. +25% army power and a morale floor for twelve seasons, realm-wide.

~~✗~~They counsel terms, and you must take them. Ten quiet minutes of neglected governance, cashed out in one sentence in front of everyone.

The Granaries Were Sold*attribution*

"The famine is not weather. The granaries were sold last winter, and the Chancellor signed for them."

~~→~~Nothing. **The famine was going to happen anyway** — the simulation produced it on its own schedule.

~~✓~~The story simply *claims* it, and now it has an author, a signature and a name you can act against.

~~✗~~Costs one hook and eleven words. The highest ratio of felt drama to work in the entire document.

What this list is meant to prove

Every action in your brief is here as a concrete moment rather than a category — build a specific building, take a specific province, raise a specific country, hold a number of resources, give an army to a hero — and so is every outcome: a great host launched, a rebellion, a hero dead, the treasury gone, an army gained, heroes gained. Six of these are already written well enough to go into the game as they stand.

06

## One story, three runs

This is the proof, and it is the only section that really matters. Below is a single story — one fragment pool, one template — playing out in three different runs. Not three branches of a tree. Three different *shapes*, of different lengths, with fragments that appear in one and never exist in the others.

The template · Ngọn Cờ Lau — The Reed Banner

**Seeds on:** any hero on your roster with renown under 25. No card fires. Nothing is announced. He is simply marked, and the story begins watching.

**Its appetites:** being given command · being passed over · the realm losing ground · his own renown outrunning the king's. It has twenty-two fragments and six terminals. In the runs below it fires between four and nine of them.

Run A · you used him

The Unifier

whisper · season 12"A boy in Hoa Lư drills other children with reed banners. They obey him."

you give him a host at season 19

whisper · season 26"He has not lost a man he did not have to."

card · season 41His officers ask that he be given the northern provinces entire — not to govern, to *hold*. Your Chancellor points out that no such office exists.  
Invent it · Refuse · Give him one province and see

whisper · season 58"Three villages in Trường Yên have raised his banner without being asked."

terminal · season 71Đại Cồ ViệtThe provinces he holds stop needing garrisons. permanent loyalty floor a Power card enters your deck he carries to the next run

Run B · you ignored him

The Warlord

whisper · season 14"A boy in Hoa Lư drills other children with reed banners. They obey him."

card · season 33He asks for a command. Not a large one.  
Give him one · Not yet · He is a herdsman's son

you seat another hero as Marshal at season 44

whisper · season 45"He did not attend the investiture."

whisper · season 52"Men who should be in your muster rolls are drilling somewhere else."

whisper · season 55"Trường Yên has paid no tax this season. No one will say why."

blow · season 57Three of your provinces have declared for him. There was no battle. The garrisons opened the gates.

terminalThe Twelve Warlordsa new hostile kingdom, carved from your own land he keeps his stats and your buildings

Run C · you tried, then took it back

The Man Who Left

whisper · season 9"A boy in Hoa Lư drills other children with reed banners. They obey him."

you give him a host at season 15 — he loses at Chi Lăng

card · season 22He lost four hundred men and came back alone to say so. The court wants the host given to someone else.  
Take it back · Leave it with him · Ask him what happened

whisper · season 31"He has asked for leave to visit his mother's grave."

terminal · season 34He does not come backNo penalty. No message. He is off the roster. the Chronicle records only that he left

— thirty-eight seasons of nothing —

blow · season 72The host marching on Vân Đồn is under a commander you know. He is better than he was.

Fig. 2 — the same template. four fragments, seven fragments, six fragments. no counter could have described any of them

Three things to notice, because they are the things the first draft could not do.

- **Run B contains no failure.** The player never missed an objective. They seated a Marshal, which is a perfectly good decision, and the story read it. The disaster is authored, deserved and entirely un-signposted.
- **Run C's terminal is not the ending.** The story closed at season 34 with no consequence at all — and thirty-eight seasons later, in a completely different context, it collected. That is the deferred detonation the first draft was trying to buy with a progress bar.
- **Run A's card at season 41 exists in no other run.** Its condition is `memory.wonUnderHim >= 2 && renown > king.renown`. Most players will never see it, and that is correct — a story you can exhaust is a story with a walkthrough.

### What one fragment looks like

Fragment · reed-banner / he-asks-again

- **Fires when** — he is on the roster, unposted, `memory.heHasAsked >= 1`, and at least twelve seasons have passed since he last spoke.
- **More salient when** — you have seated someone else since; the realm has lost a province; his renown has risen anyway.
- **Suppressed by** — any terminal having fired; him currently commanding anything.
- **Volume** — Card.
- **Writes** — `heHasAsked += 1`, and `coldness += 1` if refused.

Twenty-two of these, no order between them, and the story writes itself differently every time. This is the entire data model — conditions, a weight, a volume, and what it remembers. It is not more complicated than `foreignCardTemplates`, which already ships.

07

## Nine ways it stays unpredictable

Unpredictability has to be structural. If it depends on the player not having read the fragment yet, it lasts one run.

| Mechanism | What it does |
| --- | --- |
| **Salience draw** | Among the fragments that fit, the choice is random. The same state twice gives different lines. |
| **Silence** | A story may deliberately say nothing for thirty seasons and then resume. Silence is a fragment with its own conditions, not an absence. |
| **Latency** | Stories seed with no card and no announcement. You cannot count how many are running. |
| **Echo** | A fragment quotes a specific thing you did, by name and season. *"You gave him a host in the spring of the ninth year."* |
| **Turn** | The story's intent changes mid-run. What was a loyalty story becomes a succession story. Nothing announces the switch. |
| **Attribution** | The story claims simulation events that would have happened anyway. Free, and it makes the world feel authored. |
| **The advisor lies** | Every card carries one line from a seated hero. A hero with low `loyalty` or high `renown` gives advice that serves himself. Nothing marks it. This finally gives `loyalty` a meaning. |
| **Collision** | Two stories on one subject merge into a fragment authored by neither. Players assume it was written for them. |
| **Inheritance** | A finished story's memory is readable by stories seeded later, including in the next run. |

And one deliberate absence

No percentages, anywhere. The first draft showed exact costs and hid the odds, which was right, and then undermined it with a progress bar. Costs exact, everything else in words. *"He is not certain it will hold."*

08

## What it looks like

### The card — with the counter gone

Ngọn Cờ Lau

He Asks Again

**◉***Đinh Công*

band · court

He is waiting in the outer hall, which he was not asked to do. He says he has thought about it a long time, and that he is not asking for a large command. He does not say anything about the investiture.

Give him a host

Four hundred men and the northern road.

400 humans60 gold

Not yet

There will be other seasons.

He is a herdsman's son

Say it where the court can hear.

+ court stability

Đỗ Khắc, Marshal — "Give him nothing. Men like that are only dangerous once they have something to lose."

**No beat counter.** The header carries the story's name and nothing else. You cannot tell whether this is the second fragment or the ninth, and there is no total to be two-thirds of.

**Two of the three options cost nothing and promise nothing.** "Not yet" is not a decline — it is an answer the story will read, and it is the option most players will take twice before noticing that twice is the number that matters.

**The third option is a trap that looks like a reward.** It gives real court stability. It also writes `humiliated`, which unlocks four fragments and suppresses two.

**Đỗ Khắc is not neutral.** He holds the seat this man wants. Nothing in the interface says so.

#### Art: the speaker's face, and a band that belongs to no story

**No story gets its own illustration.** A drawing of "the fisherman of Vân Đồn" is wrong the instant the template binds to a different province — and binding to a different province on every map is the entire point of the model. Specific art and random subjects cannot both be true.

So the card carries two things. On the left, **the speaker's own portrait**, taken from the hero roster that already exists — which does double duty, because it tells the player at a glance *who this story is about*, and that is the legibility problem from §12 partly solved for free. On the right, a **generic woodblock band** chosen by tag, not by story:

**court****river****field****coast****mountain****march****fire****granary****night****crowd****shrine****border**

Twelve bands, generated from the existing `washFill` / `inkPath` woodblock code and seeded per fragment so no two impressions are identical. A fragment declares `band: 'court'` and never names an image. The same band appearing across many different stories is not a compromise here — it is *correct*, because the stories are generic templates and should look like it. Cost: engineering hours, once, instead of twenty illustrations.

### The whisper — how a story is present without demanding anything

◈
Men who should be in your muster rolls are drilling somewhere else.

◈
Trường Yên has paid no tax this season. No one will say why.

One line in the existing header strip. No pause, no modal, no acknowledgement required, no prompt budget spent. It scrolls past and lands in the Chronicle.

This is what replaces the task banner. It carries no instruction and no deadline — but two of these in five seasons is a warning, and the player who reads it will go and look at Trường Yên without being told to.

**That is the whole design in one interaction:** the game did not give them a job, and they went and did something anyway.

### The opening — a thing to do, sitting where you already are

Trường Yên ◈

Delta · 4,100 people · loyalty 61

Status

**Yield**food 14 · goods 6 · gold 9

**Defence**18 · no garrison

Assignment

**Governor**none posted

Focus

**Food**well suited

Build

**Granary**90 goods

◈ Đinh Công's men would raise the dyke for nothing, if he were asked. He is not asking.

Let them build it →

This is what replaces the objective banner. It is the last row of a sheet you were already looking at, in hoa hòe so it reads as an offer rather than a status.

**No deadline. No reward shown. No progress.** It will be there for a while and then it will not, and nothing announces either.

Taking it costs you a build slot in a province you might have wanted for something else — a real trade, made for a reason you cannot fully see.

**Not taking it is equally an answer**, and in the Reed Banner story it is the one that eventually matters. *"He is not asking"* is doing a great deal of work in that sentence.

### The Chronicle — a history, not a task list

Sử Ký · The Chronicle

season 57 · fourteenth year

Being spoken of

Ngọn Cờ Lau

"Trường Yên has paid no tax this season."

◈ Đinh Công · ◈ Trường Yên

The Chancellor's Granaries

"The price of rice in the capital has doubled."

◈ Thăng Long

Recorded

Lông Ngỗng

The claw was changed. Cổ Loa fell in a season, and the road to the border was marked with feathers.

season 44

The Fisherman of Vân Đồn

You listened to him and did nothing, and the tide was only a tide.

season 21

**Takes the Codex slot.** You judged the Danh mục page valueless in play; this is what a player actually opens.

**No progress. No pips. No counts.** A running story shows only its most recent line and its marked subjects. You can see *that* it is being spoken of and *what* was last said — never how far along it is, because it is not along anything.

**Recorded entries are written by the fragment that ended them**, in past tense, one sentence. Including the ones where nothing happened — "the tide was only a tide" is a real ending and it deserves a line.

At the end of a run this list is the run summary. It is the thing players screenshot, and it costs nothing extra to build.

09

## Where the stories come from

Vietnamese history suits this unusually well, because so much of it turns on a single decision made under pressure rather than on attrition — and because several of its most famous episodes are *about* not knowing what was coming.

The rule: history has to yield a **behaviour**, not a name. If it only gives a name it stays out.

| Source | What happened | The behaviour it yields |
| --- | --- | --- |
| **Đinh Bộ Lĩnh** 968 | A buffalo herder's son who played at war with reed banners ends the anarchy of the twelve warlords and founds Đại Cồ Việt. | **A man who becomes what you make him.** The worked example in [§06](#reed). His terminal is a founding or a rebellion and the same fragments lead to both. |
| **Mỵ Châu & Trọng Thủy** legend, ~179 BC | A marriage alliance. The son-in-law finds where the crossbow's trigger is kept and swaps it for a forgery. Fleeing, the princess drops goose feathers to mark her road — for him. | **A gift that has been reading you back.** The feather fragment only exists if the marked hero has been governing a border province, and it fires on *his* schedule. |
| **Hội nghị Diên Hồng** 1284 | Facing the second Mongol invasion, the retired emperor summons the elders of the realm and asks them whether to fight or make terms. They shout to fight. | **A card you do not answer.** You present the options; the elders decide, weighted by province loyalty and court stability. Ten quiet minutes of governance cash out in one moment, and the player only watches. |
| **Bà Triệu** 248 | "I want to ride the strong winds, tread the fierce waves… not bend my back to be any man's concubine." | **A hero with an ambition that is not yours.** She refuses postings. Refuse her back and she leaves — and the story does not end when she does. |
| **Trần Quốc Toản** 1285 | A prince too young for the war council crushes an orange in his fist, raises his own banner anyway, and dies in the fighting. | **Refusal is not a null input.** He acts without your orders and the outcome is out of your hands entirely. |
| **Hồ Quý Ly** 1400–1407 | Genuinely advanced reforms — national paper currency, land caps — imposed with no popular consent. Counterfeiting, then famine, then the Ming. Seven years. | **Attribution.** This story does not cause anything. It claims the famines and unrest the simulation was going to produce anyway, and gives them an author. |
| **Bạch Đằng** 938 & 1288 | Iron-shod stakes in a tidal riverbed, hidden at high water. The fleet is lured in on the flood and destroyed on the ebb — twice, 350 years apart. | **Something you did long ago, collecting.** No charge, no deadline. Whisper it once, let the player build a timber yard for their own reasons, and fire it fifty seasons later if a fleet ever comes. |
| **Lê Lai** 1419 | Lê Lai puts on Lê Lợi's clothes, rides out to be captured and killed, and buys the real leader his escape. | **A card that asks which hero dies.** Not random loss — a named one, chosen by you, and the survivor is permanently marked by it in every story that binds him afterwards. |
| **Hoàn Kiếm** legend, 1428 | Thuận Thiên, the sword from the lake, wins the war — and the golden turtle surfaces to take it back. It was lent, not given. | **A boon that is being counted.** Nothing tells you it must be surrendered. Keeping it simply makes certain fragments more salient. |
| **Hai Bà Trưng** 40–43 | Sixty-five citadels fall in months. Three years later Mã Viện grinds all of it back. | **A gift with a name attached.** A whisper — *"Mã Viện has been given an army"* — and no date, ever. |
| **Quang Trung** Tết 1789 | Crowns himself, marches a hundred thousand men north in five corps, breaks the Qing across five days of the new year. | **The one story allowed to be urgent.** The single exception to "time is never a number", because its entire drama is the clock. |
| **Yi Sun-sin** Korea, 1597 | A planted lie persuades the court to imprison and torture its best commander. It reinstates him after catastrophe, with thirteen ships left. | **A story where the antagonist is your own court.** Believe it and lose him; protect him and your stability falls and the court turns on you. |
| **Honnō-ji** Japan, 1582 | Akechi Mitsuhide turns on Oda Nobunaga at the height of his success. | **Betrayal weighted by concentration.** Hosts, provinces and seats held by one hero. Efficiency is how you die. |
| **Fabius Maximus** Rome, 217 BC | Refuses battle for a year while Italy burns, and is called the Delayer as an insult. | **Correct and unpopular at once.** A story that reads your *inaction* as the input and punishes it socially while rewarding it strategically. |

On handling this material

Use the shape of the event, and the real names only where the tone is honouring — Bạch Đằng, Diên Hồng, Lê Lai. Invent names wherever the story needs a villain or a fool: the Hồ Quý Ly chain ships as a nameless reforming chancellor. And the Vietnamese should be written first for these, not translated into.

10

## What other games did

Re-read against the complaint above, the split between these is sharp: the ones that shipped *chains* are the ones players describe as repetitive, and the ones that shipped *pools* are the ones people still talk about twenty years later.

| Game | Shape | What it proves |
| --- | --- | --- |
| **King of Dragon Pass** pool | ~600 events, a council of advisors who each comment before you choose, and an automatically written year-by-year saga at the end. | The closest relative and the model to follow. Thirty years old and nobody has bettered it. The advisor line and the end-of-run saga are both nearly free and both do enormous work. |
| **Fallen London** pool | Storylets unlocked by qualities — plain numbers covering inventory, skill and story progress alike. Emily Short's writing on salience-based vs branching structures is the theory behind §02. | Story progress is just a number, so the data model needs nothing exotic. And salience beats branching precisely because a tree can be memorised. |
| **Old World** pool | A virtual deck: trigger, requirements, effects, with weight and priority. Each event binds random **subjects** — a character, a city, a family, a law. | Subject binding is the multiplier that makes twenty templates read as hundreds. Also the honest warning: Mohawk wrote 1,200 events and expected 2,000. |
| **Crusader Kings III** object | Story cycles: a persistent object owned by a character, with `on_setup`, timed effect groups that fire on their own schedule, and `on_end`. It outlives any single event and dies with its owner. | The architecture. A story is a thing that exists in the save and owns its own clock — not a queue entry. Its flaw is invisibility; ours is readable in the Chronicle. |
| **Wildermyth** pool | Events permanently transform, disfigure and kill named characters, and the survivors remember. | Permanence. A story that can only give you things is not a story. |
| **Griftlands** pool | Relationships with named characters persist across runs and change what future runs offer. | Fits the Legacy meta-shop exactly, and is what makes Run C's season-72 payoff work across a run boundary rather than within one. |
| **Stellaris dig sites** chain | Six chapters, unlocked by a scientist physically excavating a map location. | Half right. Paradox's own reasoning — narrative anchored to somewhere you can see is easier to hold in your head — is why stories mark provinces. But the chapter counter and the waiting are exactly the thing being cut here. |
| **Endless Legend** chain | Eight chapters in fixed order, objectives hidden until unlocked, rewards scaled to difficulty. | Hiding the next objective is good and worth keeping. Everything else is the quest system this draft threw out. |
| **Total War: Three Kingdoms** chain anti-pattern | Dilemmas and council assignments. The standing community complaint is that they are repetitive, and that declining a dilemma just means being told to do the same thing later as a mission. | The exact failure being designed against, with a far bigger budget than this game will ever have. Every branch reconverged, so reading the card became wasted time. |

11

## Pacing and cost

The salience model is *easier* on the prompt budget than the chain model, which is a happy accident worth stating plainly.

The ascent `DecisionDirector` is the most carefully tuned file in the project, and its comments record this exact failure: at a two-tick gap a run raised ~250 prompts across 320 ticks, half of all ticks ended with a modal open, and the map — the mode's entire art surface — was never on screen. Nine kinds already compete in that queue and four of them were measured firing zero times per run before ageing was added.

**Seventy per cent of everything a story says is a whisper**, which costs nothing: no pause, no modal, no queue slot. Stories can therefore be continuously present while consuming a small fraction of the prompt budget. One new kind, `story-beat`, capped at ~15% of prompts, firing in the Court phase, with one exemption for the Quang Trung clock — the same escape hatch famine already has.

### What it costs to build

**Engineering, roughly a week.** A `StorySystem` holding seed / bind / score / speak / remember. An `ActiveStory` array and a `storyLog` on `GameState`, both optional fields so old saves load. A salience scorer, which is a filter and a weighted draw. A whisper line in the header strip. The Chronicle lane, reusing `laneList`.

Two things to lock before writing any code

Both are nearly free now and expensive to retrofit, and both are consequences of stories being persistent objects rather than one-shot events.

**1 · Story text does not go in `src/i18n/catalogs/*.ts`.** Those files are already large enough to be awkward to open, and they are imported eagerly — adding tens of thousands of words of fragment text to them puts the entire story catalogue into the initial bundle, for a mode most sessions will not even open. Story text belongs in **per-story catalogues, lazy-loaded on demand**, keyed `story.<id>.<fragment>`. A run touches six stories at most, so it should download six files, not one hundred and twenty stories' worth of prose. Decide this before the first fragment is written, because moving it later means touching every key.

**2 · Fragment IDs are append-only, forever.** A live story in the save holds the id of the fragment it last spoke and the flags it has written. Rename `he-asks-again` and every save mid-way through that story loads into a dangling reference. This makes IDs a *compatibility contract* from the day the first story ships: add freely, never rename, never reuse, and retire by marking dead rather than deleting. The same rule covers memory flag names. It costs nothing to honour and it is unrecoverable to breach — a player two hours into a run does not care why their Chronicle is empty.

### The production model — settled

The first draft of this document costed the writing as hand-authored prose in two languages, which is where the 43,000-word figure and the low score came from. That is no longer the plan, and the arithmetic changes completely.

| Decision | Effect |
| --- | --- |
| **LLM drafts, you edit** | Fragments are generated against a per-fragment spec and then edited. Volume stops being the constraint. *A new constraint appears instead — see the risk below.* |
| **Vietnamese is the source** | Written vi-first, so the register survives. English is derived and reviewed rather than authored. The word count does not double; the *human* count roughly halves. |
| **No per-story art** | Twelve procedural bands plus the speaker's existing portrait. Twenty illustrations removed from the budget entirely. |
| **No deadline, ship in stages** | Every stage below is independently shippable and independently worth having. Nothing is wasted if you stop after any of them. |

The risk that replaces word count

**Voice homogeneity.** LLM prose converges on a register, and twenty-two fragments in one pool that all sound the same is precisely the visible-repetition failure this model is most exposed to — worse than a chain, which at least does not repeat itself. The fix is to spec fragments as *constraints*, not as briefs: a hard length cap, one required concrete noun (a place, a tool, a body part, a smell), a banned-word list that grows as you edit, and a rule that no two fragments in one pool may open with the same grammatical shape. Then edit for rhythm. That is the work now, and it is much less than 43,000 words but it is not zero.

### Build order — four stages, each shippable alone

| Stage | What ships | Human effort |
| --- | --- | --- |
| **1 · Whispers** | Three stories, no cards at all. Ambient lines that react to what you do, marks on subjects, the Chronicle lane in the Codex slot. Proves the salience scorer and the save round-trip. | A few evenings. ~40 lines of vi. **Do this first and play it before committing to anything else** — it answers whether you want the feature at all. |
| **2 · Cards, memory, echo** | Fragments that pause and ask. Memory flags. The advisor line — four lines of code that change how every card reads. And **echo**, which must not slip to stage 4. | The spec gets written here, once, and every later fragment inherits it. Heaviest editing stage. |
| **3 · The Reed Banner, whole** | One complete story: 22 fragments, 6 terminals, including the one that carves a hostile kingdom out of your own provinces. | The proof. If this lands, the design is right. If it does not, stop here having lost two weekends. |
| **4 · The rest** | Blows, attribution, collision, inheritance, Legacy carry-over — and then stories forever, one at a time, at whatever pace suits. | Open-ended by design. With no deadline, the catalogue is a garden, not a deliverable. |

Six stories at full depth remains the right first target. Not because of budget any more, but because a pool of twenty-two fragments is what buys the dynamism, and six that behave like people still beat twelve that behave like tables.

12

## Honest score

Scored as a feature to build next, for this game, at this stage. The first draft scored 7.6 with content cost as the drag; the second scored 8.1 with the same drag. Four production decisions have now removed most of it, so this is the third and final scoring.

Player impactDoes it fix something real?

9.5

Surprise & replayDoes it survive the fifth run?

9

Fit with what existsHow much new machinery?

9

Design noveltySalience + volumes + attribution, in a 4X shell

8.5

Scope realismNo deadline, four independently shippable stages

8 ↑

Technical riskScorer tuning, save migration, lazy-loaded text

7.5

Content costLLM-drafted, vi-first, no illustration budget

7 ↑

Legibility riskCan a player tell it is reacting to them?

7 ↑

Voice riskLLM prose converging on one register

6 new

Weighted verdict

8.7 / 10  ·  was 8.1

**Build it.** The two numbers that were dragging this down were both artefacts of assumptions I made without asking, and both are gone. Content cost was 3.5 because I costed 43,000 hand-authored words in two languages; it is 7 now that fragments are LLM-drafted against a spec, Vietnamese is the source rather than a second pass, and the twenty illustrations came out of the budget. Scope realism was 4.5 because I assumed a finite budget being spent against a fixed target; with no deadline and four independently shippable stages, finishing is not the risk it was.

**The art decision was a design win, not just a saving.** Generic bands plus the speaker's own face is *more* correct than per-story illustration, because a story that binds a random hero and a random province cannot have a specific picture without lying. It also nudged legibility up: a face on the card tells the player instantly which subject the story is about, which is half of what echo was there to do.

**Two risks remain, and they are both about texture rather than structure.** *Legibility* — a salience pool can react perfectly and still read as noise, so echo and the Chronicle's past-tense entries must land in stage 2. And the new one, *voice*: LLM-drafted fragments converge on a register, and a pool where all twenty-two lines sound like the same narrator is exactly the repetition this model is most exposed to. The counter is speccing fragments as constraints — length cap, one required concrete noun, a growing banned-word list, no two openings sharing a grammatical shape — and editing for rhythm rather than for meaning. That editing pass is the real remaining work.

**Do stage 1 this week.** Three stories, whispers only, no cards, no memory, no branching — just ambient lines that react to what you actually did, and the Chronicle lane in the slot the Codex vacated. It is a few evenings. A header that occasionally says *"Ông ta không tới dự lễ tấn phong"* will tell you in one sitting whether the rest of this document is worth building, and if the answer is no you have lost almost nothing.

#### What would change this score

| If… | Then |
| --- | --- |
| Echo and the Chronicle's past-tense record slip to stage 4 | **falls to ~7.** The reactivity becomes invisible and the whole thing reads as random flavour. These are the two cheapest things in the design and the two most load-bearing. |
| Fragments ship LLM-drafted but unedited | **falls to ~6.5.** One narrator, twenty-two voices, and the player hears it inside a single run. The editing pass is not optional; it is what the production model traded the word count for. |
| Stories ship with fewer than ~15 fragments each | **falls to ~7.** Visible repetition inside one run, which is worse than a chain — a chain at least does not repeat itself. |
| Blows get cut as too punishing | **falls to ~7.5.** Without something that simply happens to you, the player is always in control, and control is the opposite of drama. |
| Attribution ships | **rises to ~8.9.** One hook and eleven words, and the famine the simulation was going to produce anyway acquires an author and a signature. |
| The Diên Hồng card lands as designed | **rises to ~9.** A card where the player watches a decision be made about them, weighted by ten quiet minutes of governance, is what a game gets remembered for. |
| Inheritance across runs ships | **rises to ~9.2.** A hero who left in run three commanding the host that kills you in run five is the whole promise of the feature, delivered. |

Second pass · draft for discussion · no implementation · Throne of Đại Việt

Design sources — [Emily Short on salience-based narrative](https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/) · [QBN and storylets](https://videlais.github.io/simple-qbn/qbn.html) · [Dunham on systemic stories](https://www.gamedeveloper.com/design/the-designer-of-i-six-ages-i-i-king-of-dragon-pass-i-on-the-power-of-systemic-stories) · [Designing Six Ages, GDC](https://www.gdcvault.com/play/1025740/Designing-Six-Ages-a-Storytelling) · [Soren Johnson on Old World events](https://civfanatics.com/2021/10/01/old-world-designer-notes-8-soren-johnson-on-events/) · [CK3 story cycles](https://ck3.paradoxwikis.com/Story_cycles_modding) · [Stellaris archaeology dev diary](https://forum.paradoxplaza.com/forum/developer-diary/stellaris-dev-diary-145-archaeology.1170190/) · [Endless Legend quests](https://endlesslegend.fandom.com/wiki/Quests) · [Three Kingdoms council criticism](https://steamcommunity.com/app/779340/discussions/0/1736635023059106949/)

History — [Twelve warlords](https://grokipedia.com/page/Era_of_the_Twelve_Warlords) · [Đinh dynasty](https://en.wikipedia.org/wiki/%C4%90inh_dynasty) · [The magic crossbow](https://www.vietnam.com/en/culture/art/fairy-tales/the-magic-crossbow-an-old-vietnam-tale-of-trong-thuy-and-my-chau.html) · [Hội nghị Diên Hồng](https://vi.wikipedia.org/wiki/H%E1%BB%99i_ngh%E1%BB%8B_Di%C3%AAn_H%E1%BB%93ng) · [Lady Triệu](https://en.wikipedia.org/wiki/Lady_Tri%E1%BB%87u) · [Trần Quốc Toản](https://en.wikipedia.org/wiki/Tr%E1%BA%A7n_Qu%E1%BB%91c_To%E1%BA%A3n) · [Hồ Quý Ly](https://grokipedia.com/page/H%E1%BB%93_Qu%C3%BD_Ly) · [Bạch Đằng 1288](https://en.wikipedia.org/wiki/Battle_of_B%E1%BA%A1ch_%C4%90%E1%BA%B1ng_(1288)) · [Lam Sơn uprising](https://en.wikipedia.org/wiki/Lam_S%C6%A1n_uprising) · [Thuận Thiên](https://en.wikipedia.org/wiki/Thu%E1%BA%ADn_Thi%C3%AAn_(sword)) · [Trưng sisters](https://en.wikipedia.org/wiki/Tr%C6%B0ng_sisters) · [Quang Trung](https://localvietnam.com/culture/history/quang-trung/) · [Myeongnyang](https://en.wikipedia.org/wiki/Battle_of_Myeongnyang)
