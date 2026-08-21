import { useEffect, useState } from 'react'
import { photoObjectUrl } from '../../services/progress'

/**
 * A displayable URL for a progress photo.
 *
 * The image cannot be fetched by the browser directly — the API authenticates
 * with a bearer token that an `<img src>` has no way to send — so the bytes come
 * through the authenticated client and are wrapped in an object URL here. That
 * keeps the most personal data in the app behind exactly the same auth as
 * everything else, rather than needing a public path or a token in a query
 * string to make an `<img>` tag work.
 *
 * The object URL is revoked when the id changes or the component unmounts. A
 * comparison view flicking through a year of photos would otherwise pin every
 * one of them in memory for the life of the page.
 */
export function useProgressPhoto(id: string | null | undefined): {
    url: string | null
    loading: boolean
    failed: boolean
} {
    // The result is stamped with the id it belongs to, so switching photos shows
    // nothing rather than briefly showing the previous one — and so the effect
    // never has to clear state synchronously to achieve that.
    const [result, setResult] = useState<{ id: string; url: string | null; failed: boolean } | null>(
        null
    )

    useEffect(() => {
        if (!id) return

        let active = true
        let created: string | null = null

        photoObjectUrl(id)
            .then((objectUrl) => {
                if (!active) {
                    // Unmounted mid-flight: release it rather than leaking it.
                    URL.revokeObjectURL(objectUrl)
                    return
                }
                created = objectUrl
                setResult({ id, url: objectUrl, failed: false })
            })
            .catch(() => {
                if (active) setResult({ id, url: null, failed: true })
            })

        return () => {
            active = false
            if (created) URL.revokeObjectURL(created)
        }
    }, [id])

    const current = id && result?.id === id ? result : null
    return {
        url: current?.url ?? null,
        loading: Boolean(id) && current === null,
        failed: current?.failed ?? false,
    }
}
