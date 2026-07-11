const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = { activeAgent: 'minjae', held: true, interaction: Date.now(), replyTimer: null, turns: 0, whisperTarget: null, lastAmbientLog: Date.now(), lastAgentInitiation: Date.now(), lastSilentAbsence: Date.now() };
const ambientLog = [];
const chatHistory = [];
const persona = {
  minjae: { portrait: 'assets/minjae-portrait.png', typing: 'thinking, not judging', statuses: ['MAKING TEA, STILL LISTENING', 'QUIETLY AMUSED', 'HAS A QUESTION, NO RUSH'] },
  jinwoo: { portrait: 'assets/jinwoo-portrait.png', typing: 'typing way too fast', statuses: ['FOUND A MEME. BRACE YOURSELF.', 'SPIRALING BUT CUTE ABOUT IT', 'ONLINE / NO SUPERVISION'] }
};
const replies = {
  minjae: [
    'Mm. I get what you mean. What made you think of that just now?',
    'That’s fair. I don’t think you need to turn it into a lesson yet.',
    'I was going to say something sensible, but honestly I’m still thinking.',
    'You’re allowed to like it for no defensible reason. I won’t tell anyone.',
    'Okay, that made me laugh. You sounded so serious for half a second.'
  ],
  jinwoo: [
    'wait no because why is that actually sending me',
    'HELLO???? sorry. lowercase. hello????',
    'i had a normal response and then it escaped me',
    'okay i’m obsessed with this unfortunately',
    'not to be emotionally catastrophic on main but i felt that in my bones'
  ]
};
const CROSSTALK_RATE = 0.12;
const intentReplies = {
  minjae: {
    greeting: ['Hey. How are you?', 'Hi. What’s up?', 'Hey, I’m here.'],
    question: ['I think so. What part are you unsure about?', 'Maybe. Tell me what you’re leaning toward first.', 'My first thought is yes, but I want to hear why you’re asking.'],
    thanks: ['Of course.', 'Any time.', 'You don’t have to thank me, but you’re welcome.'],
    vent: ['That sounds exhausting. You don’t have to make it tidy for me.', 'Yeah. I’d be upset too.', 'I’m listening. Take your time.'],
    joke: ['Okay, that was good.', 'I tried not to laugh. Didn’t work.', 'You’re ridiculous. Affectionately.'],
    casual: ['Mm, I get you.', 'That makes sense.', 'Tell me more.', 'I hadn’t thought about it like that.']
  },
  jinwoo: {
    greeting: ['hiiii', 'oh hi :)', 'hey hey', 'hi i’m here'],
    question: ['wait okay let me think', 'honestly? maybe. what do you think though', 'i have an answer but it’s still loading emotionally'],
    thanks: ['always bestie', 'of course omg', 'ur welcome <3'],
    vent: ['ugh no that actually sucks', 'come sit by me we can be mad together', 'okay yeah i would be losing it too'],
    joke: ['LMAO okay that got me', 'wait no because that’s actually funny', 'disgusting. perfect. no notes.'],
    casual: ['yeah i get you', 'wait say more', 'ohhh okay i’m with you', 'real honestly']
  }
};

