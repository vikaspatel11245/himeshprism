// Posture Engine - Translated from Python

export type Landmark = { x: number; y: number; z: number; visibility?: number };
export type Point3D = { x: number; y: number; z: number };

export const P = {
  NOSE: 0,
  L_EYE_I: 1, L_EYE: 2, L_EYE_O: 3, R_EYE_I: 4, R_EYE: 5, R_EYE_O: 6,
  L_EAR: 7, R_EAR: 8, MOUTH_L: 9, MOUTH_R: 10,
  L_SH: 11, R_SH: 12, L_EL: 13, R_EL: 14,
  L_WR: 15, R_WR: 16,
  L_PINKY: 17, R_PINKY: 18, L_INDEX: 19, R_INDEX: 20, L_THUMB: 21, R_THUMB: 22,
  L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26,
  L_ANK: 27, R_ANK: 28, L_HEEL: 29, R_HEEL: 30, L_FOOT: 31, R_FOOT: 32,
};

function avgFrames(frames: Landmark[][]): Landmark[] | null {
  if (!frames || frames.length === 0) return null;
  const n = frames.length;
  const k = frames[0].length;
  const result: Landmark[] = [];
  for (let j = 0; j < k; j++) {
    let x = 0, y = 0, z = 0, v = 0;
    for (let i = 0; i < n; i++) {
      x += frames[i][j].x;
      y += frames[i][j].y;
      z += frames[i][j].z;
      v += frames[i][j].visibility || 1.0;
    }
    result.push({ x: x / n, y: y / n, z: z / n, visibility: v / n });
  }
  return result;
}

function mid(a: Point3D, b: Point3D): Point3D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function hd(a: Point3D, b: Point3D): number {
  return Math.abs(a.y - b.y) * 100;
}

function sc(d: number, mx: number): number {
  return Math.max(0, Math.round(100 - (d / Math.max(mx, 0.001)) * 100));
}

function sd(arr: number[]): number {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length);
}

