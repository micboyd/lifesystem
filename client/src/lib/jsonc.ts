/**
 * JSON with comments — what the annotated import templates are written in. `//`
 * line comments, block comments and trailing commas are dropped, then the
 * rest is parsed as plain JSON, so a template copied with its notes still
 * pastes straight back into the importer. Anything inside a string is left
 * alone, so a URL's "//" survives.
 */
export function stripJsonComments(text: string): string {
    let out = ''
    let i = 0
    const n = text.length
    while (i < n) {
        const c = text[i]
        const next = text[i + 1]
        if (c === '"') {
            // Copy the string through, honouring escapes.
            let j = i + 1
            while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
            out += text.slice(i, j + 1)
            i = j + 1
        } else if (c === '/' && next === '/') {
            while (i < n && text[i] !== '\n') i++
        } else if (c === '/' && next === '*') {
            const end = text.indexOf('*/', i + 2)
            i = end === -1 ? n : end + 2
        } else {
            if (c === '}' || c === ']') {
                // A trailing comma — fine in the template's style, not in JSON.
                // Outside a string the last non-space character is never inside one.
                const trimmed = out.trimEnd()
                if (trimmed.endsWith(',')) out = trimmed.slice(0, -1) + out.slice(trimmed.length)
            }
            out += c
            i++
        }
    }
    return out
}

/** `JSON.parse` that tolerates comments and trailing commas. Throws like it on bad input. */
export function parseJsonc(text: string): unknown {
    return JSON.parse(stripJsonComments(text))
}
