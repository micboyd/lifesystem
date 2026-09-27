import { useState } from 'react'
import BottomSheet from './BottomSheet'
import { embedUrl, parseVideo } from '../lib/video'

/**
 * A demo video for an exercise, played in a sheet that rises from the bottom
 * of the screen — thumb-height on a phone, over whatever drawer it was opened
 * from, so on the gym floor it's one tap to watch and one to get back to the
 * set. YouTube plays inside the app; any other link opens in a new tab.
 */
export function VideoSheet({
    url,
    title,
    open,
    onClose,
}: {
    url: string
    title: string
    open: boolean
    onClose: () => void
}) {
    const video = parseVideo(url)
    if (!video || video.kind !== 'youtube') return null
    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={title}
            footer={
                <div className="flex items-center justify-between gap-3">
                    <a
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-500 hover:text-neutral-800"
                    >
                        <i className="fa-solid fa-arrow-up-right-from-square text-xs" aria-hidden="true" />
                        Open in YouTube
                    </a>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-11 rounded-xl bg-neutral-900 px-5 text-sm font-semibold text-white hover:bg-neutral-800"
                    >
                        Back to workout
                    </button>
                </div>
            }
        >
            {/* Mounted only while open, so closing the sheet stops the video. */}
            {open && (
                <div
                    className={`overflow-hidden rounded-2xl bg-black ${
                        video.vertical ? 'mx-auto aspect-[9/16] h-[65dvh] max-w-full' : 'aspect-video w-full'
                    }`}
                >
                    <iframe
                        src={embedUrl(video)}
                        title={`${title} — demo video`}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                    />
                </div>
            )}
        </BottomSheet>
    )
}

/**
 * The play button beside an exercise's name. Nothing when the exercise has no
 * usable link. Big enough to hit with a thumb between sets.
 */
export function VideoButton({ url, title }: { url?: string; title: string }) {
    const [open, setOpen] = useState(false)
    const video = parseVideo(url)
    if (!video) return null

    const cls =
        'inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600 transition-colors hover:bg-red-100 active:bg-red-200'
    const icon = <i className="fa-solid fa-play text-xs" aria-hidden="true" />

    if (video.kind === 'link') {
        return (
            <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Watch how to do ${title}`}
                title="Watch the demo"
                onClick={(e) => e.stopPropagation()}
                className={cls}
            >
                {icon}
            </a>
        )
    }

    return (
        <>
            <button
                type="button"
                aria-label={`Watch how to do ${title}`}
                title="Watch the demo"
                onClick={(e) => {
                    e.stopPropagation()
                    setOpen(true)
                }}
                className={cls}
            >
                {icon}
            </button>
            <VideoSheet url={video.url} title={title} open={open} onClose={() => setOpen(false)} />
        </>
    )
}
