// SM-2 spaced repetition algorithm
// quality: 0-2 = wrong, 3 = barely correct, 4 = correct, 5 = easy

export type SM2State = {
  interval_days: number;
  easiness_factor: number;
  correct_streak: number;
};

export function sm2(
  quality: number, // 0–5
  state: SM2State
): SM2State & { next_review_date: string } {
  const { interval_days, easiness_factor, correct_streak } = state;

  let newEF = easiness_factor;
  let newInterval: number;
  let newStreak: number;

  if (quality < 3) {
    // Wrong — reset interval, keep EF
    newInterval = 1;
    newStreak = 0;
  } else {
    // Correct — update EF and interval
    newEF = Math.max(
      1.3,
      easiness_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    );
    if (correct_streak === 0) {
      newInterval = 1;
    } else if (correct_streak === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval_days * newEF);
    }
    newStreak = correct_streak + 1;
  }

  const next = new Date();
  next.setDate(next.getDate() + newInterval);

  return {
    interval_days: newInterval,
    easiness_factor: Math.round(newEF * 100) / 100,
    correct_streak: newStreak,
    next_review_date: next.toISOString().split('T')[0],
  };
}

// Map practice outcome to SM-2 quality score
export function outcomeToQuality(
  isCorrect: boolean,
  failureType: string | null,
  timeTaken: number,
  targetTime = 105 // 1:45 MCAT target
): number {
  if (!isCorrect) {
    if (failureType === 'CARELESS') return 2;
    if (failureType === 'TIME_PRESSURE') return 2;
    return 1; // KNOWLEDGE_GAP or REASONING_GAP
  }
  // Correct — grade by speed
  if (timeTaken <= targetTime * 0.7) return 5; // fast and correct
  if (timeTaken <= targetTime) return 4;        // on time
  return 3;                                      // slow but correct
}
