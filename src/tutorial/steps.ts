/**
 * The guided tutorial: ten steps, each made of small tasks that complete when the player actually
 * does them in the real engine (see game/engine/tutorial.ts).
 *
 * Button names in `text` must match the labels in ui/controls.tsx exactly (shown in capitals):
 * PASS, SPRINT, STEP, HAND-OFF, KICK, TACKLE, DIVE, SWITCH, ADD PLAYER, CONTEST, FAN OUT.
 * `glow` lists the buttons to pulse (data-k slugs on ActionButton; 'joystick' = the move stick).
 */
export type Gesture =
  | { kind: 'joystick' }
  | { kind: 'tap' | 'hold'; target: string }
  | { kind: 'swipe-up'; small?: boolean; medium?: boolean }
  | { kind: 'kick-swipe'; size: 'small' | 'medium' | 'big' }
  | { kind: 'conversion' }
  | { kind: 'mash'; target: string }
  | { kind: 'none' };

export interface TutTask {
  id: string;
  text: string;
  glow?: string[];
  gesture: Gesture;
}

export interface TutStep {
  id: TutStepId;
  title: string;
  tasks: TutTask[];
}

export type TutStepId = 'run' | 'pass' | 'evade' | 'try' | 'convert' | 'defend' | 'ruck' | 'kick' | 'setpiece' | 'match';

export const TUT_STEPS: TutStep[] = [
  {
    id: 'run',
    title: 'Running',
    tasks: [
      { id: 'run', text: 'Put your left thumb down anywhere on the left side and drag: the stick follows your thumb. Run forward.', glow: ['joystick'], gesture: { kind: 'joystick' } },
      { id: 'sprint', text: 'Now sprint: hold SPRINT (or push the stick right to the edge).', glow: ['sprint'], gesture: { kind: 'hold', target: 'sprint' } },
    ],
  },
  {
    id: 'pass',
    title: 'Passing',
    tasks: [
      { id: 'left', text: 'Tap ◀ PASS to pass to the runner on your left.', glow: ['pass-left', 'pass'], gesture: { kind: 'tap', target: 'pass-left' } },
      { id: 'right', text: 'Tap PASS ▶ to pass to your right.', glow: ['pass-right', 'pass'], gesture: { kind: 'tap', target: 'pass-right' } },
      { id: 'long', text: 'HOLD a PASS button, then let go, for a long pass that skips a runner.', glow: ['pass-left', 'pass-right', 'pass'], gesture: { kind: 'hold', target: 'pass-right' } },
    ],
  },
  {
    id: 'evade',
    title: 'Beat a defender',
    tasks: [
      { id: 'step', text: 'Tap STEP (or swipe up on the right of the screen) to sidestep the defender.', glow: ['step'], gesture: { kind: 'tap', target: 'step' } },
      { id: 'handoff', text: 'Run at the next defender. When HAND-OFF lights up, tap it to fend him off.', glow: ['hand-off'], gesture: { kind: 'tap', target: 'hand-off' } },
    ],
  },
  {
    id: 'try',
    title: 'Score a try',
    tasks: [{ id: 'try', text: 'Run the ball over the try line to score your first try! Use SPRINT to get there.', glow: ['joystick', 'sprint'], gesture: { kind: 'joystick' } }],
  },
  {
    id: 'convert',
    title: 'Conversion',
    tasks: [
      {
        id: 'kick',
        text: 'Swipe from the ball towards the posts: faster is longer. The wind arrow shows the breeze, so curve your swipe into it to bend the ball back.',
        gesture: { kind: 'conversion' },
      },
    ],
  },
  {
    id: 'defend',
    title: 'Defence',
    tasks: [
      { id: 'switch', text: 'You are defending. Tap SWITCH to take control of the defender nearest the ball.', glow: ['switch'], gesture: { kind: 'tap', target: 'switch' } },
      { id: 'tackle', text: 'Hold TACKLE: your player chases the carrier and tackles when he gets there.', glow: ['tackle'], gesture: { kind: 'hold', target: 'tackle' } },
      { id: 'dive', text: 'Now a dive tackle: get within a couple of metres and tap DIVE.', glow: ['dive'], gesture: { kind: 'tap', target: 'dive' } },
    ],
  },
  {
    id: 'ruck',
    title: 'Rucks',
    tasks: [
      { id: 'add', text: 'A ruck has formed over your ball. Tap ADD PLAYER to commit another forward for quicker ball.', glow: ['add-player'], gesture: { kind: 'tap', target: 'add-player' } },
      {
        id: 'def',
        text: 'Their ruck now. Tap CONTEST again and again to steal the ball, or FAN OUT to keep everyone in the defensive line.',
        glow: ['contest', 'fan-out'],
        gesture: { kind: 'mash', target: 'contest' },
      },
    ],
  },
  {
    id: 'kick',
    title: 'Kicking in play',
    tasks: [
      { id: 'grubber', text: 'Tap KICK: play goes into slow motion. Then a LITTLE swipe up anywhere grubbers the ball along the ground.', glow: ['kick'], gesture: { kind: 'kick-swipe', size: 'small' } },
      { id: 'chip', text: 'Tap KICK again, then a MEDIUM swipe chips it over the defence. The ring on the pitch shows where it will land.', glow: ['kick'], gesture: { kind: 'kick-swipe', size: 'medium' } },
      { id: 'punt', text: 'Tap KICK, then a BIG swipe kicks it long for territory. Swipe left or right to aim at the ring.', glow: ['kick'], gesture: { kind: 'kick-swipe', size: 'big' } },
    ],
  },
  {
    id: 'setpiece',
    title: 'Scrums & lineouts',
    tasks: [
      { id: 'scrum', text: 'Scrum! Swipe UP on SET when the marker is in the green, then keep swiping UP fast to drive them back.', gesture: { kind: 'none' } },
      { id: 'lineout', text: 'Lineout! Pick a jumper (Front, Middle or Back), then TAP or SWIPE when the marker hits the green to throw it in straight.', gesture: { kind: 'none' } },
    ],
  },
  {
    id: 'match',
    title: 'Mini match',
    tasks: [{ id: 'play', text: 'Put it all together: a 3-minute match against an Easy side. Tips pop up the first time each situation happens.', gesture: { kind: 'none' } }],
  },
];

/** Contextual tips: shown once each, in the first 3 matches (and the tutorial mini match). */
export const MATCH_TIPS = {
  penalty: { title: 'Penalty', text: 'You won a penalty. Kick at goal for 3 points, kick to touch for a lineout near their line, or tap and go.' },
  lineout: { title: 'Lineout', text: 'Pick a jumper, then TAP or SWIPE when the marker hits the green. Back is hard to steal but tricky to throw.' },
  maul: { title: 'Maul', text: 'Swipe UP each time the arrow fills to drive the maul forward. Defending? COLLAPSE it, but risk a penalty.' },
  advantage: { title: 'Advantage', text: 'The referee is playing advantage: keep going. If nothing comes of it, play comes back for the penalty.' },
  sinbin: { title: 'Sin bin', text: 'A player has been yellow carded: their team is down to 14 for 10 minutes. Attack the space!' },
  scrum: { title: 'Scrum', text: 'Swipe UP on SET when the marker is in the green, then keep swiping UP fast to push.' },
  ruck: { title: 'Ruck', text: 'Attacking: ADD PLAYER for quicker ball. Defending: CONTEST to steal it, FAN OUT to fill the line.' },
  kickoff: { title: 'Kick-off', text: 'Drag to aim your restart: short to win it back, long to pin them in their half.' },
} as const;
export type TipId = keyof typeof MATCH_TIPS;
