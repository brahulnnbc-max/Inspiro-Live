import React, { useState } from 'react';
import { X, BookOpen, Search, Copy, Check } from 'lucide-react';

interface FormulaItem {
  id: string;
  subject: 'Physics' | 'Chemistry' | 'Mathematics';
  topic: string;
  name: string;
  formula: string;
  notes: string;
}

const FORMULAS: FormulaItem[] = [
  // Physics
  {
    id: 'p1',
    subject: 'Physics',
    topic: 'Rotational Motion',
    name: 'Parallel Axis Theorem',
    formula: 'I = I_cm + M d^2',
    notes: 'Valid for rigid bodies where d is distance between parallel axis and center of mass axis.',
  },
  {
    id: 'p2',
    subject: 'Physics',
    topic: 'Rotational Motion',
    name: 'Angular Momentum of Rigid Body',
    formula: 'L = r_cm × P_cm + I_cm ω',
    notes: 'Total angular momentum about any origin equals orbital plus spin angular momentum.',
  },
  {
    id: 'p3',
    subject: 'Physics',
    topic: 'Electrostatics',
    name: 'Gauss Law in Dielectrics',
    formula: '∮ D · dA = Q_free',
    notes: 'Electric displacement vector D = ε_0 E + P. Bound surface charge σ_b = P · n.',
  },
  {
    id: 'p4',
    subject: 'Physics',
    topic: 'Thermodynamics',
    name: 'Carnot Engine Efficiency',
    formula: 'η = 1 - (T_c / T_h) = W / Q_h',
    notes: 'Maximum theoretical efficiency between hot reservoir T_h and cold reservoir T_c in Kelvin.',
  },

  // Chemistry
  {
    id: 'c1',
    subject: 'Chemistry',
    topic: 'Coordination Chemistry',
    name: 'Crystal Field Splitting (Octahedral)',
    formula: 'Δ_o = E(e_g) - E(t_2g) ; CFSE = (-0.4 n_t2g + 0.6 n_eg)Δ_o + n P',
    notes: 'Strong field ligands (CN-, CO) induce large Δ_o causing low-spin electron pairing.',
  },
  {
    id: 'c2',
    subject: 'Chemistry',
    topic: 'Chemical Kinetics',
    name: 'Arrhenius Equation',
    formula: 'k = A · e^(-E_a / (R T))  ⟹  ln(k_2 / k_1) = (E_a / R) (1/T_1 - 1/T_2)',
    notes: 'Activation energy E_a slope = -E_a / (2.303 R) on ln(k) vs 1/T plot.',
  },
  {
    id: 'c3',
    subject: 'Chemistry',
    topic: 'Electrochemistry',
    name: 'Nernst Equation at 298 K',
    formula: 'E_cell = E°_cell - (0.0591 / n) log Q',
    notes: 'At equilibrium E_cell = 0 and Q = K_eq, so E°_cell = (0.0591 / n) log K_eq.',
  },

  // Mathematics
  {
    id: 'm1',
    subject: 'Mathematics',
    topic: 'Integral Calculus',
    name: 'Leibniz Rule of Differentiation under Integral',
    formula: 'd/dx ∫[u(x) to v(x)] f(t) dt = f(v(x)) v\'(x) - f(u(x)) u\'(x)',
    notes: 'Frequently tested in JEE Advanced for limits of integration involving functions of x.',
  },
  {
    id: 'm2',
    subject: 'Mathematics',
    topic: 'Integral Calculus',
    name: 'King\'s Property of Definite Integrals',
    formula: '∫[a to b] f(x) dx = ∫[a to b] f(a + b - x) dx',
    notes: 'Crucial for trigonometric symmetric integrals like ∫[0 to π/2] (sin^n x)/(sin^n x + cos^n x) dx = π/4.',
  },
  {
    id: 'm3',
    subject: 'Mathematics',
    topic: 'Coordinate Geometry',
    name: 'Distance between Skew Lines in 3D',
    formula: 'd = | (a_2 - a_1) · (b_1 × b_2) | / | b_1 × b_2 |',
    notes: 'For lines r = a_1 + λ b_1 and r = a_2 + μ b_2.',
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultSubject?: 'Physics' | 'Chemistry' | 'Mathematics';
}

export const FormulaSheetModal: React.FC<Props> = ({ isOpen, onClose, defaultSubject }) => {
  const [selectedSubject, setSelectedSubject] = useState<'All' | 'Physics' | 'Chemistry' | 'Mathematics'>(
    defaultSubject || 'All'
  );
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filtered = FORMULAS.filter((item) => {
    const matchesSubject = selectedSubject === 'All' || item.subject === selectedSubject;
    const matchesQuery =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.topic.toLowerCase().includes(search.toLowerCase()) ||
      item.formula.toLowerCase().includes(search.toLowerCase());
    return matchesSubject && matchesQuery;
  });

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-slate-100">JEE Formula & Theorem Vault</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close formula sheet"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters and search */}
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-800/80 rounded-lg">
            {(['All', 'Physics', 'Chemistry', 'Mathematics'] as const).map((sub) => (
              <button
                key={sub}
                onClick={() => setSelectedSubject(sub)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  selectedSubject === sub
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sub}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search formula, theorem, rule..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-400 focus:outline-none focus:border-amber-400/60"
            />
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No matching JEE formulas found. Try a different query.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-slate-800/60 border border-slate-800 rounded-lg flex flex-col justify-between hover:border-slate-700 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span>{item.subject}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.topic}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-200 mb-2">{item.name}</h3>
                    <div className="p-2.5 bg-slate-950/80 border border-slate-800/80 rounded font-mono text-xs text-amber-300 select-all mb-2 overflow-x-auto">
                      {item.formula}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.notes}</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-800/60 flex justify-end">
                    <button
                      onClick={() => handleCopy(item.id, `${item.name}: ${item.formula}`)}
                      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
                    >
                      {copiedId === item.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-mono">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy formula</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
