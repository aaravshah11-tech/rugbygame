/**
 * Try Line tuning numbers, in one place. Units are metres, seconds and m/s.
 * Change a value here and it changes everywhere the engine uses it.
 *
 * Difficulty tables are keyed by easy / medium / hard / elite. Most of them only tilt
 * the CPU side (or help the user on easy); comments say which way a bigger number cuts.
 */
import type { Difficulty } from '../state/types';

type ByDifficulty = Record<Difficulty, number>;

export const CFG = {
  /** Running. Top speed = base + pace/100 * perPace, then the multipliers below. */
  run: {
    base: 4.6,
    perPace: 2.4, // average back ~6.3 m/s, a flyer ~7m/s
    carrierMult: 0.97, // the ball slows you a touch
    userMult: 1.04, // the player you control is a little quicker than his twin on CPU
    sprintMult: 1.24,
    tiredFloor: 0.85, // below half stamina, pace drops to this share of full
  },
  /** Stamina, as a 0..1 tank per second. */
  stamina: {
    sprintDrain: 0.14,
    chaseDrain: 0.1, // holding TACKLE to chase the carrier
    userRecover: 0.12,
    aiRecover: 0.08,
  },
  /** How close a defender has to be for a tackle to fire. */
  tackle: {
    /** pressing TACKLE */
    userPress: { easy: 2.4, medium: 1.75, hard: 1.6, elite: 1.3 } as ByDifficulty,
    /** holding TACKLE: fires automatically on arrival (a touch shorter than a press) */
    userHold: { easy: 2.2, medium: 1.65, hard: 1.5, elite: 1.2 } as ByDifficulty,
    /** CPU defenders */
    cpu: 1.05,
  },
  /** Longest carry of each kick at full power. */
  kickMax: { punt: 60, box: 38, grubber: 32, chip: 20, high: 44, touch: 62, cross: 50 },
  grubber: { vy: 3.2, restitution: 0.45, keep: 0.8, friction: 1.0 },
  replaySpeed: 0.45,
  difficulty: {
    /** added to CPU player ratings (negative on easy) */
    cpuRating: { easy: -8, medium: 3, hard: 6, elite: 12 } as ByDifficulty,
    /** user's edge when the rest of a match is simulated (bigger = user does better) */
    simEdge: { easy: 0.25, medium: -0.075, hard: -0.15, elite: -0.3 } as ByDifficulty,
    /** CPU defensive line speed bonus */
    cpuLineSpeed: { easy: -0.08, medium: 0.025, hard: 0.05, elite: 0.1 } as ByDifficulty,
    /** help for the user in tackles, breaks and fends (bigger = easier) */
    userAssist: { easy: 0.12, medium: -0.005, hard: -0.04, elite: -0.11 } as ByDifficulty,
    /** scatter on the user's passes (bigger = less accurate) */
    userPassError: { easy: 0.3, medium: 0.725, hard: 0.85, elite: 1.05 } as ByDifficulty,
    /** CPU players charging the user's conversions */
    cpuChargers: { easy: 1, medium: 2, hard: 3, elite: 3 } as ByDifficulty,
    /** extra chance the CPU wins a turnover at the user's rucks */
    cpuRuckSteal: { easy: -0.03, medium: 0.03, hard: 0.05, elite: 0.09 } as ByDifficulty,
    /** chance the CPU gives a penalty away at the user's rucks (bigger = more lenient) */
    cpuRuckOffside: { easy: 0.06, medium: 0.028, hard: 0.02, elite: 0.005 } as ByDifficulty,
    /** CPU maul shove */
    cpuMaulPush: { easy: 0.9, medium: 1.25, hard: 1.6, elite: 2 } as ByDifficulty,
    /** CPU scrum shove */
    cpuScrumPush: { easy: 0.55, medium: 0.79, hard: 0.86, elite: 1 } as ByDifficulty,
    /** CPU goal-kick success bonus */
    cpuGoalKick: { easy: -0.12, medium: 0.03, hard: 0.06, elite: 0.12 } as ByDifficulty,
    /** scatter on the user's goal kicks (bigger = harder) */
    userGoalKickError: { easy: 0.6, medium: 1.125, hard: 1.25, elite: 1.5 } as ByDifficulty,
  },
  /** Every prompt answers itself if the player does nothing (seconds of unpaused play). */
  prompts: {
    pickJumper: 4,
    timing: 8,
    guess: 6,
    placeKick: 20,
    penaltyChoice: 15,
    kickoffAim: 8,
    penaltyTouchAim: 10,
    /** last-resort engine safety net if a blocking prompt never answers at all */
    engineWatchdog: 15,
  },
};