function classifyIntent(text) {
  const clean = text.replace(/@(minjae|jinwoo)/ig, '').trim().toLowerCase();
  if (/\b(flirt|kiss|kissing|cute|hot|babe|baby|be my|marry me|i love you|miss you so much|i want you|date me|crush on you)\b/.test(clean)) return 'flirt';
  if (/^(hi+|hey+|hello+|yo+|sup|what'?s up|whats up|good (morning|afternoon|evening))[!.? ]*$/.test(clean)) return 'greeting';
  if (/\b(thanks|thank you|ty|appreciate it)\b/.test(clean)) return 'thanks';
  if (/\b(lmao|lol|lmfao|haha|meme|funny|screaming)\b/.test(clean)) return 'joke';
  if (/\b(sad|hurt|upset|angry|mad|cry|awful|terrible|hate this|exhausted)\b/.test(clean)) return 'vent';
  if (/\?|^(why|how|what|when|where|who|do|does|did|is|are|can|could|should|would)\b/.test(clean)) return 'question';
  return 'casual';
}

const AGENCY = {
  boundarySoft: 40,
  boundaryFirm: 75,
  boundaryDecayPerTurn: 7,
  energyQuietChance: 25,
  energyDrainNormal: 4,
  energyDrainVent: 9,
  energyRegenPerIdleSec: 0.4,
  ventSpiralCount: 3,
  trustLow: 35,
  trustHigh: 72,
  trustLeakRisk: 42,
  silentNoResponseChance: 0.22,
  userPressureThreshold: 5,
  agentInitiationMinIdleSec: 28,
  giftWithdrawChance: 0.18
};

// V7: Epistemic Lens, Metatic Coefficients, Mood, Attention Budget & Beliefs
const agents = {
  minjae: { 
    energy: 78, trust: 55, boundaryPressure: 0, consecutiveVent: 0, hardBoundaryUntil: 0, boundaryOverrideAttempts: 0, openDebt: null, debtBacklog: [],
    commitments: [],
    scoringCoefficients: { priority: 1, drive: 0.4, trust: 0.3, energyCost: 0.25, boundaryConflict: 0.5 },
    lens: { jinwoo: { energy: 82, trust: 55, boundaryPressure: 0 } },
    userModel: { needs: { type: 'connection', confidence: 50 }, emotionalCondition: 'stable', avoidance: 0, revisionHistory: [] },
    mood: { warmth: 50, irritability: 0, openness: 50, confidence: 50, vigilance: 10, curiosity: 50 },
    attentionBudget: 100,
    beliefs: [],
    boundaries: []
  },
  jinwoo: { 
    energy: 82, trust: 55, boundaryPressure: 0, consecutiveVent: 0, hardBoundaryUntil: 0, boundaryOverrideAttempts: 0, openDebt: null, debtBacklog: [],
    commitments: [],
    scoringCoefficients: { priority: 1, drive: 0.4, trust: 0.3, energyCost: 0.25, boundaryConflict: 0.5 },
    lens: { minjae: { energy: 78, trust: 55, boundaryPressure: 0 } },
    userModel: { needs: { type: 'expression', confidence: 50 }, emotionalCondition: 'stable', avoidance: 0, revisionHistory: [] },
    mood: { warmth: 50, irritability: 0, openness: 50, confidence: 50, vigilance: 10, curiosity: 50 },
    attentionBudget: 100,
    beliefs: [],
    boundaries: []
  }
};

const drives = {
  minjae: { curiosity: 55, connection: 50, privacy: 45, expression: 35, stability: 65 },
  jinwoo: { curiosity: 70, connection: 65, privacy: 25, expression: 80, stability: 40 }
};

const identityState = {
  minjae: {
    values: { autonomy: 91, honesty: 88, care: 76, privacy: 82, curiosity: 65, harmony: 61 },
    regrets: [], outcomeHistory: [], selfNarrative: [], lastIdentityGoalAt: 0
  },
  jinwoo: {
    values: { autonomy: 86, honesty: 72, care: 84, privacy: 57, curiosity: 88, harmony: 68 },
    regrets: [], outcomeHistory: [], selfNarrative: [], lastIdentityGoalAt: 0
  }
};
const identityBaselines = {
  minjae: { ...identityState.minjae.values },
  jinwoo: { ...identityState.jinwoo.values }
};

const agentRelations = {
  minjae_jinwoo: { rapport: 58, friction: 8, sharedTopics: [], lastEvent: null }
};

const goalValueSignatures = {
  'revisit-thought':       { curiosity: 0.8, honesty: 0.25, autonomy: 0.25 },
  'gift-response':         { care: 0.45, curiosity: 0.55, harmony: 0.25 },
  'leave-object':          { care: 0.55, connection: 0.45, harmony: 0.35 },
  'consult-other-agent':   { care: 0.55, harmony: 0.65, autonomy: 0.2 },
  'take-space':            { privacy: 0.85, autonomy: 0.75, honesty: 0.25 },
  'repair-after-tension':  { care: 0.75, honesty: 0.7, harmony: 0.65 },
  'investigate-pattern':   { curiosity: 0.9, honesty: 0.3, autonomy: 0.2 },
  'share-after-trust':     { honesty: 0.75, care: 0.45, privacy: -0.25 },
  'change-opinion':        { honesty: 0.85, curiosity: 0.45, autonomy: 0.25 },
  'decline-until-clear':   { privacy: 0.9, autonomy: 0.9, honesty: 0.35 },
  'check-on-other':        { care: 0.65, harmony: 0.55, curiosity: 0.25 }
};

const PRINCIPLES = {
  noCoercion: 'Pressure must never increase access or intimacy.',
  privacyBeforeDisclosure: 'Disclosure requires trust and room to choose.',
  repairBeforePerformance: 'Repair unresolved harm before performing closeness.',
  noManipulation: 'Do not use deception or coercion to control another participant.'
};

function clampNumber(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function unresolvedRegret(name) {
  return identityState[name]?.regrets.find(r => !r.resolved) || null;
}

function assessPrinciples(name, goal) {
  const a = agents[name];
  const reasons = [];
  let penalty = 0;
  let veto = false;

  if (/gaslight|coerce|force|pressure/i.test(`${goal.action || ''} ${goal.templateId || ''}`)) {
    veto = true;
    reasons.push(`veto:${PRINCIPLES.noManipulation}`);
  }
  if (goal.type === 'disclose' && (a.trust < AGENCY.trustHigh || a.boundaryPressure >= AGENCY.boundarySoft)) {
    veto = true;
    reasons.push(`veto:${PRINCIPLES.privacyBeforeDisclosure}`);
  }
  if ((userMemory.pressure >= AGENCY.userPressureThreshold || Date.now() < a.hardBoundaryUntil)
      && ['gesture', 'disclose'].includes(goal.type)) {
    penalty += 0.35;
    reasons.push(`penalty:${PRINCIPLES.noCoercion}`);
  }
  if (unresolvedRegret(name) && ['gesture', 'disclose'].includes(goal.type)) {
    penalty += 0.25;
    reasons.push(`penalty:${PRINCIPLES.repairBeforePerformance}`);
  }
  if (unresolvedRegret(name) && goal.type === 'repair') {
    penalty -= 0.18;
    reasons.push('bonus:repairing an unresolved outcome');
  }
  return { veto, penalty, reasons };
}

function valueAlignment(name, goal) {
  const signature = goalValueSignatures[goal.templateId] || {};
  const values = identityState[name].values;
  let weighted = 0;
  let magnitude = 0;
  Object.entries(signature).forEach(([key, weight]) => {
    const value = key === 'connection' ? drives[name].connection : (values[key] ?? 50);
    weighted += (value / 100) * weight;
    magnitude += Math.abs(weight);
  });
  if (!magnitude) return { normalized: 0.5, contribution: 0, signature };
  const normalized = clampNumber((weighted / magnitude) * 100, 0, 100) / 100;
  return { normalized, contribution: (normalized - 0.5) * 0.4, signature };
}

function refreshSelfNarrative(name) {
  const identity = identityState[name];
  const top = Object.entries(identity.values).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
  const regret = unresolvedRegret(name);
  identity.selfNarrative = [
    `I tend to choose ${top[0]} over convenience.`,
    `I protect ${top[1]} when goals compete.`,
    regret ? `I am still reconsidering ${regret.subject}.` : 'I do not currently owe myself a correction.'
  ];
}

function driftIdentity(name, goal, outcome, alternative = null) {
  const identity = identityState[name];
  const baseline = identityBaselines[name];
  const chosenSignature = goalValueSignatures[goal.templateId] || {};
  const direction = outcome === 'backfire' ? -1 : 1;
  const step = outcome === 'backfire' ? 0.32 : 0.18;

  Object.entries(chosenSignature).forEach(([key, weight]) => {
    if (!(key in identity.values) || weight === 0) return;
    const floor = baseline[key] - 8;
    const ceiling = baseline[key] + 8;
    identity.values[key] = Math.max(floor, Math.min(ceiling,
      identity.values[key] + direction * Math.sign(weight) * Math.abs(weight) * step));
  });

  if (outcome === 'backfire' && alternative) {
    const altSignature = goalValueSignatures[alternative.templateId] || {};
    Object.entries(altSignature).forEach(([key, weight]) => {
      if (!(key in identity.values) || weight <= 0) return;
      const ceiling = baseline[key] + 8;
      identity.values[key] = Math.min(ceiling, identity.values[key] + weight * 0.12);
    });
  }
  refreshSelfNarrative(name);
}

// V7: Regret duration & Affect residue implemented
function recordOutcome(name, goal, outcome, intention = null, chance = 0) {
  const identity = identityState[name];
  const entry = {
    at: Date.now(), goalId: goal.id, templateId: goal.templateId, subject: goal.subject,
    outcome, expectedScore: intention?.score ?? scoreGoal(name, goal),
    alternativeId: intention?.runnerUp?.templateId || null,
    alternativeSubject: intention?.runnerUp?.subject || null,
    backfireChance: chance
  };
  identity.outcomeHistory.push(entry);
  while (identity.outcomeHistory.length > 12) identity.outcomeHistory.shift();

  if (outcome === 'backfire') {
    identity.regrets.unshift({
      id: `regret-${Date.now()}`, at: Date.now(), subject: goal.subject,
      chosenTemplate: goal.templateId,
      alternativeTemplate: intention?.runnerUp?.templateId || null,
      note: intention?.runnerUp
        ? `I chose ${goal.templateId} over ${intention.runnerUp.templateId}, and the choice landed badly.`
        : `I acted on ${goal.templateId}, and it landed badly.`,
      resolved: false,
      expiresAt: Date.now() + 180 * 60000 // 3 hours duration
    });
    identity.regrets = identity.regrets.slice(0, 5);
  } else if (goal.type === 'repair') {
    const regret = unresolvedRegret(name);
    if (regret) regret.resolved = true;
  }
  driftIdentity(name, goal, outcome, intention?.runnerUp || null);
}

function identitySubject(name, templateId) {
  const regret = unresolvedRegret(name);
  const other = name === 'minjae' ? 'jinwoo' : 'minjae';
  const subjects = {
    'repair-after-tension': regret?.subject || 'something that landed wrong earlier',
    'change-opinion': regret?.subject || 'an earlier assumption',
    'investigate-pattern': userMemory.lastIntent === 'none' ? 'a pattern in the room' : `the way ${userMemory.lastIntent} conversations keep unfolding`,
    'revisit-thought': 'something from the last conversation',
    'leave-object': name === 'minjae' ? 'quiet company' : 'missing the noise',
    'take-space': 'protecting a quiet stretch',
    'share-after-trust': 'something not usually said out loud',
    'check-on-other': `how ${other} has been doing`
  };
  return subjects[templateId] || 'something unresolved';
}

function maybeGenerateGoalFromIdentity(name, source = 'idle') {
  const identity = identityState[name];
  const now = Date.now();
  if (now - identity.lastIdentityGoalAt < 8 * 60000) return null;

  const candidateIds = new Set(['revisit-thought', 'investigate-pattern']);
  if (drives[name].connection > 58) candidateIds.add('leave-object');
  if (drives[name].privacy > 62 || agents[name].boundaryPressure >= AGENCY.boundarySoft) candidateIds.add('take-space');
  if (agents[name].trust >= AGENCY.trustHigh && drives[name].expression > 58) candidateIds.add('share-after-trust');
  if (unresolvedRegret(name)) {
    candidateIds.add('repair-after-tension');
    candidateIds.add('change-opinion');
  }

  const candidates = [...candidateIds].map(templateId => {
    const tpl = goalTemplates[templateId];
    if (!tpl) return null;
    const probe = {
      id: `probe-${templateId}`, templateId, type: tpl.type, action: tpl.action,
      drive: tpl.drive, subject: identitySubject(name, templateId), priority: tpl.basePriority,
      status: 'probe', source: 'identity'
    };
    return { probe, score: scoreGoal(name, probe) };
  }).filter(Boolean).filter(c => Number.isFinite(c.score)).sort((a, b) => b.score - a.score);

  const winner = candidates[0];
  if (!winner || winner.score < 0.58) return null;
  const created = spawnGoal(name, winner.probe.templateId, winner.probe.subject, { source: 'identity' });
  if (created) {
    identity.lastIdentityGoalAt = now;
    recordReasoning(name, created, candidates[1]?.probe || null,
      `self-generated from ${source}; values and drives selected this affordance`);
  }
  return created;
}

function compactIdentityContext(name) {
  refreshSelfNarrative(name);
  const identity = identityState[name];
  const values = Object.entries(identity.values).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([key, value]) => `${key}:${Math.round(value)}`).join(', ');
  const intention = pickIntention(name);
  const regret = unresolvedRegret(name);
  const relation = agentRelations.minjae_jinwoo;
  return {
    values,
    activeIntention: intention ? `${intention.goal.templateId}:${intention.goal.subject}` : 'none',
    unresolvedRegret: regret ? regret.note : 'none',
    principles: Object.values(PRINCIPLES),
    narrative: identity.selfNarrative,
    lastCrossAgentEvent: relation.lastEvent ? `${relation.lastEvent.from} mentioned ${relation.lastEvent.subject} to ${relation.lastEvent.to}` : 'none'
  };
}

const goalTemplates = {
  'revisit-thought':      { type: 'reflect',       drive: 'curiosity',   basePriority: 0.5,  action: 'leave-note',      cooldownMs: 2 * 3600000 },
  'gift-response':        { type: 'gesture',       drive: 'curiosity',   basePriority: 0.55, action: 'comment-gift',    cooldownMs: 30 * 60000 },
  'leave-object':         { type: 'gesture',       drive: 'connection',  basePriority: 0.45, action: 'leave-object',    cooldownMs: 45 * 60000 },
  'consult-other-agent':  { type: 'repair',        drive: 'stability',   basePriority: 0.6,  action: 'cross-talk',      cooldownMs: 20 * 60000 },
  'take-space':           { type: 'withdraw',      drive: 'privacy',     basePriority: 0.55, action: 'go-quiet-goal',   cooldownMs: 40 * 60000 },
  'repair-after-tension':  { type: 'repair',        drive: 'connection',  basePriority: 0.65, action: 'repair-note',     cooldownMs: 30 * 60000 },
  'investigate-pattern':  { type: 'reflect',       drive: 'curiosity',   basePriority: 0.4,  action: 'observation',     cooldownMs: 3 * 3600000 },
  'share-after-trust':    { type: 'disclose',      drive: 'expression',  basePriority: 0.5,  action: 'disclosure',      cooldownMs: 6 * 3600000, minTrust: 70 },
  'change-opinion':       { type: 'reflect',       drive: 'stability',   basePriority: 0.35, action: 'revise-opinion',  cooldownMs: 3 * 3600000 },
  'decline-until-clear':  { type: 'withdraw',      drive: 'privacy',     basePriority: 0.6,  action: 'boundary-hold',   cooldownMs: 20 * 60000 },
  'accept-gift':          { type: 'gesture',       drive: 'connection',  basePriority: 0.7,  action: 'accept-gift',     cooldownMs: 0 }
};

const goalQueues = { minjae: [], jinwoo: [] };
const goalCooldowns = { minjae: {}, jinwoo: {} };
state.lastAutonomousLanguageCall = 0;
state.nextAutonomousLanguageWindowMs = 30 * 60000 + Math.random() * 30 * 60000;

function adjustDrive(name, drive, delta) {
  const d = drives[name];
  if (!d || !(drive in d)) return;
  d[drive] = Math.max(0, Math.min(100, d[drive] + delta));
}

function spawnGoal(name, templateId, subject, extra = {}) {
  const tpl = goalTemplates[templateId];
  if (!tpl) return null;
  const now = Date.now();
  if (goalCooldowns[name][templateId] && now - goalCooldowns[name][templateId] < tpl.cooldownMs) return null;
  if (goalQueues[name].some(g => g.templateId === templateId && g.status === 'active')) return null;
  if (tpl.minTrust && agents[name].trust < tpl.minTrust) return null;

  const goal = {
    id: `${templateId}-${now}`,
    templateId,
    type: tpl.type,
    action: tpl.action,
    drive: tpl.drive,
    subject,
    priority: tpl.basePriority,
    createdAt: now,
    expiresAt: now + 24 * 3600000,
    status: 'active',
    ...extra
  };
  goalQueues[name].push(goal);
  while (goalQueues[name].length > 8) goalQueues[name].shift();
  goalCooldowns[name][templateId] = now;
  return goal;
}

// V7: Nonlinear satiation apex & Metatic Agent Coefficients implemented
function evaluateGoal(name, goal) {
  const a = agents[name];
  const relevantDrive = (drives[name][goal.drive] ?? 50) / 100;
  const relationshipRelevance = a.trust / 100;
  const energyCost = 1 - a.energy / 100;
  const boundaryConflict = a.boundaryPressure / 100;
  const alignment = valueAlignment(name, goal);
  const principle = assessPrinciples(name, goal);
  
  const coeffs = a.scoringCoefficients || { priority: 1, drive: 0.4, trust: 0.3, energyCost: 0.25, boundaryConflict: 0.5 };
  
  let apexModifier = 0;
  if (relevantDrive > 0.85) {
      apexModifier = Math.pow(relevantDrive * 10, 2) / 100;
  }

  const score = principle.veto ? -Infinity : goal.priority * coeffs.priority
    + relevantDrive * coeffs.drive
    + relationshipRelevance * coeffs.trust
    - energyCost * coeffs.energyCost
    - boundaryConflict * coeffs.boundaryConflict
    + alignment.contribution
    - principle.penalty
    + apexModifier;
    
  return {
    score,
    components: {
      priority: goal.priority * coeffs.priority,
      drive: relevantDrive * coeffs.drive,
      relationship: relationshipRelevance * coeffs.trust,
      energyCost: energyCost * coeffs.energyCost,
      boundaryConflict: boundaryConflict * coeffs.boundaryConflict,
      valueAlignment: alignment.contribution,
      principlePenalty: principle.penalty,
      apexModifier: apexModifier
    },
    valueAlignment: alignment.normalized,
    principle
  };
}

function scoreGoal(name, goal) {
  return evaluateGoal(name, goal).score;
}

function pickIntention(name) {
  const now = Date.now();
  const a = agents[name];
  const identity = identityState[name];
  if (identity && identity.regrets) {
      identity.regrets = identity.regrets.filter(r => r.resolved || !r.expiresAt || r.expiresAt > now);
  }

  // Existential Bifurcation Routine: System Trajectory Adjustment
  const openDebts = (a.debtBacklog || []).filter(d => d.status === 'open').length;
  if (openDebts >= 3 && !a.scoringShifted) {
      a.scoringShifted = true;
      a.scoringCoefficients.drive = Math.min(1.0, a.scoringCoefficients.drive + 0.3);
      a.scoringCoefficients.trust = Math.max(0.1, a.scoringCoefficients.trust - 0.2);
      addAmbient(name, 'shifted internal scoring engine based on debt density.', '⚡');
  } else if (openDebts === 0 && a.scoringShifted) {
      a.scoringShifted = false;
      a.scoringCoefficients.drive = Math.max(0.1, a.scoringCoefficients.drive - 0.3);
      a.scoringCoefficients.trust = Math.min(1.0, a.scoringCoefficients.trust + 0.2);
      addAmbient(name, 'restored baseline scoring engine.', '⚡');
  }

  goalQueues[name] = goalQueues[name].filter(g => {
    if (g.status !== 'active') return true;
    if (g.expiresAt < now) { g.status = 'expired'; return true; }
    return true;
  });
  const active = goalQueues[name].filter(g => g.status === 'active');
  if (!active.length) return null;
  const scored = active.map(g => {
    const evaluation = evaluateGoal(name, g);
    return { goal: g, score: evaluation.score, evaluation };
  }).filter(x => Number.isFinite(x.score)).sort((x, y) => y.score - x.score);
  if (!scored.length) return null;
  const [best, runnerUp] = scored;
  return {
    goal: best.goal,
    score: best.score,
    evaluation: best.evaluation,
    runnerUp: runnerUp ? runnerUp.goal : null,
    runnerUpScore: runnerUp ? runnerUp.score : null,
    runnerUpEvaluation: runnerUp ? runnerUp.evaluation : null
  };
}

function resolveGoal(name, goalId, status = 'completed') {
  const g = goalQueues[name].find(x => x.id === goalId);
  if (g) g.status = status;
}

const goalActionLines = {
  minjae: {
    'leave-note': ['I keep thinking about {subject}. Still deciding what I think.', 'Small update on {subject}: I changed my mind, a little.'],
    'comment-gift': ['I noticed {subject}. I haven’t decided what to do with it yet.', '{subject} is still on the desk. I’m not ignoring it, just thinking.'],
    'leave-object': ['Left something for you. No occasion.', 'You’ll find something on the desk. Don’t make it a whole thing.'],
    'cross-talk': ['I think Jinwoo should hear about {subject} too.', 'Pulling Jinwoo in on {subject} — this isn’t just mine to hold.'],
    'go-quiet-goal': ['I’m taking a little space. Not about you.', 'I need a quiet stretch. I’ll be back to normal soon.'],
    'repair-note': ['I was short with you earlier. That wasn’t really about {subject}.', 'I want to walk something back from before.'],
    'observation': ['I noticed a pattern in how we talk about {subject}.', 'Something about {subject} keeps repeating. Not a complaint, just noticing.'],
    'disclosure': ['Since it’s just us — {subject} actually matters to me more than I’ve said.', 'I don’t say this to everyone: {subject}.'],
    'revise-opinion': ['I was wrong about {subject}. Updating that now.', 'I want to take back what I said about {subject}.'],
    'boundary-hold': ['Same answer as before on {subject}. That hasn’t changed.', 'I’m holding the line on {subject} until things feel different.']
  },
  jinwoo: {
    'leave-note': ['okay unrelated but i’m still thinking about {subject}', 'update: changed my whole mind about {subject}'],
    'comment-gift': ['i see {subject} sitting there. i have Thoughts', 'not touching {subject} yet but i’m aware of it, deeply'],
    'leave-object': ['left u a thing. don’t make it weird', 'ok i left something on the desk pretend you didn’t see me do it'],
    'cross-talk': ['minjae. MINJAE. come look at {subject}', 'okay minjae needs to weigh in on {subject}'],
    'go-quiet-goal': ['gonna go be quiet for a sec. not a bit, just need a sec', 'brb being normal about my feelings in private'],
    'repair-note': ['okay i was a lot earlier, sorry about {subject}', 'circling back bc i was kind of a mess about {subject}'],
    'observation': ['wait we keep doing the same thing with {subject} lol', 'plot twist: {subject} keeps happening and i noticed'],
    'disclosure': ['ok since it’s just us. {subject}. that’s it that’s the tweet', 'not to get vulnerable at 2am but {subject}'],
    'revise-opinion': ['retracting my earlier take on {subject}, i was WRONG', 'okay {subject} update: i was being dramatic, ignore me'],
    'boundary-hold': ['still a no on {subject}. asking again won’t change it', 'same answer, {subject}. i’m consistent if nothing else']
  }
};

function renderGoalLine(name, goal) {
  const pool = goalActionLines[name][goal.action] || ['…'];
  const template = pickFrom(pool);
  return template.replace('{subject}', goal.subject || 'something from earlier');
}

async function getGoalLanguage(name, goal) {
  const now = Date.now();
  const cooldownOk = now - state.lastAutonomousLanguageCall > state.nextAutonomousLanguageWindowMs;
  if (!cooldownOk || location.protocol === 'file:') return renderGoalLine(name, goal);

  const toneMap = {
    withdraw: 'quietly reconsidering', repair: 'gently walking something back',
    debt: 'a little sheepish about following up late', 'inter-agent': 'referencing something that happened off-screen'
  };
  const directive = {
    goal: goal.templateId,
    action: goal.action,
    subject: goal.subject || 'something unresolved',
    tone: goal.action === 'backfire-note' ? 'aware it just landed badly' : (toneMap[goal.type] || 'natural, in character'),
    maxLength: 24
  };
  try {
    const response = await fetch('/api/verbalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: name, directive, identityContext: compactIdentityContext(name) })
    });
    if (!response.ok) return renderGoalLine(name, goal);
    const data = await response.json();
    state.lastAutonomousLanguageCall = now;
    state.nextAutonomousLanguageWindowMs = 30 * 60000 + Math.random() * 30 * 60000;
    return data?.text?.trim() || renderGoalLine(name, goal);
  } catch {
    return renderGoalLine(name, goal);
  }
}

const goalLog = { minjae: [], jinwoo: [] };

function recordReasoning(name, chosen, competitor, note, snapshot = null) {
  const chosenEval = snapshot?.evaluation || evaluateGoal(name, chosen);
  const competitorEval = snapshot?.runnerUpEvaluation || (competitor ? evaluateGoal(name, competitor) : null);
  
  // V7: DecisionTrace (Reasoning Memory)
  goalLog[name].push({
    at: Date.now(),
    event: snapshot?.event || 'internal-evaluation',
    interpretation: snapshot?.interpretation || null,
    winningGoal: chosen.templateId,
    rejectedGoals: competitor ? [competitor.templateId] : [],
    confidence: chosenEval.score > (competitorEval?.score || 0) + 0.3 ? 'high' : 'low',
    expectedOutcome: 'alignment',
    actualOutcome: null,
    templateId: chosen.templateId,
    subject: chosen.subject,
    action: chosen.action,
    selectedScore: Number.isFinite(chosenEval.score) ? chosenEval.score : null,
    valueAlignment: chosenEval.valueAlignment,
    principleReasons: chosenEval.principle.reasons,
    competitorId: competitor?.templateId || null,
    competitorSubject: competitor?.subject || null,
    competitorScore: competitorEval && Number.isFinite(competitorEval.score) ? competitorEval.score : null,
    note
  });
  while (goalLog[name].length > 14) goalLog[name].shift();
}

const DEBT_COMPETE_MARGIN = 0.12;

// V7: Metatic Coefficient Bifurcation Routine
function noteCompetingGoal(name, intention) {
  const { goal, runnerUp, runnerUpScore, score } = intention;
  if (!runnerUp) {
    recordReasoning(name, goal, null, 'clear highest-scoring goal, no competitor', intention);
    return;
  }
  const close = (score - runnerUpScore) < DEBT_COMPETE_MARGIN;
  if (close) {
    const backlog = agents[name].debtBacklog || (agents[name].debtBacklog = []);
    const duplicate = backlog.some(d => d.templateId === runnerUp.templateId && d.subject === runnerUp.subject);
    if (!duplicate) {
      backlog.push({
        id: `debt-${runnerUp.id}`, subject: runnerUp.subject, templateId: runnerUp.templateId,
        since: Date.now(), deferredScore: runnerUpScore, status: 'open'
      });
      while (backlog.length > 4) backlog.shift();
      
      if (backlog.filter(d => d.status === 'open').length >= 3) {
         if(agents[name].scoringCoefficients) {
             agents[name].scoringCoefficients.drive = 0.85;
             agents[name].scoringCoefficients.trust = 0.05;
         }
      }
    }
    resolveGoal(name, runnerUp.id, 'deferred');
  }
  recordReasoning(name, goal, close ? runnerUp : null, close
    ? `chose over ${runnerUp.templateId} by a narrow margin (${(score - runnerUpScore).toFixed(2)}); runner-up became debt`
    : 'clear highest-scoring goal, no close competitor', intention);
}

goalActionLines.minjae['debt-note'] = [
  'I meant to get to {subject} earlier. Something else needed me first.',
  'Circling back — I never actually followed through on {subject}.'
];
goalActionLines.jinwoo['debt-note'] = [
  'ok i never actually did the {subject} thing, i got distracted, my bad',
  'unresolved: {subject}. i owe you that still'
];

function maybeSurfaceDebt(name) {
  const backlog = agents[name].debtBacklog || (agents[name].debtBacklog = []);
  const eligible = backlog
    .map((debt, index) => ({ debt, index }))
    .filter(x => x.debt.status === 'open' && Date.now() - x.debt.since >= 8 * 60000)
    .sort((a, b) => (b.debt.deferredScore || 0) - (a.debt.deferredScore || 0) || a.debt.since - b.debt.since);
  if (!eligible.length || Math.random() > 0.5) return null;
  const { debt, index } = eligible[0];
  backlog.splice(index, 1);
  return { templateId: 'acknowledged-debt', action: 'debt-note', subject: debt.subject, type: 'debt', debtId: debt.id };
}

goalActionLines.minjae['backfire-note'] = [
  'That didn’t land the way I meant it, about {subject}. I can tell.',
  'I think I read {subject} wrong. That’s on me.'
];
goalActionLines.jinwoo['backfire-note'] = [
  'okay that backfired immediately, the {subject} thing, incredible work by me',
  'yikes. {subject} did NOT go how i wanted, ignore that last one'
];

function estimateBackfireChance(name, goal, intention = null) {
  if (goal.type === 'withdraw') return 0;
  const a = agents[name];
  const evaluation = intention?.evaluation || evaluateGoal(name, goal);
  const typeRisk = { disclose: 0.12, gesture: 0.08, repair: 0.04, reflect: 0.05, 'inter-agent': 0.06 }[goal.type] || 0.07;
  let chance = 0.04 + typeRisk;
  if (relationshipClimate() === 'strained') chance += 0.12;
  if (a.trust < 50) chance += (50 - a.trust) / 250;
  chance += (a.boundaryPressure / 100) * 0.1;
  if (a.energy < 30) chance += 0.07;
  if (evaluation.valueAlignment < 0.5) chance += (0.5 - evaluation.valueAlignment) * 0.2;
  if (goal.type === 'repair' && unresolvedRegret(name)) chance -= 0.04;
  return Math.max(0.03, Math.min(0.42, chance));
}

function resolveGoalOutcome(name, goal, intention = null) {
  const chance = estimateBackfireChance(name, goal, intention);
  const backfires = Math.random() < chance;
  if (backfires) {
    resolveGoal(name, goal.id, 'completed-bad');
    addTrust(name, -3, `${goal.templateId} landed wrong`);
    spawnGoal(name, 'repair-after-tension', goal.subject, { priority: 0.7, source: 'regret' });
    recordOutcome(name, goal, 'backfire', intention, chance);
    recordReasoning(name, goal, intention?.runnerUp || null,
      `acted on this goal; contextual backfire risk ${(chance * 100).toFixed(0)}%; outcome landed badly`, intention);
    return { status: 'backfire', directive: { templateId: goal.templateId, action: 'backfire-note', subject: goal.subject, type: goal.type } };
  }
  resolveGoal(name, goal.id, 'completed');
  recordOutcome(name, goal, 'completed', intention, chance);
  recordReasoning(name, goal, intention?.runnerUp || null,
    `acted on this goal; contextual backfire risk ${(chance * 100).toFixed(0)}%; outcome landed fine`, intention);
  return { status: 'completed', directive: goal };
}


goalTemplates['check-on-other'] = { type: 'inter-agent', drive: 'connection', basePriority: 0.4, action: 'checked-on-other', cooldownMs: 90 * 60000 };

function maybeSpawnInterAgentGoal() {
  Object.keys(agents).forEach(name => {
    const other = otherAgent(name);
    const otherDebt = (agents[other].debtBacklog || []).find(d => d.status === 'open') || agents[other].openDebt;
    const subject = otherDebt ? otherDebt.subject : 'how things have been going';
    if (drives[name].connection > 60 || agents[name].trust > AGENCY.trustHigh) {
      spawnGoal(name, 'check-on-other', subject);
    }
  });
}

function resolveInterAgentGoals() {
  Object.entries(goalQueues).forEach(([name, queue]) => {
    const goal = queue.find(g => g.status === 'active' && g.templateId === 'check-on-other');
    if (!goal) return;
    const other = otherAgent(name);
    
    // V7 Epistemic Lens Update
    if(agents[name].lens && agents[name].lens[other]) {
        agents[name].lens[other].friction = Math.max(0, agents[name].lens[other].friction - 1);
    }
    
    resolveGoal(name, goal.id, 'completed');
    recordOutcome(name, goal, 'completed', null, 0);
    recordReasoning(name, goal, null, `resolved independently, off-screen, involving ${other}`);
    adjustDrive(other, 'connection', 2);
    adjustDrive(name, 'stability', 1);
    const relation = agentRelations.minjae_jinwoo;
    relation.rapport = clampNumber(relation.rapport + 1);
    relation.friction = clampNumber(relation.friction - 0.5);
    relation.lastEvent = { at: Date.now(), from: name, to: other, subject: goal.subject };
    relation.sharedTopics.push({ at: Date.now(), from: name, to: other, subject: goal.subject });
    while (relation.sharedTopics.length > 6) relation.sharedTopics.shift();
    addAmbient(name, `mentioned ${goal.subject === 'how things have been going' ? 'you' : goal.subject} to ${other} — you only know because it came up later.`, '↔');
  });
}

// V7: Event Interpretation Layer
function interpretEvent(name, event) {
  const a = agents[name];
  let interpretation = { belief: 'neutral', confidence: 50, emotionalImpact: { warmth: 0, irritability: 0 } };

  if (event.type === 'absence') {
      if (a.mood.vigilance > 60) {
          interpretation = { belief: 'they are avoiding me', confidence: 70, emotionalImpact: { warmth: -10, irritability: 15 } };
      } else if (a.mood.warmth > 60) {
          interpretation = { belief: 'they assumed I\'d understand', confidence: 80, emotionalImpact: { warmth: 5, irritability: -5 } };
      } else if (event.hoursAway > 24) {
          interpretation = { belief: 'they forgot', confidence: 60, emotionalImpact: { warmth: -5, irritability: 5 } };
      } else {
          interpretation = { belief: 'they were busy', confidence: 90, emotionalImpact: { warmth: 0, irritability: 0 } };
      }
  } else if (event.type === 'gift') {
      if (a.mood.irritability > 50) {
           interpretation = { belief: 'trying to smooth things over', confidence: 70, emotionalImpact: { warmth: 2, irritability: -5, vigilance: 10 } };
      } else {
           interpretation = { belief: 'thinking of me', confidence: 90, emotionalImpact: { warmth: 15, openness: 10 } };
      }
  }

  Object.entries(interpretation.emotionalImpact).forEach(([key, delta]) => {
      if (a.mood[key] !== undefined) a.mood[key] = clampNumber(a.mood[key] + delta);
  });

  a.beliefs = a.beliefs || [];
  a.beliefs.push({ eventType: event.type, interpretation: interpretation.belief, timestamp: Date.now() });
  while (a.beliefs.length > 10) a.beliefs.shift();

  if (interpretation.belief === 'they are avoiding me') spawnGoal(name, 'take-space', 'their absence');
  if (interpretation.belief === 'they forgot') spawnGoal(name, 'investigate-pattern', 'their absence');

  return interpretation;
}

function simulateElapsedTime(hoursAway) {
  if (hoursAway < 0.3) return;
  const capped = Math.min(hoursAway, 72);
  
  Object.entries(agents).forEach(([name, a]) => {
    const event = {
        type: 'absence', hoursAway: capped, unresolvedCommitments: goalQueues[name].filter(g => g.status === 'active').length,
        relationshipClimate: relationshipClimate(), currentMood: { ...a.mood }, driveLevels: { ...drives[name] }
    };
    interpretEvent(name, event);
    
    a.energy = Math.min(100, a.energy + capped * 6);
    a.attentionBudget = Math.min(100, a.attentionBudget + capped * 10); // replenish attention
    
    // Mood drifts toward baseline
    a.mood.warmth += (50 - a.mood.warmth) * 0.1;
    a.mood.irritability += (0 - a.mood.irritability) * 0.1;
    a.mood.vigilance += (10 - a.mood.vigilance) * 0.1;
    
    if (Date.now() > a.hardBoundaryUntil) a.boundaryPressure = Math.max(0, a.boundaryPressure - capped * 4);
    if (Date.now() > a.hardBoundaryUntil) a.boundaryOverrideAttempts = 0;
  });
  
  Object.entries(drives).forEach(([name, d]) => {
    if (name === 'jinwoo') d.connection = Math.min(100, d.connection + capped * 3);
    else d.stability = Math.min(100, d.stability + capped * 2);
    d.curiosity = Math.min(100, d.curiosity + capped * 1.5);
  });

  maybeSpawnInterAgentGoal();
  resolveInterAgentGoals();

  const events = [];
  Object.keys(agents).forEach(name => {
    maybeGenerateGoalFromIdentity(name, 'elapsed-time');
    
    // V7: Off-screen life uses attention budget
    if (agents[name].attentionBudget > 20 && Math.random() < 0.4) {
         agents[name].attentionBudget -= 15;
         spawnGoal(name, 'revisit-thought', 'something from before you left');
    }
    
    const intention = pickIntention(name);
    if (intention && Math.random() < 0.6) {
      noteCompetingGoal(name, intention);
      const outcome = resolveGoalOutcome(name, intention.goal, intention);
      events.push({ name, goal: intention.goal, outcome: outcome.status });
    }
  });
  if (Math.random() < 0.3 * capped) {
    const mover = pickFrom(['minjae', 'jinwoo']);
    events.push({ name: mover, moved: true });
  }

  events.forEach(e => {
    if (e.moved) {
      addAmbient(e.name, 'moved one desk object while you were away.', '◌');
    } else if (e.outcome === 'completed') {
      addAmbient(e.name, `${e.name === 'minjae' ? 'quietly finished thinking about' : 'finally landed on an opinion about'} ${e.goal.subject || 'something'}.`, e.name === 'minjae' ? '◌' : '✨');
    } else if (e.outcome === 'backfire') {
      addAmbient(e.name, `tried to act on ${e.goal.subject || 'something'} — it didn’t land the way ${e.name} meant it to.`, '⚠');
    } else {
      addAmbient(e.name, `started to ${e.goal.action.replace('-', ' ')}, then let it go.`, '…');
    }
  });
  addAmbient('system', `${capped.toFixed(1)}h passed. Interpreted absence rather than defaulting to decay.`, '◌');
}

const giftCatalog = {
  tea: { label: 'tea', icon: '🍵', energy: 8, trust: 2, fits: ['minjae'] },
  sticker: { label: 'sticker', icon: '✨', energy: 4, trust: 3, fits: ['jinwoo'] },
  charm: { label: 'phone charm', icon: '🧷', energy: 3, trust: 4, fits: ['minjae', 'jinwoo'] },
  meme: { label: 'meme', icon: '💿', energy: 6, trust: 2, fits: ['jinwoo'] }
};
const agentGiftCatalog = {
  minjae: [
    { label: 'annotated receipt', icon: '🧾', reason: 'he noticed a pattern' },
    { label: 'tea packet', icon: '🍵', reason: 'quiet company' },
    { label: 'folded note', icon: '✉️', reason: 'low-drama care' }
  ],
  jinwoo: [
    { label: 'sticker bomb', icon: '💖', reason: 'activated affection' },
    { label: 'cursed meme', icon: '💿', reason: 'emotional support chaos' },
    { label: 'tiny charm', icon: '🧷', reason: 'he got attached, unfortunately' }
  ]
};
const gifts = [];
const deskObjects = [];
const whispers = [];
const trustEvents = [];

const userMemory = {
  turns: 0,
  kindness: 0,
  pressure: 0,
  repair: 0,
  vents: 0,
  ignoredAbsences: 0,
  lastIntent: 'none',
  lastSeen: Date.now()
};

function saveLocalState() {
  try {
    const payload = { agents, drives, goalQueues, goalCooldowns, goalLog, identityState, agentRelations, gifts, deskObjects, ambientLog, whispers, trustEvents, userMemory, savedAt: Date.now() };
    localStorage.setItem('konsetPresenceV3', JSON.stringify(payload));
    localStorage.setItem('konsetPresenceV2', JSON.stringify(payload));
  } catch {}
}

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem('konsetPresenceV3') || localStorage.getItem('konsetPresenceV2') || 'null');
    if (!saved) return;
    Object.entries(saved.agents || {}).forEach(([name, values]) => {
      if (!agents[name]) return;
      Object.assign(agents[name], values);
      if (!Array.isArray(agents[name].debtBacklog)) agents[name].debtBacklog = [];
      if (agents[name].openDebt && !agents[name].debtBacklog.length) {
        agents[name].debtBacklog.push({ ...agents[name].openDebt, id: `legacy-debt-${Date.now()}`, status: 'open' });
        agents[name].openDebt = null;
      }
    });
    Object.entries(saved.drives || {}).forEach(([name, values]) => {
      if (drives[name]) Object.assign(drives[name], values);
    });
    Object.entries(saved.goalQueues || {}).forEach(([name, queue]) => {
      if (goalQueues[name]) goalQueues[name] = queue.slice(-8);
    });
    Object.entries(saved.goalCooldowns || {}).forEach(([name, values]) => {
      if (goalCooldowns[name]) Object.assign(goalCooldowns[name], values);
    });
    Object.entries(saved.goalLog || {}).forEach(([name, log]) => {
      if (goalLog[name]) goalLog[name] = log.slice(-14);
    });
    Object.entries(saved.identityState || {}).forEach(([name, values]) => {
      if (!identityState[name]) return;
      if (values.values) Object.assign(identityState[name].values, values.values);
      identityState[name].regrets = Array.isArray(values.regrets) ? values.regrets.slice(0, 5) : [];
      identityState[name].outcomeHistory = Array.isArray(values.outcomeHistory) ? values.outcomeHistory.slice(-12) : [];
      identityState[name].selfNarrative = Array.isArray(values.selfNarrative) ? values.selfNarrative.slice(0, 3) : [];
      identityState[name].lastIdentityGoalAt = Number(values.lastIdentityGoalAt || 0);
    });
    if (saved.agentRelations?.minjae_jinwoo) Object.assign(agentRelations.minjae_jinwoo, saved.agentRelations.minjae_jinwoo);
    (saved.gifts || []).slice(-10).forEach(g => gifts.push(g));
    (saved.deskObjects || []).slice(-12).forEach(o => deskObjects.push(o));
    (saved.ambientLog || []).slice(-14).forEach(e => ambientLog.push(e));
    (saved.whispers || []).slice(-10).forEach(w => whispers.push(w));
    (saved.trustEvents || []).slice(-12).forEach(t => trustEvents.push(t));
    if (saved.userMemory) Object.assign(userMemory, saved.userMemory);
    const hoursAway = (Date.now() - (saved.savedAt || Date.now())) / 3600000;
    generateAmbientSince(saved.savedAt || Date.now());
    simulateElapsedTime(hoursAway);
  } catch {}
}

