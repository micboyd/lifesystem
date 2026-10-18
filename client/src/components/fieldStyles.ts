/**
 * The one look for every text field, select trigger and textarea, so forms read
 * the same on every screen. Fields are 44px tall, 12px rounded, with a
 * sentence-case label above. Focus swaps the border to ink and adds a soft
 * stone halo in place of the global focus outline.
 */
export const FIELD_LABEL = 'text-[13px] font-medium text-neutral-700'

export const FIELD_BASE =
    'w-full rounded-xl border bg-white text-[15px] text-neutral-900 placeholder:text-neutral-500 outline-none focus-visible:outline-none transition-[border-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500'

export const FIELD_IDLE =
    'border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 focus:ring-4 focus:ring-neutral-100'

export const FIELD_ERROR = 'border-red-600 focus:border-red-600 focus:ring-4 focus:ring-red-50'

export const FIELD_HINT = 'text-xs text-neutral-500'

export const FIELD_ERROR_TEXT = 'flex items-center gap-1.5 text-xs text-red-600'