function angle3(a: Point3D, b: Point3D, c: Point3D): number {
  const ba = [a.x - b.x, a.y - b.y];
  const bc = [c.x - b.x, c.y - b.y];
  const dot = ba[0] * bc[0] + ba[1] * bc[1];
  const mag = Math.hypot(ba[0], ba[1]) * Math.hypot(bc[0], bc[1]);
  if (mag < 1e-6) return 0.0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

function col(s: number): string {
  return s >= 80 ? '#3fb950' : s >= 60 ? '#d29922' : '#f85149';
}

function lbl(s: number): string {
  return s >= 80 ? 'good' : s >= 60 ? 'fair' : 'poor';
}

export function runAnalysis(captured: Record<string, Landmark[][]>) {
  const F = avgFrames(captured['FRONT'] || []);
  const B = avgFrames(captured['BACK'] || []);
  const L = avgFrames(captured['LEFT'] || []);
  const R = avgFrames(captured['RIGHT'] || []);

  const metrics: any[] = [];
  const findings: any[] = [];

  function M(name: string, s: number, view: string) {
    metrics.push({ name, score: s, view, color: col(s), status: lbl(s) });
  }

  function F_(title: string, details: string[], s: number) {
    findings.push({ title, details, score: s, color: col(s), status: lbl(s) });
  }

  if (F) {
    const sd_val = hd(F[P.L_SH], F[P.R_SH]);
    const ss = sc(sd_val, 4);
    M('Shoulder Level', ss, 'Front');
    if (ss < 80) {
      const side = F[P.L_SH].y > F[P.R_SH].y ? 'Left' : 'Right';
      F_(`Uneven Shoulders — ${side} lower`, [
        `${side} shoulder ~${(sd_val * 0.9).toFixed(1)}° lower.`,
        'Stretch the elevated-side upper trapezius.',
        'Strengthen the depressed-side levator scapulae.'
      ], ss);
    }

    const hpd = hd(F[P.L_HIP], F[P.R_HIP]);
    const hs = sc(hpd, 4);
    M('Hip Level', hs, 'Front');
    if (hs < 80) {
      const side = F[P.L_HIP].y > F[P.R_HIP].y ? 'Left' : 'Right';
      F_(`Lateral Pelvic Tilt — ${side} hip lower`, [
        `${side} hip ~${(hpd * 0.9).toFixed(1)}° lower.`,
        'May indicate leg-length discrepancy.',
        'Hip-hike exercises + physiotherapy.'
      ], hs);
    }

    const ht = hd(F[P.L_EAR], F[P.R_EAR]);
    const hts = sc(ht, 3.5);
    M('Head Tilt', hts, 'Front');
    if (hts < 80) {
      const side = F[P.L_EAR].y > F[P.R_EAR].y ? 'Left' : 'Right';
      F_(`Head Tilts to the ${side}`, [
        `Ear height diff ~${(ht * 0.85).toFixed(1)}°.`,
        `Stretch ${side} SCM and scalene muscles.`,
        'Strengthen opposite neck side.'
      ], hts);
    }

    const msX = mid(F[P.L_SH], F[P.R_SH]).x;
    const mhX = mid(F[P.L_HIP], F[P.R_HIP]).x;
    const mkX = mid(F[P.L_KNEE], F[P.R_KNEE]).x;
    const maX = mid(F[P.L_ANK], F[P.R_ANK]).x;
    const xd = sd([msX, mhX, mkX, maX]) * 100;
    const sps = sc(xd, 2.5);
    M('Spinal Alignment', sps, 'Front');
    if (sps < 80) {
      F_('Lateral Spinal Deviation', [
        `Midline deviates (index=${xd.toFixed(1)}).`,
        'May indicate scoliosis or muscle imbalance.',
        'X-ray + physiotherapy evaluation recommended.'
      ], sps);
    }

    const lkd = Math.abs(F[P.L_KNEE].x - (F[P.L_HIP].x + F[P.L_ANK].x) / 2) * 100;
    const rkd = Math.abs(F[P.R_KNEE].x - (F[P.R_HIP].x + F[P.R_ANK].x) / 2) * 100;
    const ks = sc((lkd + rkd) / 2, 5);
    M('Knee Alignment', ks, 'Front');
    if (ks < 70) {
      F_('Knee Valgus / Varus', [
        `Knees deviate ${((lkd + rkd) / 2).toFixed(1)}% from axis.`,
        'Strengthen hip abductors and adductors.',
        'Check footwear for over-pronation.'
      ], ks);
    }

    const lDs = Math.abs(F[P.L_SH].x - msX) * 100;
    const rDs = Math.abs(F[P.R_SH].x - msX) * 100;
    M('Shoulder Symmetry', sc(Math.abs(lDs - rDs), 3), 'Front');

    const lc = angle3(F[P.L_SH], F[P.L_EL], F[P.L_WR]);
    const rc = angle3(F[P.R_SH], F[P.R_EL], F[P.R_WR]);
    const cs2 = sc(Math.abs(lc - rc), 15);
    M('Elbow Carry Angle', cs2, 'Front');
    if (cs2 < 75) {
      F_('Asymmetric Elbow Carry Angle', [
        `Left: ${lc.toFixed(1)}°  Right: ${rc.toFixed(1)}°  Diff: ${Math.abs(lc - rc).toFixed(1)}°.`,
        'Indicates asymmetric shoulder rotation.',
        'Strengthen rotator cuff bilaterally.'
      ], cs2);
    }
  }

  if (B) {
    const bsd = hd(B[P.L_SH], B[P.R_SH]);
    M('Shoulder (Back)', sc(bsd, 4), 'Back');
    const bmsX = mid(B[P.L_SH], B[P.R_SH]).x;
    const bmhX = mid(B[P.L_HIP], B[P.R_HIP]).x;
    const bmkX = mid(B[P.L_KNEE], B[P.R_KNEE]).x;
    const bmaX = mid(B[P.L_ANK], B[P.R_ANK]).x;
    const bxd = sd([bmsX, bmhX, bmkX, bmaX]) * 100;
    const bsps = sc(bxd, 2.5);
    M('Spine (Back)', bsps, 'Back');
    if (bsps < 80) {
      F_('Posterior Spinal Deviation', [
        `Back-view deviation (${bxd.toFixed(1)}) confirms scoliosis risk.`,
        'Specialist imaging strongly recommended.'
      ], bsps);
    }
    M('Hip Level (Back)', sc(hd(B[P.L_HIP], B[P.R_HIP]), 4), 'Back');
    const scap = Math.abs(Math.abs(B[P.L_SH].x - bmsX) - Math.abs(B[P.R_SH].x - bmsX)) * 100;
    const scS = sc(scap, 4);
    M('Scapular Symmetry', scS, 'Back');
    if (scS < 75) {
      F_('Scapular Asymmetry', [
        `Shoulder blades uneven by ${scap.toFixed(1)}%.`,
        'One scapula may be winged or protracted.',
        'Strengthen serratus anterior and middle trapezius.'
      ], scS);
    }
  }

  const SV = L || R;
  if (SV) {
    const sl_ = L ? 'Left' : 'Right';
    const earI = L ? P.L_EAR : P.R_EAR;
    const shI = L ? P.L_SH : P.R_SH;
    const hipI = L ? P.L_HIP : P.R_HIP;
    const knI = L ? P.L_KNEE : P.R_KNEE;
    const ankI = L ? P.L_ANK : P.R_ANK;
    const elI = L ? P.L_EL : P.R_EL;
    const wrI = L ? P.L_WR : P.R_WR;

    const fhp = Math.abs(SV[earI].x - SV[shI].x) * 100;
    const fhs = sc(fhp, 8);
    M('Forward Head', fhs, `${sl_} Side`);
    if (fhs < 75) {
      F_('Forward Head Posture', [
        `Ear ${fhp.toFixed(1)}% ahead of shoulder.`,
        'Each 2.5 cm forward adds ~4.5 kg neck load.',
        'Chin tucks 3×15 daily.'
      ], fhs);
    }

    const midX = (SV[hipI].x + SV[ankI].x) / 2;
    const sfwd = (SV[shI].x - midX) * 100;
    const rss = sc(Math.abs(sfwd), 7);
    M('Rounded Shoulders', rss, `${sl_} Side`);
    if (rss < 75) {
      const dir_ = sfwd > 0 ? 'forward' : 'backward';
      F_(`Shoulder Protraction (${Math.abs(sfwd).toFixed(1)}% ${dir_})`, [
        'Shoulder off neutral hip-ankle axis.',
        'Stretch pectorals minor.',
        'Strengthen rhomboids and lower trapezius.'
      ], rss);
    }

    const shY = SV[shI].y;
    const ankY = SV[ankI].y;
    const hipY = SV[hipI].y;
    const expY = shY + (ankY - shY) * 0.5;
    const hpd2 = Math.abs(hipY - expY) * 100;
    const ls = sc(hpd2, 6);
    M('Lumbar Curve', ls, `${sl_} Side`);
    if (ls < 75) {
      const tilt = hipY > expY ? 'Anterior' : 'Posterior';
      F_(`${tilt} Pelvic Tilt`, [
        `Hip ${hpd2.toFixed(1)}% off neutral.`,
        'Strengthen glutes and deep core.',
        'Stretch iliopsoas 3×30 s per side.'
      ], ls);
    }

    const knD = Math.abs(SV[knI].x - (SV[hipI].x + SV[ankI].x) / 2) * 100;
    const knSS = sc(knD, 8);
    M('Knee (Side)', knSS, `${sl_} Side`);
    if (knSS < 70) {
      F_('Knee Sagittal Misalignment', [
        `Knee ${knD.toFixed(1)}% off plumb line.`,
        'Risk of hyperextension.',
        'Balance quad and hamstring strength.'
      ], knSS);
    }

    const ea = angle3(SV[shI], SV[elI], SV[wrI]);
    const es = sc(Math.abs(180 - ea), 40);
    M('Elbow Flexion', es, `${sl_} Side`);
    if (es < 70) {
      F_(`Elbow Not Fully Relaxed (${ea.toFixed(0)}°)`, [
        'Arm appears bent rather than hanging straight.',
        'May indicate tension in biceps.',
        'Consciously relax arms during standing posture.'
      ], es);
    }

    const tl = (SV[hipI].x - SV[shI].x) * 100;
    const ts2 = sc(Math.abs(tl), 5);
    M('Trunk Lean', ts2, `${sl_} Side`);
    if (ts2 < 75) {
      const dir2 = tl > 0 ? 'forward' : 'backward';
      F_(`Trunk Leans ${dir2.charAt(0).toUpperCase() + dir2.slice(1)} (${Math.abs(tl).toFixed(1)}%)`, [
        'Upper body not vertically aligned over hips.',
        'Strengthen deep core (transversus abdominis).',
        'Check for pelvic tilt as root cause.'
      ], ts2);
    }
  }

  let overall = 0;
  if (metrics.length > 0) {
    overall = Math.round(metrics.reduce((acc, m) => acc + m.score, 0) / metrics.length);
  }

  return {
    overall,
    overall_color: col(overall),
    overall_status: lbl(overall),
    metrics,
    findings,
    views: Object.keys(captured)
  };
}