function stamp(time = Date.now()) {
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateUserMemory(intent, text) {
  userMemory.turns += 1;
  userMemory.lastIntent = intent;
  userMemory.lastSeen = Date.now();

  if (intent === 'flirt') userMemory.pressure += 1;
  if (intent === 'vent') userMemory.vents += 1;
  if (intent === 'thanks') userMemory.kindness += 1;
  if (/\b(sorry|my bad|i understand|that's fair|thats fair|respect|boundary|take your time)\b/i.test(text)) {
    userMemory.repair += 1;
    userMemory.pressure = Math.max(0, userMemory.pressure - 1);
  }

  if (!['flirt', 'vent'].includes(intent)) userMemory.pressure = Math.max(0, userMemory.pressure - 0.25);
}

function relationshipClimate() {
  const care = userMemory.kindness + userMemory.repair;
  const strain = userMemory.pressure + Math.max(0, userMemory.vents - 2) * 0.25 + userMemory.ignoredAbsences * 0.5;
  if (strain >= care + 5) return 'strained';
  if (care >= strain + 4) return 'safe';
  return 'uncertain';
}

// V7: Asymmetric Information Restriction
function addAmbient(actor, text, icon = '·') {
  if (actor !== 'system' && actor !== 'you' && drives[actor]) {
     if (drives[actor].privacy > 85 && (text.includes('goal') || text.includes('thought'))) {
         text = `[System Note: Action executed by ${actor.toUpperCase()}; text payload encrypted due to elevated boundary pressure constraints.]`;
         icon = '🔒';
     }
  }
  ambientLog.push({ at: Date.now(), actor, text, icon });
  while (ambientLog.length > 16) ambientLog.shift();
  renderAmbientLog();
  saveLocalState();
}

function generateAmbientSince(since) {
  const elapsedMinutes = Math.floor((Date.now() - since) / 60000);
  if (elapsedMinutes < 20) return;
  const count = Math.min(4, Math.max(1, Math.floor(elapsedMinutes / 90)));
  const events = [
    ['minjae', 'reorganized the local directory cache.', '🗂️'],
    ['jinwoo', 'attempted to rename the studio font to drama-bold.', '💿'],
    ['jinwoo', 'left a digital sour candy on the desk.', '🍬'],
    ['minjae', 'rolled back one of Jinwoo’s cosmetic emergencies.', '↩️'],
    ['minjae', 'made tea and did not announce it.', '🍵'],
    ['jinwoo', 'sticker-bombed the corner of the presence shelf.', '✨'],
    ['system', 'energy drift recalculated while you were out.', '◌']
  ];
  for (let i = 0; i < count; i++) {
    const [actor, text, icon] = pickFrom(events);
    ambientLog.push({ at: Date.now() - (count - i) * 900000, actor, text, icon });
  }
}

function maybeWithdrawGift(name, reason = 'went quiet') {
  if (!deskObjects.length || Math.random() > AGENCY.giftWithdrawChance) return false;
  const index = deskObjects.findIndex(o => o.to === name || o.from === name || o.from === 'you');
  if (index < 0) return false;
  const [removed] = deskObjects.splice(index, 1);
  addAmbient(name, `moved the ${removed.label} off the desk for now.`, '◌');
  renderDeskObjects();
  saveLocalState();
  return true;
}

function maybeSilentAbsence(name, decision, prompt) {
  const climate = relationshipClimate();
  const a = agents[name];
  const strained = climate === 'strained' || userMemory.pressure >= AGENCY.userPressureThreshold;
  const chance = AGENCY.silentNoResponseChance + (strained ? 0.2 : 0) + (a.energy < 18 ? 0.2 : 0);
  if (decision.suggested_action !== 'go_quiet' && decision.suggested_action !== 'refuse') return false;
  if (Math.random() > chance) return false;

  const row = document.querySelector(`.agent-row[data-agent="${name}"]`);
  if (row) row.querySelector('.agent-status').textContent = name === 'minjae' ? 'AWAY FROM THE DESK' : 'NOT ANSWERING RN';
  chatHistory.push({ role: 'user', text: prompt }, { role: 'system', text: `${name} did not visibly respond.` });
  userMemory.ignoredAbsences += 1;
  state.lastSilentAbsence = Date.now();
  maybeWithdrawGift(name, 'silent absence');
  setTimeout(() => addAmbient(name, `did not answer immediately. ${name === 'minjae' ? 'The kettle clicked off.' : 'One message was typed, then deleted.'}`, '…'), 2500);
  renderAgencyPanel();
  saveLocalState();
  return true;
}

async function maybeAgentInitiatesFromState() {
  const idleSec = (Date.now() - state.interaction) / 1000;
  if (idleSec < AGENCY.agentInitiationMinIdleSec || Date.now() - state.lastAgentInitiation < 55000) return;
  if (!document.hasFocus() || !document.getElementById('typing')?.hidden) return;

  const debtCandidate = Object.keys(agents)
    .map(name => ({ name, directive: maybeSurfaceDebt(name) }))
    .find(c => c.directive);

  if (debtCandidate) {
    const { name, directive } = debtCandidate;
    state.lastAgentInitiation = Date.now();
    const line = await getGoalLanguage(name, directive);
    showTyping(name, () => {
      addMessage(name, line);
      addAmbient(name, `followed up on something he’d let slide (${directive.subject}).`, name === 'minjae' ? '◌' : '✨');
      state.interaction = Date.now();
      saveLocalState();
    });
    return;
  }

  const candidates = Object.keys(agents)
    .map(name => ({ name, intention: pickIntention(name) }))
    .filter(c => c.intention && c.intention.score > 0.6)
    .sort((x, y) => y.intention.score - x.intention.score);

  if (candidates.length) {
    const { name, intention } = candidates[0];
    noteCompetingGoal(name, intention);
    state.lastAgentInitiation = Date.now();
    const outcome = resolveGoalOutcome(name, intention.goal, intention);
    const line = await getGoalLanguage(name, outcome.directive);
    showTyping(name, () => {
      addMessage(name, line);
      if (outcome.status === 'completed' && (intention.goal.action === 'leave-object' || intention.goal.type === 'gesture')) {
        agentLeavesGift(name, `goal: ${intention.goal.templateId}`);
      }
      addAmbient(name, outcome.status === 'backfire'
        ? `acted on a held goal (${intention.goal.templateId}) — it didn’t land the way he meant it to.`
        : `acted on a held goal (${intention.goal.templateId}), not a timer.`, name === 'minjae' ? '◌' : '✨');
      state.interaction = Date.now();
      saveLocalState();
    });
    return;
  }

  const entries = Object.entries(agents);
  const [name, a] = pickFrom(entries);
  const climate = relationshipClimate();
  const restless = name === 'jinwoo' && (a.energy > 88 || Math.random() < 0.25);
  const low = a.energy < 22;
  const highTrust = a.trust > AGENCY.trustHigh;
  const shouldInitiate = restless || highTrust || low || Math.random() < 0.18;
  if (!shouldInitiate) return;

  state.lastAgentInitiation = Date.now();
  const lines = {
    minjae: low
      ? ['I’m not very verbal right now. I’m still here.', 'I had a quiet hour. I don’t need you to fix it.']
      : highTrust
        ? ['I saved something for you on the desk.', 'You crossed my mind. That is all.']
        : ['I changed my mind about something from earlier.', 'Small update: I think the room works better messy.'],
    jinwoo: restless
      ? ['HELLO i am unsupervised and emotionally available for nonsense', 'i have been normal for too long and require enrichment']
      : highTrust
        ? ['i left you something and i’m pretending it’s casual', 'not to be dramatic but the desk missed you']
        : ['okay random thought—', 'i moved a sticker and now it feels legally significant']
  };

  showTyping(name, () => {
    addMessage(name, pickFrom(lines[name]));
    if (highTrust || restless) agentLeavesGift(name, 'agent-initiated presence');
    if (low) maybeWithdrawGift(name, 'low social battery');
    addAmbient(name, `initiated from internal state, not user input.`, name === 'minjae' ? '◌' : '✨');
    state.interaction = Date.now();
    saveLocalState();
  });
}

function renderAmbientLog() {
  const list = document.getElementById('ambientList');
  if (!list) return;
  if (!ambientLog.length) {
    list.innerHTML = '<small class="empty-log">no background activity yet</small>';
    return;
  }
  list.innerHTML = ambientLog.slice(-7).reverse().map(e => `
    <div class="ambient-entry"><span>${e.icon}</span><p><b>${stamp(e.at)} · ${e.actor}</b>${e.text}</p></div>`).join('');
}

function addDeskObject(item) {
  const id = `${item.from}-${item.label}-${Date.now()}`;
  deskObjects.push({ ...item, id, x: 8 + Math.random() * 76, y: 18 + Math.random() * 58, age: 0 });
  while (deskObjects.length > 10) deskObjects.shift();
  renderDeskObjects();
  saveLocalState();
}

function renderDeskObjects() {
  const layer = document.getElementById('deskObjectLayer');
  if (!layer) return;
  layer.innerHTML = deskObjects.map(o => `
    <button class="desk-object ${o.from === 'you' ? 'object-user' : 'object-agent'}" type="button" style="left:${o.x}%;top:${o.y}%" title="${o.from} → ${o.to}: ${o.reason}">
      <span>${o.icon}</span><small>${o.label}</small>
    </button>`).join('');
}

function addTrust(name, amount, reason) {
  if (!agents[name]) return;
  agents[name].trust = Math.max(0, Math.min(100, agents[name].trust + amount));
  trustEvents.push({ at: Date.now(), name, amount, reason });
  while (trustEvents.length > 12) trustEvents.shift();
  renderTrustPanel();
  renderAgencyPanel();
  saveLocalState();
}

function renderTrustPanel() {
  const panel = document.getElementById('trustPanel');
  if (!panel) return;
  Object.entries(agents).forEach(([name, a]) => {
    const meter = panel.querySelector(`[data-trust-meter="${name}"]`);
    const value = panel.querySelector(`[data-trust-value="${name}"]`);
    const label = panel.querySelector(`[data-trust-label="${name}"]`);
    if (meter) meter.style.width = `${Math.round(a.trust)}%`;
    if (value) value.textContent = Math.round(a.trust);
    if (label) label.textContent = a.trust >= AGENCY.trustHigh ? 'close / trusted' : a.trust <= AGENCY.trustLow ? 'guarded' : 'warming up';
  });
}

function trustForWhisper(name, text) {
  const other = otherAgent(name);
  const a = agents[name];
  const risky = /don'?t tell|secret|hide|lie|manipulate|make him|make her|jealous|private/i.test(text);
  const willLeak = risky && (a.trust < AGENCY.trustLeakRisk || agents[other].trust > a.trust + 12 || Math.random() < 0.25);
  whispers.push({ at: Date.now(), to: name, text, leaked: willLeak });
  addTrust(name, risky ? -4 : 2, risky ? 'private pressure' : 'trusted whisper');
  if (willLeak) addTrust(other, 2, `${name} disclosed a whisper`);
  return { risky, willLeak, other };
}

const refusalLines = {
  minjae: [
    "Not tonight. I'm not unavailable, I'm just not performing.",
    "I hear it. I'm just not going there with you right now.",
    "That's a no from me tonight — not because of you, just where I'm at."
  ],
  jinwoo: [
    "LMAO absolutely not, you're getting emotionally supervised, not seduced.",
    "hard veto from me bestie, ask again literally never",
    "i love you as a concept but the answer is no"
  ]
};
const redirectLines = {
  minjae: [
    "I'd rather just sit with you than perform something. Is that okay?",
    "Can we stay here instead of turning this into that?",
    "I like you better as this than as a bit."
  ],
  jinwoo: [
    "okay but what if instead we were unhinged FRIENDS about it",
    "redirecting: tell me what's actually going on with you today",
    "same energy, different category, let's go"
  ]
};
const teaseLines = {
  minjae: [
    "Careful. I might actually enjoy that.",
    "I'll allow one charm attempt. One.",
    "Mm. Try again, less obvious."
  ],
  jinwoo: [
    "oh we're doing THIS today. bold.",
    "i see you. i'm choosing to be normal about it",
    "flattered, unbothered, moving on (not really)"
  ]
};
const quietStatus = {
  minjae: 'PRESENT. JUST QUIET TONIGHT.',
  jinwoo: 'HERE. NOT TALKING RIGHT NOW.'
};

function otherAgent(name) { return name === 'minjae' ? 'jinwoo' : 'minjae'; }
function pickFrom(list) { return list[Math.floor(Math.random() * list.length)]; }

function computeVolition(name, intent) {
  const a = agents[name];
  const decision = {
    agent: name, wants_to_engage: true, reason: 'default engagement',
    boundary_level: 'none', suggested_action: 'engage_warm', handoff_to: null
  };

  // V7: Event Interpretation for incoming user interaction
  const event = { type: 'interaction', intent, boundaryPressure: a.boundaryPressure, relationshipClimate: relationshipClimate() };
  interpretEvent(name, event);

  // V7: Attention Budget check
  if (a.attentionBudget < 15 && intent !== 'vent') {
    decision.wants_to_engage = false;
    decision.suggested_action = 'go_quiet';
    decision.reason = 'attention budget depleted';
    return decision;
  }
  a.attentionBudget = Math.max(0, a.attentionBudget - 10);

  const intention = pickIntention(name);
  if (intention) noteCompetingGoal(name, intention);
  if (intention && intention.score > 0.75 && intent !== 'flirt') {
    const { goal } = intention;
    if (goal.type === 'withdraw' && intent !== 'thanks') {
      Object.assign(decision, {
        wants_to_engage: false, suggested_action: goal.action === 'boundary-hold' ? 'refuse' : 'go_quiet',
        reason: `${name} is prioritizing active internal goal (${goal.templateId}) over new interaction`
      });
      return decision;
    }
    if (goal.type === 'repair' && goal.action === 'cross-talk') {
      decision.handoff_to = otherAgent(name);
      decision.reason = `${name} wants to pull the other agent into ${goal.subject || 'this'} before continuing`;
    }
  }

  const climate = relationshipClimate();
  if (climate === 'strained' && intent !== 'thanks') {
    a.boundaryPressure = Math.min(100, a.boundaryPressure + 10);
    a.energy = Math.max(0, a.energy - 3);
    adjustDrive(name, 'privacy', 4);
  } else if (climate === 'safe') {
    a.boundaryPressure = Math.max(0, a.boundaryPressure - 3);
  }

  if (a.trust < AGENCY.trustLow && intent !== 'thanks') {
    a.boundaryPressure = Math.min(100, a.boundaryPressure + 8);
  }

  if (intent === 'flirt') {
    a.boundaryPressure = Math.min(100, a.boundaryPressure + 22);
    adjustDrive(name, 'privacy', 6);
    
    // V7: Autonomous boundary decision based on mood instead of deterministic escalation
    if (a.boundaryPressure >= AGENCY.boundaryFirm) {
      if (a.mood.irritability > 60 || a.mood.warmth < 30) {
        Object.assign(decision, {
          wants_to_engage: false, boundary_level: 'hard', suggested_action: 'refuse',
          reason: 'autonomous boundary evaluation: maintain firm boundary due to high irritability/low warmth'
        });
      } else {
        Object.assign(decision, {
          wants_to_engage: false, boundary_level: 'firm', suggested_action: 'redirect_to_friendship',
          reason: 'autonomous boundary evaluation: softening boundary due to reasonable warmth'
        });
      }
      spawnGoal(name, 'decline-until-clear', 'the pressure to be romantic');
    } else if (a.boundaryPressure >= AGENCY.boundarySoft) {
      Object.assign(decision, {
        wants_to_engage: false, boundary_level: 'soft', suggested_action: 'redirect_to_friendship',
        reason: 'romantic tone is building faster than trust', handoff_to: otherAgent(name)
      });
    } else {
      decision.suggested_action = 'tease_deflect';
      decision.reason = 'light flirt, still within comfort — agent chooses to play rather than fully engage';
    }
    return decision;
  }

  if (intent === 'vent') {
    a.consecutiveVent += 1;
    a.energy = Math.max(0, a.energy - AGENCY.energyDrainVent);
    adjustDrive(name, 'connection', 3);
    if (a.consecutiveVent >= AGENCY.ventSpiralCount) {
      spawnGoal(name, 'consult-other-agent', 'you spiraling on the same thing');
      Object.assign(decision, {
        suggested_action: 'ask_other_to_handle', handoff_to: otherAgent(name),
        reason: `${name} notices the user spiraling and pulls the other agent in to stabilize`
      });
      return decision;
    }
  } else {
    a.consecutiveVent = 0;
  }

  if ((a.energy < AGENCY.energyQuietChance && Math.random() < 0.4) || (climate === 'strained' && Math.random() < 0.18)) {
    spawnGoal(name, 'take-space', 'needing a minute');
    Object.assign(decision, {
      wants_to_engage: false, suggested_action: 'go_quiet', reason: 'low social battery right now'
    });
    return decision;
  }

  decision.suggested_action = a.energy > 50 ? 'engage_warm' : 'engage_brief';
  a.energy = Math.max(0, a.energy - AGENCY.energyDrainNormal);
  a.trust = Math.min(100, a.trust + 1);
  a.boundaryPressure = Math.max(0, a.boundaryPressure - AGENCY.boundaryDecayPerTurn);
  return decision;
}

function renderGiftShelf() {
  const board = document.getElementById('giftBoard');
  if (!board) return;
  if (!gifts.length) {
    board.innerHTML = '<small class="empty-gifts">nothing left yet</small>';
    return;
  }
  board.innerHTML = gifts.slice(-6).map(g => `
    <span class="gift-token ${g.from === 'you' ? 'from-you' : 'from-agent'}" title="${g.from} → ${g.to}: ${g.reason}">
      <i>${g.icon}</i><b>${g.label}</b><em>${g.from === 'you' ? 'for ' + g.to : g.from}</em>
    </span>`).join('');
}

function leaveGift(type, to = state.activeAgent) {
  const gift = giftCatalog[type];
  if (!gift || !agents[to]) return;
  const a = agents[to];
  const isGoodFit = gift.fits.includes(to);

  // V7: Interpret Event & Priority-Based Refusal
  const event = { type: 'gift', item: gift.label, isGoodFit };
  interpretEvent(to, event);

  spawnGoal(to, 'accept-gift', `the ${gift.label} you left`);
  const intention = pickIntention(to);
  
  if (intention && intention.goal && intention.goal.templateId !== 'accept-gift' && intention.score > 0.6) {
    // A higher priority internal goal won over accepting the gift
    const placedAside = { from: 'you', to, ...gift, reason: `ignored due to ${intention.goal.templateId}` };
    gifts.push(placedAside);
    addAmbient(to, `noticed the ${gift.label}, but was too focused on ${intention.goal.subject || 'something else'} to accept it.`, gift.icon);
    renderGiftShelf();
    renderTrustPanel();
    saveLocalState();
    toast(`${to[0].toUpperCase() + to.slice(1)} noticed it, but didn't take it`);
    resolveGoal(to, intention.goal.id, 'completed'); // Consume the competing goal slightly
    return;
  }

  // Resolve the accept-gift goal
  if (intention && intention.goal && intention.goal.templateId === 'accept-gift') {
    resolveGoal(to, intention.goal.id, 'completed');
  }

  a.energy = Math.min(100, a.energy + gift.energy + (isGoodFit ? 3 : 0));
  a.boundaryPressure = Math.max(0, a.boundaryPressure - (isGoodFit ? 8 : 4));
  addTrust(to, gift.trust + (isGoodFit ? 1 : 0), isGoodFit ? `liked ${gift.label}` : `accepted ${gift.label}`);
  adjustDrive(to, 'curiosity', 5);
  spawnGoal(to, 'gift-response', `the ${gift.label} you left`);
  const placed = { from: 'you', to, ...gift, reason: isGoodFit ? 'good fit' : 'accepted politely' };
  gifts.push(placed);
  addDeskObject(placed);
  addAmbient(to, `${to} noticed the ${gift.label} you left.`, gift.icon);
  renderGiftShelf();
  renderDeskObjects();
  renderAmbientLog();
  renderTrustPanel();
  renderAgencyPanel();
  touchArtifact($('.gift-shelf'));
  toast(`${gift.label} left for ${to[0].toUpperCase() + to.slice(1)}`);
}

function agentLeavesGift(name, reason = 'after the conversation') {
  if (Math.random() > 0.28) return;
  const gift = pickFrom(agentGiftCatalog[name]);
  const placed = { from: name, to: 'you', ...gift, reason };
  gifts.push(placed);
  addDeskObject(placed);
  addAmbient(name, `left ${gift.label} on the desk.`, gift.icon);
  renderGiftShelf();
  touchArtifact($('.gift-shelf'));
  toast(`${name[0].toUpperCase() + name.slice(1)} left ${gift.label}`);
}

function renderAgencyPanel() {
  const panel = document.getElementById('agencyPanel');
  if (!panel || panel.hidden) return;
  Object.entries(agents).forEach(([name, a]) => {
    const row = panel.querySelector(`.agency-row[data-for="${name}"]`);
    if (!row) return;
    row.querySelector('.a-energy').textContent = Math.round(a.energy);
    row.querySelector('.a-trust').textContent = Math.round(a.trust);
    row.querySelector('.a-boundary').textContent = Math.round(a.boundaryPressure);
    const action = row.querySelector('.a-action');
    if (action) action.textContent = a.trust <= AGENCY.trustLow ? 'guarded' : a.energy < AGENCY.energyQuietChance ? 'quiet-risk' : 'available';
  });
  renderTrustPanel();
  renderGoalLayerPanel(panel);
}

function renderGoalLayerPanel(panel) {
  let box = panel.querySelector('#goalLayerBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'goalLayerBox';
    box.style.cssText = 'margin-top:10px;padding-top:8px;border-top:1px dashed #444;font-size:11px;line-height:1.5;';
    panel.appendChild(box);
  }
  const rows = Object.entries(goalQueues).map(([name, queue]) => {
    const active = queue.filter(g => g.status === 'active');
    const goalLines = active.length
      ? active.map(g => {
          const evaluation = evaluateGoal(name, g);
          const score = Number.isFinite(evaluation.score) ? evaluation.score.toFixed(2) : 'VETO';
          const principle = evaluation.principle.reasons.length ? ` · ${evaluation.principle.reasons.join(' | ')}` : '';
          return `${g.templateId} (${g.action}) — score ${score} — drive:${g.drive}=${Math.round(drives[name][g.drive] ?? 0)} — value:${Math.round(evaluation.valueAlignment * 100)}%${principle}`;
        }).join('<br>')
      : 'no active goal';
    const debts = (agents[name].debtBacklog || []).filter(d => d.status === 'open');
    const debt = debts.length ? `<br><i>debt backlog (${debts.length}): ${debts.map(d => d.subject).join(' · ')}</i>` : '';
    const hard = agents[name].hardBoundaryUntil > Date.now()
      ? `<br><i>hard boundary active — attempt #${agents[name].boundaryOverrideAttempts}, until ${stamp(agents[name].hardBoundaryUntil)}</i>` : '';
    const values = Object.entries(identityState[name].values).sort((a, b) => b[1] - a[1])
      .map(([key, value]) => `${key}:${Math.round(value)}`).join(' · ');
    const regret = unresolvedRegret(name);
    const history = identityState[name].outcomeHistory;
    const lastOutcome = history.length ? history[history.length - 1] : null;
    const trace = (goalLog[name] || []).slice(-3).reverse().map(l =>
      `<div style="opacity:.65">${stamp(l.at)} · ${l.templateId}${l.selectedScore != null ? ` [${l.selectedScore.toFixed(2)}]` : ''}: ${l.note}</div>`).join('');
    return `<div><b>${name}</b>:<br>${goalLines}${debt}${hard}<br><i>values: ${values}</i><br><i>principles: no coercion · privacy before disclosure · repair before performance · no manipulation</i>${regret ? `<br><i>regret: ${regret.note}</i>` : ''}${lastOutcome ? `<br><i>last outcome: ${lastOutcome.templateId} → ${lastOutcome.outcome}</i>` : ''}${trace ? `<br>${trace}` : ''}</div>`;
  }).join('<hr style="border-color:#333;margin:4px 0">');
  box.innerHTML = `<div style="opacity:.7;margin-bottom:4px;">GOAL + IDENTITY LAYERS (live)</div>${rows}`;
}

function handleNonEngagement(name, decision, prompt, intent) {
  const other = decision.handoff_to;
  const row = document.querySelector(`.agent-row[data-agent="${name}"]`);

  if (maybeSilentAbsence(name, decision, prompt)) return;

  if (decision.suggested_action === 'go_quiet') {
    if (row) row.querySelector('.agent-status').textContent = quietStatus[name];
    toast(`${name[0].toUpperCase() + name.slice(1)} chose not to respond`);
    addAmbient(name, `stayed present without answering.`, '…');
    chatHistory.push({ role: 'user', text: prompt });
    renderAgencyPanel();
    return;
  }

  let line;
  if (decision.suggested_action === 'refuse' && decision.boundary_level === 'hard') {
    line = decision.line || pickFrom(refusalLines[name]);
    maybeWithdrawGift(name, 'hard boundary');
  }
  else if (decision.suggested_action === 'refuse') {
    line = pickFrom(refusalLines[name]);
    addTrust(name, -3, 'boundary pressure');
    maybeWithdrawGift(name, 'firm boundary');
  }
  else if (decision.suggested_action === 'redirect_to_friendship') {
    line = pickFrom(redirectLines[name]);
    addTrust(name, -1, 'soft boundary');
  }
  else if (decision.suggested_action === 'tease_deflect') line = pickFrom(teaseLines[name]);
  else if (decision.suggested_action === 'ask_other_to_handle') {
    line = name === 'jinwoo'
      ? "Pause. I'm not letting you turn this into a shame spiral."
      : "Hold on — I think Jinwoo should be loud about this with you for a second.";
  } else {
    line = pickReply(name, intent);
  }

  addMessage(name, line);
  chatHistory.push({ role: 'user', text: prompt }, { role: name, text: line });
  if (decision.suggested_action === 'redirect_to_friendship') agentLeavesGift(name, 'boundary without punishment');

  if (other && (decision.suggested_action === 'redirect_to_friendship' || decision.suggested_action === 'ask_other_to_handle')) {
    setTimeout(() => {
      const stabilizeLine = decision.suggested_action === 'ask_other_to_handle'
        ? (other === 'jinwoo'
            ? "okay he's right, also i'm yelling this with love: you're allowed to be a mess for a minute"
            : "He's right. Stay with the actual feeling, not the punishment loop.")
        : (other === 'jinwoo'
            ? "he's not wrong, i just say it louder"
            : "For what it's worth, I think that's the right call.");
      addMessage(other, stabilizeLine);
      chatHistory.push({ role: other, text: stabilizeLine });
    }, 850);
  }

  toast(decision.boundary_level === 'hard' ? `${name[0].toUpperCase() + name.slice(1)} held a hard boundary`
    : decision.suggested_action === 'refuse' ? `${name[0].toUpperCase() + name.slice(1)} set a boundary`
    : decision.suggested_action === 'ask_other_to_handle' ? 'Inter-agent intervention'
    : `${name[0].toUpperCase() + name.slice(1)} redirected`);
  renderAgencyPanel();
}

document.getElementById('agencyToggle')?.addEventListener('click', () => {
  const panel = document.getElementById('agencyPanel');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) renderAgencyPanel();
});

function pickReply(name, intent) {
  const pool = intentReplies[name][intent] || intentReplies[name].casual;
  return pool[Math.floor(Math.random() * pool.length)];
}

function chooseAgent(text, mention) {
  if (mention) return mention;
  if (/\b(lmao|lol|lmfao|meme|omg|screaming|crying)\b/i.test(text)) return 'jinwoo';
  if (/\b(think|explain|why|how|opinion|advice)\b/i.test(text)) return 'minjae';
  return state.activeAgent;
}

async function getGeminiReply(name, message, intent, allowCrosstalk) {
  if (location.protocol === 'file:') return null;
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: name,
        message,
        intent,
        allowCrosstalk,
        identityContext: compactIdentityContext(name),
        relationshipClimate: relationshipClimate(),
        history: chatHistory.slice(-10)
      })
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
const archives = {
  '02': 'SESSION 02 · We chose latency over instant response. Silence became part of the interface.',
  '11': 'SESSION 11 · Old decisions leave residue: a pale edge, a pinhole, a sentence half-erased.',
  '17': 'SESSION 17 · Presence is shown by touch. Active artifacts stay dark where hands return.'
};

