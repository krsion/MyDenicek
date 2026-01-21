/**
 * Hook for managing formula view mode
 * Toggles between showing formula structure vs computed result
 */

import { useCallback, useState } from "react";

/**
 * Formula view mode
 * - "formula": Show the formula structure (operation, arguments)
 * - "result": Show the computed result value
 */
export type FormulaViewMode = "formula" | "result";

/**
 * Return type for useFormulaViewMode hook
 */
export interface FormulaViewModeState {
    /** Current view mode */
    mode: FormulaViewMode;
    /** Set the view mode directly */
    setMode: (mode: FormulaViewMode) => void;
    /** Toggle between formula and result modes */
    toggleMode: () => void;
    /** Whether currently showing formula structure */
    isFormulaMode: boolean;
    /** Whether currently showing computed result */
    isResultMode: boolean;
}

/**
 * Hook for managing formula view mode state
 *
 * @param initialMode - Initial view mode (default: "result")
 * @returns State and controls for formula view mode
 *
 * @example
 * ```tsx
 * const { mode, toggleMode, isFormulaMode } = useFormulaViewMode();
 *
 * return (
 *   <>
 *     <button onClick={toggleMode}>
 *       {isFormulaMode ? "Show Results" : "Show Formulas"}
 *     </button>
 *     <RenderedDocument viewMode={mode} />
 *   </>
 * );
 * ```
 */
export function useFormulaViewMode(initialMode: FormulaViewMode = "result"): FormulaViewModeState {
    const [mode, setMode] = useState<FormulaViewMode>(initialMode);

    const toggleMode = useCallback(() => {
        setMode(m => m === "formula" ? "result" : "formula");
    }, []);

    return {
        mode,
        setMode,
        toggleMode,
        isFormulaMode: mode === "formula",
        isResultMode: mode === "result",
    };
}
