import type { LatLng } from './routeTrack'
import type { RouteFailure } from '../services/routes'

export const LOCATION_DENIED =
    'Location permission was denied. Allow it in your browser settings, or start from Home or a point on the map.'

/** Where the device is now. Rejects with a RouteFailure saying why it couldn't tell. */
export function currentPosition(): Promise<LatLng> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject({ code: 'location_denied', message: 'This browser has no location service.' } satisfies RouteFailure)
            return
        }
        navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            (err) =>
                reject(
                    (err.code === err.PERMISSION_DENIED
                        ? { code: 'location_denied', message: LOCATION_DENIED }
                        : { code: 'unknown', message: "Couldn't get your location. Try again outside, or drop a pin." }) satisfies RouteFailure
                ),
            { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
        )
    })
}
