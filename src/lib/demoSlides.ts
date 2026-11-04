import { BroadcastOrientation, DemoBoardSpec, SlideDescriptor, SlideSourceType, Subject } from '../types';

export const JEE_TRIAL_SLIDES: SlideDescriptor[] = [
  {
    index: 0,
    label: 'Page 01 · Rotational MOI Master Sheet',
    sourceType: SlideSourceType.DEMO_BOARD,
    demoSpec: {
      heading: 'Rotational Mechanics · Standard Moment of Inertia',
      subtopic: 'Parallel & Perpendicular Axis Theorems (JEE Main + Adv)',
      subject: Subject.PHYSICS,
      formulas: [
        'I_parallel = I_cm + M · d²   (Valid for ANY 3D body; axis ∥ to CM axis)',
        'I_z = I_x + I_y              (ONLY for planar 2D lamina; z ⊥ plane)',
        'Thin Rod (L):  I_center = ML²/12   |   I_end = ML²/3',
        'Solid Sphere:  I_cm = (2/5)MR²     |   Hollow Sphere: I_cm = (2/3)MR²',
        'Disc / Cylinder: I_cm = MR²/2      |   In-plane Diameter = MR²/4',
      ],
      examTrap: 'TRAP: Cutting a sector θ out of a uniform disc of mass m leaves I = mR²/2 about the ORIGINAL center axis (if m is remaining mass)!',
      keyPoints: [
        'Always verify whether given mass M is original full mass or remaining cut mass.',
        'Radius of gyration K = √(I / M) shifts with axis choice.',
      ],
    },
  },
  {
    index: 1,
    label: 'Page 02 · Pure Rolling on Inclined Plane',
    sourceType: SlideSourceType.DEMO_BOARD,
    demoSpec: {
      heading: 'Pure Rolling Without Slipping · Incline Dynamics',
      subtopic: 'Acceleration, Static Friction & Minimum μ_s Condition',
      subject: Subject.PHYSICS,
      formulas: [
        'Constraint at Contact Point P:   v_cm = ω · R    and    a_cm = α · R',
        'a_cm = (g · sin θ) / (1 + I_cm / MR²) = g · sin θ / (1 + β)',
        'f_static = (M · g · sin θ) / (1 + MR² / I_cm)   [Acts UP the incline]',
        'No-Slip Condition:   μ_s ≥ tan θ / (1 + MR² / I_cm)',
      ],
      examTrap: 'TRAP: Work done by static friction in pure rolling on a FIXED incline is ZERO—mechanical energy is strictly conserved!',
      keyPoints: [
        'Race order down incline (smallest β = I/MR² wins): Solid Sphere (0.4) > Disc (0.5) > Hollow Sphere (0.67) > Ring (1.0).',
        'If External Force acts at height h = β·R above center on rough horizontal ground, friction f = 0.',
      ],
    },
  },
  {
    index: 2,
    label: 'Page 03 · Angular Momentum & Collision About Hinge',
    sourceType: SlideSourceType.DEMO_BOARD,
    demoSpec: {
      heading: 'Conservation of Angular Momentum (COAM)',
      subtopic: 'Point Mass Striking Hinged Rod & Eccentric Collisions',
      subject: Subject.PHYSICS,
      formulas: [
        'L_O = L_cm + (r_cm × M · v_cm) = I_cm · ω + M · r_⊥ · v_cm',
        'About Fixed Hinge H (τ_ext,H = 0 during impulse):   L_initial,H = L_final,H',
        'Center of Percussion (Zero Hinge Impulse):   x = I_hinge / (M · d_cm)',
        'For Uniform Rod of length L struck at x = 2L/3 from hinge → J_hinge = 0',
      ],
      examTrap: 'TRAP: Linear momentum is NOT conserved when a hinged rod is struck because the hinge exerts an impulsive reaction J_H!',
      keyPoints: [
        'For free rod on smooth table (unhinged), BOTH linear momentum P and L about CM (or any stationary point) are conserved.',
        'Coefficient of restitution e applies strictly along Line of Impact at the exact point of contact.',
      ],
    },
  },
  {
    index: 3,
    label: 'Page 04 · Aldol vs Cannizzaro Reaction Checkpoints',
    sourceType: SlideSourceType.DEMO_BOARD,
    demoSpec: {
      heading: 'Carbonyl Chemistry · Aldol & Cannizzaro Traps',
      subtopic: 'Enolate Nucleophilicity vs Hydride Transfer (Organic)',
      subject: Subject.CHEMISTRY,
      formulas: [
        'Aldol Req: At least one α-H   |   Dil. NaOH, Δ → α,β-unsaturated carbonyl',
        'Cross-Aldol Major: More electrophilic (less hindered, no α-H) acts as acceptor',
        'Cannizzaro Req: NO α-H + Conc. OH⁻ (50%) → RCOO⁻ + RCH₂OH',
        'Cross-Cannizzaro: HCHO ALWAYS oxidizes to HCOO⁻ (fastest OH⁻ attack)',
      ],
      examTrap: 'TRAP: (CH₃)₂CH–CHO (Isobutyraldehyde) HAS one α-H, yet with conc. alkali it often undergoes disproportionation due to steric hindrance of enolate attack!',
      keyPoints: [
        'Intramolecular Cannizzaro in Ph–CO–CHO with conc. NaOH yields Ph–CH(OH)–COO⁻ (Mandelate).',
        'Rate-determining step in Cannizzaro is intermolecular Hydride (H⁻) shift (3rd-order or 4th-order kinetics).',
      ],
    },
  },
  {
    index: 4,
    label: 'Page 05 · Definite Integration King & Queen Properties',
    sourceType: SlideSourceType.DEMO_BOARD,
    demoSpec: {
      heading: 'Definite Integration · Symmetry & Reduction Shortcuts',
      subtopic: 'High-Speed JEE Elimination Properties',
      subject: Subject.MATHEMATICS,
      formulas: [
        'King (P4):  ∫[a to b] f(x) dx = ∫[a to b] f(a + b − x) dx',
        'Add Both:   2I = ∫[a to b] [f(x) + f(a + b − x)] dx',
        'Queen (P6): ∫[0 to 2a] f(x) dx = 2 ∫[0 to a] f(x) dx   if f(2a − x) = f(x)',
        'Wallis:     ∫[0 to π/2] sinⁿx dx = [(n−1)/n] · [(n−3)/(n−2)] ...',
      ],
      examTrap: 'TRAP: Before applying Leibniz Rule d/dx ∫[φ(x) to ψ(x)] f(t) dt, ensure integrand does NOT still contain x inside f(x, t)!',
      keyPoints: [
        'For periodic f(x) with fundamental period T: ∫[a to a + nT] f(x) dx = n · ∫[0 to T] f(x) dx.',
        'Whenever limits are [−a, a], immediately split f(x) into even + odd components first.',
      ],
    },
  },
  {
    index: 5,
    label: 'Page 06 · Conics Tangent, Normal & Director Circle',
    sourceType: SlideSourceType.DEMO_BOARD,
    demoSpec: {
      heading: 'Conic Sections · Unified T = 0 & Locus Sheet',
      subtopic: 'Parabola, Ellipse & Hyperbola Rapid Comparison',
      subject: Subject.MATHEMATICS,
      formulas: [
        'Parabola y² = 4ax:      Tangent y = mx + a/m       |   Director: x = −a',
        'Ellipse x²/a²+y²/b²=1:  Tangent y = mx ± √(a²m²+b²) |   Director: x²+y² = a²+b²',
        'Hyperbola x²/a²−y²/b²=1: Tangent y = mx ± √(a²m²−b²)|   Director: x²+y² = a²−b²',
        'Chord with Midpoint (x₁, y₁):   T = S₁   (Valid for all 2nd-degree conics)',
      ],
      examTrap: 'TRAP: For Hyperbola with b > a, a² − b² < 0 → NO real point has perpendicular tangents (Director Circle does not exist)!',
      keyPoints: [
        'Reflection property: Ray from one focus of an ellipse reflects off the curve directly through the other focus.',
        'Maximum 4 normals can be drawn from an interior point to an ellipse; sum of eccentric angles = odd multiple of π.',
      ],
    },
  },
];

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function renderDemoBoardToCanvas(
  canvas: HTMLCanvasElement,
  spec: DemoBoardSpec,
  slideNumber: number,
  totalSlides: number,
  orientation: BroadcastOrientation,
  zoom: number
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const baseWidth = orientation === BroadcastOrientation.VERTICAL ? 760 : 1280;
  const baseHeight = orientation === BroadcastOrientation.VERTICAL ? 1080 : 720;

  const logicalW = Math.round(baseWidth * zoom);
  const logicalH = Math.round(baseHeight * zoom);

  canvas.width = Math.round(logicalW * dpr);
  canvas.height = Math.round(logicalH * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.scale(dpr * zoom, dpr * zoom);

  // Crisp ruled notebook / revision sheet surface
  ctx.fillStyle = '#FFFDF9';
  ctx.fillRect(0, 0, baseWidth, baseHeight);

  // Subtle engineering grid lines
  ctx.strokeStyle = '#EFECE6';
  ctx.lineWidth = 1;
  for (let x = 36; x < baseWidth; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, baseHeight);
    ctx.stroke();
  }
  for (let y = 36; y < baseHeight; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(baseWidth, y);
    ctx.stroke();
  }

  // Notebook red margin rule
  const padX = orientation === BroadcastOrientation.VERTICAL ? 54 : 72;
  ctx.strokeStyle = '#FCA5A5';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX - 18, 0);
  ctx.lineTo(padX - 18, baseHeight);
  ctx.stroke();

  let cursorY = orientation === BroadcastOrientation.VERTICAL ? 66 : 54;
  const contentWidth = baseWidth - padX * 2;

  // Header metadata kicker
  ctx.fillStyle = '#475569';
  ctx.font = '600 15px "JetBrains Mono", monospace';
  ctx.fillText(
    `${spec.subject.toUpperCase()} · JEE REVISION SHEET · SLIDE ${String(slideNumber).padStart(2, '0')}/${String(totalSlides).padStart(2, '0')}`,
    padX,
    cursorY
  );

  cursorY += 36;
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
  const headingLines = wrapLines(ctx, spec.heading, contentWidth);
  for (const line of headingLines) {
    ctx.fillText(line, padX, cursorY);
    cursorY += 36;
  }

  ctx.fillStyle = '#334155';
  ctx.font = '500 17px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(spec.subtopic, padX, cursorY);

  cursorY += 22;
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, cursorY);
  ctx.lineTo(baseWidth - padX, cursorY);
  ctx.stroke();

  cursorY += 34;

  // Formula block
  ctx.fillStyle = '#1D4ED8';
  ctx.font = '700 14px "JetBrains Mono", monospace';
  ctx.fillText('CORE FORMULAS & CONDITIONS', padX, cursorY);
  cursorY += 26;

  for (let i = 0; i < spec.formulas.length; i++) {
    const formula = spec.formulas[i];
    ctx.font = '600 18px "JetBrains Mono", monospace';
    const lines = wrapLines(ctx, `${i + 1}. ${formula}`, contentWidth - 28);
    const boxH = lines.length * 27 + 20;

    ctx.fillStyle = '#F1F5F9';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(padX, cursorY - 18, contentWidth, boxH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    let fy = cursorY + 4;
    for (const ln of lines) {
      ctx.fillText(ln, padX + 14, fy);
      fy += 27;
    }
    cursorY += boxH + (orientation === BroadcastOrientation.VERTICAL ? 16 : 11);
  }

  cursorY += 12;

  // High-alert JEE Exam Trap box
  ctx.font = '600 17px "Plus Jakarta Sans", sans-serif';
  const trapLines = wrapLines(ctx, spec.examTrap, contentWidth - 32);
  const trapH = trapLines.length * 25 + 26;

  ctx.fillStyle = '#FEF2F2';
  ctx.strokeStyle = '#FECACA';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(padX, cursorY - 14, contentWidth, trapH, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#991B1B';
  let ty = cursorY + 10;
  for (const ln of trapLines) {
    ctx.fillText(ln, padX + 16, ty);
    ty += 25;
  }

  cursorY += trapH + 26;

  // Key Takeaways
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 14px "JetBrains Mono", monospace';
  ctx.fillText('RAPID RECALL CHECKPOINTS', padX, cursorY);
  cursorY += 26;

  ctx.fillStyle = '#1E293B';
  ctx.font = '500 17px "Plus Jakarta Sans", sans-serif';
  for (const pt of spec.keyPoints) {
    const pLines = wrapLines(ctx, `• ${pt}`, contentWidth - 12);
    for (const pl of pLines) {
      if (cursorY < baseHeight - 30) {
        ctx.fillText(pl, padX + 6, cursorY);
        cursorY += 25;
      }
    }
    cursorY += 8;
  }

  ctx.restore();
}
