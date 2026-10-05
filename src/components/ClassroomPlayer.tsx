      {/* Rough Workpad Drawer */}
      {isScratchpadOpen && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Rough Workpad & Equation Calculation Canvas
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              Drawings auto-saved in local buffer
            </span>
          </div>
          <Scratchpad />
        </div>
      )}
    </div>
  );
};
