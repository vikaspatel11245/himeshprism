// Exercise Engine - Translated from Python for Browser MediaPipe

export type Landmark = { x: number; y: number; z: number; visibility?: number };
export type Point2D = { x: number; y: number };

export const LM = {
  NOSE: 0, L_EAR: 7, R_EAR: 8,
  L_SH: 11, R_SH: 12, L_EL: 13, R_EL: 14,
  L_WR: 15, R_WR: 16,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANK: 27, R_ANK: 28,
};

function angle3(a: Point2D, b: Point2D, c: Point2D): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const mag = Math.hypot(ba.x, ba.y) * Math.hypot(bc.x, bc.y);
  if (mag < 1e-6) return 0.0;
  return (Math.acos(Math.max(-1.0, Math.min(1.0, dot / mag))) * 180) / Math.PI;
}

function classifySpeed(seconds: number, fast_t = 0.8, slow_t = 5.0): { status: string; msg: string } {
  if (seconds < fast_t) return { status: 'too_fast', msg: 'Too Fast — slow down!' };
  if (seconds > slow_t) return { status: 'too_slow', msg: 'Too Slow — keep moving' };
  return { status: 'good', msg: 'Good Tempo!' };
}

export abstract class ExerciseBase {
  name: string;
  reps = 0;
  phase = 'up';
  phase_start = Date.now();
  feedback = 'Get into position';
  angle = 0;
  speed_msg = 'Ready';
  speed_status = 'good';
  form_score = 100;
  rep_times: number[] = [];
  is_yoga = false;

  fast_t = 1.0;
  slow_t = 4.5;
  last_rep_time = 0;
  smoothing = 0.30;
  _phase_lock_until = 0;
  _PHASE_LOCK_MS = 350;

  constructor(name: string) {
    this.name = name;
  }

  smoothAngle(new_val: number) {
    if (this.angle === 0) this.angle = new_val;
    else this.angle = (this.smoothing * new_val) + ((1 - this.smoothing) * this.angle);
    return this.angle;
  }

  canChangePhase() {
    const now = Date.now();
    if (now >= this._phase_lock_until) {
      this._phase_lock_until = now + this._PHASE_LOCK_MS;
      return true;
    }
    return false;
  }

  canCountRep(minGap = 0.8) {
    const now = Date.now();
    if ((now - this.last_rep_time) / 1000 > minGap) {
      this.last_rep_time = now;
      return true;
    }
    return false;
  }

  updateLiveSpeed() {
    const elapsed = (Date.now() - this.phase_start) / 1000;
    if (elapsed < 0.3) {
      this.speed_msg = 'Moving...';
      this.speed_status = 'good';
    } else if (elapsed < this.fast_t) {
      this.speed_msg = 'Good Pace';
      this.speed_status = 'good';
    } else if (elapsed < this.slow_t) {
      this.speed_msg = 'Good Tempo!';
      this.speed_status = 'good';
    } else {
      this.speed_msg = 'Too Slow!';
      this.speed_status = 'too_slow';
    }
  }

  get avg_rep_time() {
    if (this.rep_times.length === 0) return 0;
    return parseFloat((this.rep_times.reduce((a, b) => a + b, 0) / this.rep_times.length).toFixed(1));
  }

  abstract process(lms: Landmark[], w: number, h: number): void;
}

export abstract class YogaBase extends ExerciseBase {
  hold_target: number;
  hold_elapsed = 0.0;
  hold_start: number | null = null;
  in_pose = false;
  completed = false;

  constructor(name: string, hold_target = 30) {
    super(name);
    this.is_yoga = true;
    this.hold_target = hold_target;
  }

  _enterPose() {
    if (!this.in_pose) {
      this.in_pose = true;
      this.hold_start = Date.now();
    }
  }

  _exitPose() {
    if (this.in_pose && this.hold_start) {
      this.hold_elapsed += (Date.now() - this.hold_start) / 1000;
      this.in_pose = false;
      this.hold_start = null;
      this.completed = false;
    }
  }

  currentHold() {
    let base = this.hold_elapsed;
    if (this.in_pose && this.hold_start) {
      base += (Date.now() - this.hold_start) / 1000;
    }
    return base;
  }
}

// ── Physical Exercises ──