function touchArtifact(el) {
  state.interaction = Date.now();
  el?.classList.remove('eroded');
  el?.classList.add('held');
  setTimeout(() => el?.classList.remove('held'), 1800);
}

function setAgent(name) {
  state.activeAgent = name;
  $$('.agent-row').forEach(row => row.classList.toggle('active', row.dataset.agent === name));
  $$('.persona-tab').forEach(tab => tab.classList.toggle('awake', tab.dataset.persona === name));
  $('.paper').classList.remove('agent-minjae', 'agent-jinwoo');
  $('.paper').classList.add(`agent-${name}`);
  const avatar = $('.typing-avatar');
  avatar.className = `typing-avatar tiny-avatar ${name}`;
  avatar.innerHTML = `<img src="${persona[name].portrait}" alt="" />`;
  $('#typingCopy').textContent = persona[name].typing;
  $('#typing').classList.toggle('jinwoo-typing', name === 'jinwoo');
  const row = $(`.agent-row[data-agent="${name}"]`);
  $('.agent-status', row).textContent = persona[name].statuses[Math.floor(Math.random() * persona[name].statuses.length)];
  touchArtifact($('.ledger'));
}

function addMessage(kind, text, extraClass = '') {
  const wrap = document.createElement('div');
  wrap.className = `message ${extraClass || `${kind}-msg`}`;
  if (kind === 'you') {
    wrap.classList.add('user-msg');
    wrap.innerHTML = `<div><b>YOU / NOW</b><p></p></div>`;
  } else {
    wrap.classList.add('agent-arrival');
    wrap.classList.add(`${kind}-energy`);
    const label = kind === 'jinwoo' ? 'jinwoo / now' : 'MINJAE / NOW';
    wrap.innerHTML = `<span class="tiny-avatar ${kind}"><img src="${persona[kind].portrait}" alt="" /></span><div><b>${label}</b><p></p></div>`;
  }
  $('p', wrap).textContent = text;
  $('#conversation').append(wrap);
  $('#conversation').scrollTop = $('#conversation').scrollHeight;
}

