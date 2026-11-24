/**
 * Tuning numbers for the match engine in one place. Units: metres, seconds, m/s.
 * Change a value here and it changes everywhere the engine uses it.
 */
export const CFG = {
  prompts: {
    /** a blocking prompt (scrum, lineout, maul...) that gets no answer resolves itself after this long */
    engineWatchdog: 15,
  },
} as const;