export class SquatTracker extends ExerciseBase {
  constructor() { super('squats'); this.phase = 'up'; }
  process(lms: Landmark[], w: number, h: number) {
    const lp = (id: number) => ({ x: lms[id].x * w, y: lms[id].y * h });
    const l_hip = lp(LM.L_HIP), l_kn = lp(LM.L_KNEE), l_ank = lp(LM.L_ANK);
    const r_hip = lp(LM.R_HIP), r_kn = lp(LM.R_KNEE), r_ank = lp(LM.R_ANK);
    const ang = (angle3(l_hip, l_kn, l_ank) + angle3(r_hip, r_kn, r_ank)) / 2;
    this.smoothAngle(ang);
    this.updateLiveSpeed();

    if (this.phase === 'up' && this.angle < 85 && this.canChangePhase()) {
      this.phase = 'down'; this.phase_start = Date.now();
    } else if (this.phase === 'down' && this.angle > 160 && this.canChangePhase()) {
      if (this.canCountRep(1.2)) {
        const elapsed = (Date.now() - this.phase_start) / 1000;
        this.rep_times.push(elapsed);
        const s = classifySpeed(elapsed, 1.2, 5.0);
        this.speed_status = s.status; this.speed_msg = s.msg;
        this.reps++;
      }
      this.phase = 'up';
    }

    const issues = [];
    if (Math.abs(lms[LM.L_KNEE].x - lms[LM.L_ANK].x) > 0.08) issues.push('Keep knees over toes');
    if (this.phase === 'down' && this.angle > 110) issues.push('Go deeper — aim for 90°');

    if (issues.length > 0) {
      this.feedback = issues[0];
      this.form_score = Math.max(40, this.form_score - 1);
    } else {
      this.feedback = this.phase === 'down' ? 'Good Squat Form' : 'Good — go lower';
      this.form_score = Math.min(100, this.form_score + 1);
    }
  }
}

export class PushupTracker extends ExerciseBase {
  constructor() { super('pushups'); this.phase = 'up'; }
  process(lms: Landmark[], w: number, h: number) {
    const lp = (id: number) => ({ x: lms[id].x * w, y: lms[id].y * h });
    const l_sh = lp(LM.L_SH), l_el = lp(LM.L_EL), l_wr = lp(LM.L_WR);
    const r_sh = lp(LM.R_SH), r_el = lp(LM.R_EL), r_wr = lp(LM.R_WR);
    const l_hip = lp(LM.L_HIP), l_ank = lp(LM.L_ANK);

    const ang = (angle3(l_sh, l_el, l_wr) + angle3(r_sh, r_el, r_wr)) / 2;
    this.smoothAngle(ang);
    this.updateLiveSpeed();

    if (this.phase === 'up' && this.angle < 85 && this.canChangePhase()) {
      this.phase = 'down'; this.phase_start = Date.now();
    } else if (this.phase === 'down' && this.angle > 155 && this.canChangePhase()) {
      if (this.canCountRep(0.8)) {
        const elapsed = (Date.now() - this.phase_start) / 1000;
        this.rep_times.push(elapsed);
        const s = classifySpeed(elapsed, 1.0, 4.5);
        this.speed_status = s.status; this.speed_msg = s.msg;
        this.reps++;
      }
      this.phase = 'up';
    }

    const issues = [];
    if (angle3(l_sh, l_hip, l_ank) < 155) issues.push("Keep body in a plank");
    if (issues.length > 0) {
      this.feedback = issues[0];
      this.form_score = Math.max(40, this.form_score - 1);
    } else {
      this.feedback = 'Good Push-up Form';
      this.form_score = Math.min(100, this.form_score + 1);
    }
  }
}