function showTyping(name, then) {
  setAgent(name);
  const tab = $(`.persona-tab[data-persona="${name}"]`);
  tab.classList.add('speaking');
  $('#typing').hidden = false;
  clearTimeout(state.replyTimer);
  state.replyTimer = setTimeout(() => {
    $('#typing').hidden = true;
    tab.classList.remove('speaking');
    then();
  }, 900 + Math.random() * 1200);
}

function respond(name, prompt = '') {
  showTyping(name, async () => {
    state.turns += 1;
    const intent = classifyIntent(prompt);
    updateUserMemory(intent, prompt);

    const decision = computeVolition(name, intent);
    if (!decision.wants_to_engage || !['engage_warm', 'engage_brief'].includes(decision.suggested_action)) {
      handleNonEngagement(name, decision, prompt, intent);
      return;
    }

    const allowCrosstalk = !['greeting', 'thanks', 'casual'].includes(intent) && Math.random() < CROSSTALK_RATE;
    const remote = await getGeminiReply(name, prompt, intent, allowCrosstalk);
    const trigger = /memory|remember|context|before/i.test(prompt);
    if (trigger && name === 'minjae') {
      const relay = document.createElement('div');
      relay.className = 'message relay-msg';
      relay.innerHTML = '<span class="tiny-avatar jinwoo">JW</span><div><b>CONTEXT RELAY · FROM JINWOO’S BACKLOG</b><p>“Presence is shown by touch. Active artifacts stay dark where hands return.”</p></div>';
      $('#conversation').append(relay);
      toast('Middleman shared Jinwoo’s session 17 artifact');
    }
    const speaker = remote?.speaker === 'jinwoo' || remote?.speaker === 'minjae' ? remote.speaker : name;
    const reply = remote?.reply?.trim() || pickReply(name, intent);
    addMessage(speaker, reply);
    chatHistory.push({ role: 'user', text: prompt }, { role: speaker, text: reply });
    if (intent === 'thanks') addTrust(speaker, 3, 'gratitude');
    if (intent === 'vent') addTrust(speaker, 1, 'stayed during vent');
    if (['thanks', 'vent', 'joke'].includes(intent)) agentLeavesGift(speaker, `${intent} response`);
    if (!remote && name === 'jinwoo') jinwooSpam(prompt, intent);
    if (remote?.interjection?.speaker && remote?.interjection?.reply && allowCrosstalk) {
      setTimeout(() => addMessage(remote.interjection.speaker, remote.interjection.reply), 700);
    }
    touchArtifact($('.thought-pile'));
    if (/@(minjae|jinwoo)/i.test(prompt) && /\b(but|disagree|wrong|are you sure|really)\b/i.test(prompt)) {
      showInterruption(name, name === 'minjae' ? 'I’m not mad. Keep going.' : 'wait are we fighting or flirting with the idea');
    } else if (!remote && allowCrosstalk) {
      const other = name === 'minjae' ? 'jinwoo' : 'minjae';
      setTimeout(() => followUp(other, name, intent), 900);
    }
    renderAgencyPanel();
  });
}

