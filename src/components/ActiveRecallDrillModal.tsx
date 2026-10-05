import React, { useState, useEffect } from 'react';
import { X, Sparkles, Brain, Check, RefreshCw, Zap, Trophy, ArrowRight } from 'lucide-react';

interface Flashcard {
  subject: 'Physics' | 'Chemistry' | 'Mathematics';
  question: string;
  answer: string;
  hint?: string;
  topic: string;
}

const DRILL_QUESTIONS: Flashcard[] = [
  {
    subject: 'Physics',
    topic: 'Rotational Motion',
    question: 'What is the Moment of Inertia of a solid cone of radius R and mass M about its central vertical axis?',
    answer: 'I = (3/10) * M * R²',
    hint: 'Compare with a solid cylinder (1/2 MR²) and disk.',
  },
  {
    subject: 'Physics',
    topic: 'Thermodynamics',
    question: 'State the formula for work done by an ideal gas during an adiabatic expansion between temperatures T₁ and T₂.',
    answer: 'W = nR(T₁ - T₂) / (γ - 1) = (P₁V₁ - P₂V₂) / (γ - 1)',
    hint: 'Derived from ΔU = -W in adiabatic conditions (Q=0).',
  },
  {
    subject: 'Chemistry',
    topic: 'Chemical Bonding',
    question: 'What is the hybridization, steric number, and molecular geometry of XeF₄?',
    answer: 'Steric Number = 6, Hybridization = sp³d², Geometry = Square Planar (2 lone pairs axial)',
    hint: 'Xe contributes 8 valence electrons + 4 F bonds.',
  },
  {
    subject: 'Chemistry',
    topic: 'Coordination Chemistry',
    question: 'What is the effective atomic number (EAN) or crystal field splitting parameter Δₒ order between CN⁻, H₂O, and Cl⁻?',
    answer: 'Spectrochemical series order: CN⁻ (strong field, low spin) > H₂O > Cl⁻ (weak field, high spin)',
    hint: 'Carbon donors are stronger than oxygen and halide donors.',
  },
  {
    subject: 'Mathematics',
    topic: 'Integral Calculus',
    question: 'Evaluate the standard integral form: ∫ eˣ [ f(x) + f\'(x) ] dx',
    answer: 'eˣ · f(x) + C',
    hint: 'Differentiate the product eˣ · f(x) using the product rule.',
  },
  {
    subject: 'Mathematics',
    topic: 'Conic Sections',
    question: 'Write the slope-form equation of a tangent to the parabola y² = 4ax with slope m.',
    answer: 'y = mx + a/m (Point of contact: (a/m², 2a/m))',
    hint: 'Condition of tangency for y = mx + c is c = a/m.',
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ActiveRecallDrillModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentIndex(0);
    setShowAnswer(false);
    setTimeLeft(60);
    setIsTimerRunning(true);
    setScore(0);
  }, [isOpen]);

  // 60-second rapid timer
  useEffect(() => {
    if (!isOpen || !isTimerRunning || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isTimerRunning, timeLeft]);

  if (!isOpen) return null;

  const current = DRILL_QUESTIONS[currentIndex % DRILL_QUESTIONS.length];

  const handleNext = (gotItRight: boolean) => {
    if (gotItRight) {
      setScore(s => s + 1);
    }
    setShowAnswer(false);
    setCurrentIndex(i => i + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>60-Sec Speed Recall Drill</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">
                  Gap Sync
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                High-yield formula drill between scheduled live classes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Timer countdown */}
            <div className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1 ${
              timeLeft <= 15 ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-slate-800 text-slate-200'
            }`}>
              <span>⏱️</span>
              <span>{timeLeft}s</span>
            </div>

            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Question Area */}
        <div className="p-6 space-y-5 flex-1">
          <div className="flex items-center justify-between text-xs">
            <span className={`font-semibold ${
              current.subject === 'Physics' ? 'text-sky-400' : current.subject === 'Chemistry' ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {current.subject} · {current.topic}
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              Question {currentIndex + 1} of {DRILL_QUESTIONS.length}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 min-h-[110px] flex items-center justify-center text-center">
            <p className="text-sm sm:text-base font-semibold text-slate-100 leading-relaxed font-sans">
              {current.question}
            </p>
          </div>

          {/* Answer Reveal Area */}
          {showAnswer ? (
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-left space-y-2 animate-in fade-in duration-150">
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                Official Answer & Derivation
              </span>
              <p className="text-sm font-bold text-emerald-200 font-mono">
                {current.answer}
              </p>
              {current.hint && (
                <p className="text-xs text-slate-400 italic pt-1 border-t border-emerald-900/40">
                  💡 Note: {current.hint}
                </p>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowAnswer(true)}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-white font-medium text-xs border border-slate-700 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Reveal Formula & Check Memory</span>
            </button>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Score: <strong className="text-white">{score}</strong> correctly recalled</span>
          </div>

          <div className="flex items-center gap-2">
            {showAnswer ? (
              <>
                <button
                  onClick={() => handleNext(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
                >
                  Forgot / Review
                </button>
                <button
                  onClick={() => handleNext(true)}
                  className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Knew It! Next</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => handleNext(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors flex items-center gap-1"
              >
                <span>Skip</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
