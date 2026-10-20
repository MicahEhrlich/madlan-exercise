import { useState } from 'react'

/** Reset before commit when the table view changes, without restoring an old selection. */
export function useExpandedDeal(contextKey: string) {
  const [selection, setSelection] = useState<{ contextKey: string; rowId: string | null }>({ contextKey, rowId: null })
  if (selection.contextKey !== contextKey) setSelection({ contextKey, rowId: null })
  return {
    expandedRowId: selection.contextKey === contextKey ? selection.rowId : null,
    toggle: (rowId: string) => setSelection((current) => ({ contextKey,
      rowId: current.contextKey === contextKey && current.rowId === rowId ? null : rowId })),
    close: () => setSelection({ contextKey, rowId: null }),
  }
}