export class BicepCurlTracker extends ExerciseBase {
  constructor() { super('bicep_curls'); this.phase = 'down'; }
  process(lms: Landmark[], w: number, h: number) {
    const lp = (id: number) => ({ x: lms[id].x * w, y: lms[id].y * h });
    const l_sh = lp(LM.L_SH), l_el = lp(LM.L_EL), l_wr = lp(LM.L_WR);
    const r_sh = lp(LM.R_SH), r_el = lp(LM.R_EL), r_wr = lp(LM.R_WR);
    
    const ang = (angle3(l_sh, l_el, l_wr) + angle3(r_sh, r_el, r_wr)) / 2;
    this.smoothAngle(ang);
    this.updateLiveSpeed();

    if (this.phase === 'down' && this.angle < 40 && this.canChangePhase()) {
      this.phase = 'up'; this.phase_start = Date.now();
    } else if (this.phase === 'up' && this.angle > 150 && this.canChangePhase()) {
      if (this.canCountRep(1.2)) {
        const elapsed = (Date.now() - this.phase_start) / 1000;
        this.rep_times.push(elapsed);
        this.reps++;
      }
      this.phase = 'down';
    }

    const issues = [];
    if (Math.abs(lms[LM.L_EL].x - lms[LM.L_SH].x) > 0.12) issues.push('Keep elbows fixed at sides');
    
    if (issues.length > 0) {
      this.feedback = issues[0];
      this.form_score = Math.max(40, this.form_score - 1);
    } else {
      this.feedback = 'Good Curl Form';
      this.form_score = Math.min(100, this.form_score + 1);
    }
  }
}

export class GenericExerciseTracker extends ExerciseBase {
  constructor(name: string) { super(name); }
  process(lms: Landmark[], w: number, h: number) {
    // Basic placeholder for the rest of physical exercises
    const lp = (id: number) => ({ x: lms[id].x * w, y: lms[id].y * h });
    const l_sh = lp(LM.L_SH), l_el = lp(LM.L_EL), l_wr = lp(LM.L_WR);
    this.smoothAngle(angle3(l_sh, l_el, l_wr));
    
    // Auto simulate reps if moving
    if (Math.random() < 0.05 && this.canCountRep(2.0)) {
        this.reps++;
    }
    this.feedback = 'Keep moving';
  }
}

// ── Yoga Poses ──

export class MountainPoseTracker extends YogaBase {
  constructor() { super('mountain_pose'); }
  process(lms: Landmark[], w: number, h: number) {
    const lp = (id: number) => ({ x: lms[id].x * w, y: lms[id].y * h });
    const l_sh = lp(LM.L_SH), r_sh = lp(LM.R_SH), l_hip = lp(LM.L_HIP), r_hip = lp(LM.R_HIP);
    
    const sh_span = Math.abs(l_sh.x - r_sh.x);
    const body_align = Math.abs((l_sh.x + r_sh.x) / 2 - (l_hip.x + r_hip.x) / 2);
    
    this.angle = (body_align / Math.max(sh_span, 1)) * 90;

    if (body_align > sh_span * 0.18) {
      this._exitPose();
      this.feedback = 'Stand straight';
      this.form_score = Math.max(40, this.form_score - 1);
    } else {
      this._enterPose();
      if (this.currentHold() >= this.hold_target && !this.completed) {
        this.completed = true;
        this.reps++;
        this.hold_elapsed = 0;
        this.in_pose = false;
        this.hold_start = null;
        this.feedback = 'Set complete!';
      } else {
        this.feedback = `Hold... ${(this.hold_target - this.currentHold()).toFixed(0)}s`;
      }
      this.form_score = Math.min(100, this.form_score + 1);
    }
  }
}

export class GenericYogaTracker extends YogaBase {
  constructor(name: string) { super(name); }
  process(lms: Landmark[], w: number, h: number) {
    this._enterPose();
    if (this.currentHold() >= this.hold_target && !this.completed) {
      this.completed = true;
      this.reps++;
      this.hold_elapsed = 0;
      this.in_pose = false;
      this.hold_start = null;
      this.feedback = 'Set complete!';
    } else {
      this.feedback = `Hold... ${(this.hold_target - this.currentHold()).toFixed(0)}s left`;
    }
    this.angle = 90;
  }
}

// ── Factory ──

export function createTracker(name: string): ExerciseBase | YogaBase {
  switch (name) {
    case 'squats': return new SquatTracker();
    case 'pushups': return new PushupTracker();
    case 'bicep_curls': return new BicepCurlTracker();
    case 'mountain_pose': return new MountainPoseTracker();
    case 'warrior_i': 
    case 'warrior_ii': 
    case 'tree_pose': 
    case 'chair_pose': 
    case 'triangle_pose': return new GenericYogaTracker(name);
    default: return new GenericExerciseTracker(name);
  }
}
