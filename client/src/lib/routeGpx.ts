import type { RouteCoord } from './routeTrack'

/**
 * The exact route as GPX 1.1 — every coordinate and its elevation — so it can
 * be loaded into a watch or another app unchanged.
 */

const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export function routeGpx(coords: RouteCoord[], name: string, createdAt?: string): string {
    const pts = coords
        .map((c) => {
            const ele = c[2] !== undefined ? `<ele>${c[2].toFixed(1)}</ele>` : ''
            return `      <trkpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}">${ele}</trkpt>`
        })
        .join('\n')
    const time = createdAt ? `\n    <time>${new Date(createdAt).toISOString()}</time>` : ''
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="AdminLife" xmlns="http://www.topografix.com/GPX/1/1">',
        `  <metadata>\n    <name>${escapeXml(name)}</name>${time}\n  </metadata>`,
        '  <trk>',
        `    <name>${escapeXml(name)}</name>`,
        '    <type>running</type>',
        '    <trkseg>',
        pts,
        '    </trkseg>',
        '  </trk>',
        '</gpx>',
        '',
    ].join('\n')
}

/** A safe file name, e.g. "outdoor-run-walk-1-5-x-400-m.gpx". */
export function gpxFileName(name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return `${slug || 'route'}.gpx`
}