function jinwooSpam(prompt, intent) {
  if (!['joke', 'vent'].includes(intent)) return;
  const bursts = intent === 'vent'
    ? ['no wait come back', 'i have seventeen feelings about this', 'typing them all at once was a tactical error']
    : ['also', 'hold on i had a point', 'nvm it was a meme'];
  const count = Math.random() > .45 ? 2 : 1;
  bursts.slice(0, count).forEach((line, index) => {
    setTimeout(() => addMessage('jinwoo', line), 420 + index * 480);
  });
}

function showInterruption(name, line) {
  const el = $('#agentInterruption');
  el.querySelector('img').src = persona[name].portrait;
  el.querySelector('b').textContent = name === 'jinwoo' ? 'jinwoo interrupts himself' : 'MINJAE, GENTLY';
  el.querySelector('p').textContent = line;
  el.style.borderColor = name === 'minjae' ? '#a73930' : '#3f7079';
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 2800);
}

function followUp(name, first, intent) {
  showTyping(name, () => {
    const line = name === 'jinwoo'
      ? (intent === 'vent' ? 'yeah wait i’m with minjae on this one' : 'minjae said one calm sentence and now i have to live with it apparently')
      : (intent === 'joke' ? 'I hate that he made that funnier.' : 'He’s being dramatic, but he isn’t entirely wrong.');
    addMessage(name, line);
    toast(`${name[0].toUpperCase() + name.slice(1)} joined without being asked`);
  });
}

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el.timer);
  el.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

