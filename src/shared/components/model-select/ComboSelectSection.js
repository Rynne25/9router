"use client";

export default function ComboSelectSection({ combos, selectedModel, addedModelValues, onSelect }) {
  if (!combos || combos.length === 0) return null;

  return (
    <div className="rounded-xl border border-purple-500/40 bg-purple-500/[0.06] dark:bg-purple-950/20 p-3 shadow-xs">
      <div className="flex items-center gap-2 mb-2 sticky top-0 bg-white/95 dark:bg-[#11131a]/95 backdrop-blur-md py-1 z-10">
        <span className="material-symbols-outlined text-purple-500 text-[18px]">layers</span>
        <span className="text-xs sm:text-sm font-extrabold text-purple-600 dark:text-purple-300">Combos</span>
        <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-300 font-bold">
          ({combos.length})
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {combos.map((combo) => {
          const isSelected = selectedModel === combo.name;
          const isAdded = addedModelValues.includes(combo.name);
          return (
            <button
              key={combo.id}
              type="button"
              onClick={() => onSelect({ id: combo.name, name: combo.name, value: combo.name })}
              className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer shadow-xs ${
                isSelected
                  ? "bg-purple-500/25 border-purple-500 text-purple-900 dark:text-purple-100 ring-2 ring-purple-500/60 shadow-md"
                  : isAdded
                  ? "bg-purple-500/15 border-purple-500/50 text-purple-900 dark:text-purple-200"
                  : "bg-white/90 dark:bg-zinc-900/90 border-purple-500/35 text-zinc-900 dark:text-zinc-100 hover:border-purple-400 hover:bg-purple-500/10"
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-purple-500 text-[16px]">shuffle</span>
                <span className="text-xs font-bold truncate">{combo.name}</span>
              </div>
              {(isSelected || isAdded) && (
                <span className="material-symbols-outlined text-purple-500 text-[16px]">check_circle</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
