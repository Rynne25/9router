"use client";

import PropTypes from "prop-types";

export default function BatchTestButton({
  mode,
  testingMode,
  onTest,
  label = "Test All",
}) {
  const isTesting = testingMode === mode;
  return (
    <button
      onClick={() => onTest(mode)}
      disabled={!!testingMode}
      className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:w-auto sm:py-1.5 ${
        isTesting
          ? "bg-primary/20 border-primary/40 text-primary animate-pulse"
          : "bg-bg border-border text-text-muted hover:text-text-main hover:border-primary/40"
      }`}
      title={`Test all ${label} connections`}
      aria-label={`Test all ${label} connections`}
    >
      <span
        className={`material-symbols-outlined text-[14px]${isTesting ? " animate-spin" : ""}`}
      >
        play_arrow
      </span>
      {isTesting ? "Testing..." : "Test All"}
    </button>
  );
}

BatchTestButton.propTypes = {
  mode: PropTypes.string.isRequired,
  testingMode: PropTypes.string,
  onTest: PropTypes.func.isRequired,
  label: PropTypes.string,
};