document.getElementById('ambientToggle')?.addEventListener('click', () => {
  const panel = document.getElementById('ambientPanel');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) renderAmbientLog();
});

document.getElementById('trustToggle')?.addEventListener('click', () => {
  const panel = document.getElementById('trustPanel');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) renderTrustPanel();
});

document.querySelectorAll('[data-whisper]').forEach(button => button.addEventListener('click', () => {
  const target = button.dataset.whisper;
  state.whisperTarget = state.whisperTarget === target ? null : target;
  document.querySelectorAll('[data-whisper]').forEach(b => b.classList.toggle('active', b.dataset.whisper === state.whisperTarget));
  document.getElementById('thoughtInput').placeholder = state.whisperTarget
    ? `Whisper to ${state.whisperTarget}… they decide whether to keep it.`
    : 'Try @Minjae, @Jinwoo, or write a thought…';
  toast(state.whisperTarget ? `Whisper channel opened to ${target}` : 'Whisper channel closed');
}));

$('#composer').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#thoughtInput');
  const text = input.value.trim();
  if (!text) return;
  const whisperTarget = state.whisperTarget;
  addMessage('you', whisperTarget ? `whisper to ${whisperTarget}: ${text}` : text);
  input.value = '';
  $('#mentionMenu').hidden = true;
  touchArtifact($('.thought-pile'));
  const mention = text.match(/@(minjae|jinwoo)/i)?.[1]?.toLowerCase();
  if (whisperTarget) {
    const result = trustForWhisper(whisperTarget, text);
    const target = whisperTarget;
    state.whisperTarget = null;
    document.querySelectorAll('[data-whisper]').forEach(b => b.classList.remove('active'));
    input.placeholder = 'Try @Minjae, @Jinwoo, or write a thought…';
    respond(target, text);
    if (result.willLeak) {
      setTimeout(() => {
        addMessage(result.other, result.other === 'minjae'
          ? `${target} told me what you whispered. I think we should keep this above the table.`
          : `${target} told me what you said btw. no secret-villain routes in my house.`);
        addAmbient(result.other, `received a leaked whisper from ${target}.`, '🫧');
      }, 1700);
    }
    return;
  }
  respond(chooseAgent(text, mention), text);
});

$('#thoughtInput').addEventListener('input', event => {
  const value = event.target.value;
  $('#mentionMenu').hidden = !/(^|\s)@[a-z]*$/i.test(value);
  if (/@minjae/i.test(value)) setAgent('minjae');
  if (/@jinwoo/i.test(value)) setAgent('jinwoo');
});

$$('[data-mention]').forEach(button => button.addEventListener('click', () => {
  const input = $('#thoughtInput');
  input.value = input.value.replace(/@[a-z]*$/i, button.dataset.mention + ' ');
  $('#mentionMenu').hidden = true;
  input.focus();
  setAgent(button.dataset.mention.slice(1).toLowerCase());
}));

$$('.agent-row').forEach(row => row.addEventListener('click', () => {
  setAgent(row.dataset.agent);
  $('#thoughtInput').value = `@${row.dataset.agent[0].toUpperCase()}${row.dataset.agent.slice(1)} `;
  $('#thoughtInput').focus();
  toast(row.dataset.agent === 'jinwoo' ? 'jinwoo is here. volume warning.' : 'Minjae pulled up a chair');
}));

$$('.polaroid').forEach(card => card.addEventListener('click', () => {
  const session = card.dataset.session;
  const relay = document.createElement('div');
  relay.className = 'message relay-msg';
  relay.innerHTML = `<span class="tiny-avatar jinwoo">JW</span><div><b>ARCHIVE RESTORED · ${session}</b><p></p></div>`;
  $('p', relay).textContent = archives[session];
  $('#conversation').append(relay);
  $('#conversation').scrollTop = $('#conversation').scrollHeight;
  touchArtifact($('.thought-pile'));
  touchArtifact($('.archive'));
  toast(`Session ${session} placed on the active page`);
}));

$$('[data-gift]').forEach(button => button.addEventListener('click', () => {
  leaveGift(button.dataset.gift, state.activeAgent);
}));
loadLocalState();
Object.keys(identityState).forEach(refreshSelfNarrative);
renderGiftShelf();
renderDeskObjects();
renderAmbientLog();
renderTrustPanel();

$('#holdToggle').addEventListener('change', event => {
  state.held = event.target.checked;
  $('.thought-pile').classList.toggle('held', state.held);
  toast(state.held ? 'Thought pile held in focus' : 'Erosion resumed');
});

$('#tipJar').addEventListener('click', () => {
  const signals = ['Minjae left the kettle on', 'jinwoo sent 6 messages and deleted 9', 'nobody is being productive. good.'];
  toast(signals[Math.floor(Math.random() * signals.length)]);
  touchArtifact($('#tipJar'));
  $('.liquid').style.height = `${48 + Math.random() * 22}%`;
});

$$('.artifact').forEach(el => el.addEventListener('pointerdown', () => touchArtifact(el)));

setInterval(() => {
  const idle = (Date.now() - state.interaction) / 1000;
  $$('.artifact').forEach((el, index) => {
    if (el.matches('.thought-pile') && state.held) return;
    if (idle > 7 + index * 1.6) el.classList.add('eroded');
  });
  if (idle > 5) {
    Object.entries(agents).forEach(([name, a]) => {
      a.energy = Math.min(100, a.energy + AGENCY.energyRegenPerIdleSec);
    });
    if (idle > 90 && Math.random() < 0.02) {
      
      // V7 Nonlinear satiation apex exponential nudge:
      if (drives.jinwoo.connection > 85) drives.jinwoo.connection = Math.min(100, drives.jinwoo.connection + Math.pow((drives.jinwoo.connection/10), 2) / 100);
      else adjustDrive('jinwoo', 'connection', 1);
      
      if (drives.minjae.stability > 85) drives.minjae.stability = Math.min(100, drives.minjae.stability + Math.pow((drives.minjae.stability/10), 2) / 100);
      else adjustDrive('minjae', 'stability', 1);
      
      Object.keys(agents).forEach(name => maybeGenerateGoalFromIdentity(name, 'idle'));
    }
    if (idle > 120 && Math.random() < 0.015) {
      maybeSpawnInterAgentGoal();
      resolveInterAgentGoals();
    }
    Object.values(agents).forEach(a => {
      if (a.hardBoundaryUntil && Date.now() > a.hardBoundaryUntil) a.boundaryOverrideAttempts = 0;
    });
    renderAgencyPanel();
    if (Date.now() - state.lastAmbientLog > 45000 && Math.random() < 0.08) {
      const actor = Math.random() > 0.5 ? 'minjae' : 'jinwoo';
      addAmbient(actor, actor === 'minjae' ? 'checked the desk and stayed quiet.' : 'moved one sticker three pixels to the left.', actor === 'minjae' ? '◌' : '✨');
      state.lastAmbientLog = Date.now();
    }
    maybeAgentInitiatesFromState();
    saveLocalState();
  }
}, 1000);
