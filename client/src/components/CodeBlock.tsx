import { useState } from 'react'

interface CodeBlockProps {
    code: string
    language?: string
}

export default function CodeBlock({ code, language = 'tsx' }: CodeBlockProps) {
    const [copied, setCopied] = useState(false)

    async function handleCopy() {
        await navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    return (
        <div className="relative overflow-hidden rounded-2xl bg-neutral-950 text-neutral-100">
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
                <span className="text-xs font-semibold tracking-widest uppercase text-neutral-500">
                    {language}
                </span>
                <button
                    onClick={handleCopy}
                    className="rounded-full px-3 py-1 text-xs font-semibold tracking-tight text-neutral-400 transition-colors duration-150 hover:bg-neutral-800 hover:text-white"
                >
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
            <pre className="overflow-x-auto px-4 py-4 text-sm leading-relaxed">
                <code>{code}</code>
            </pre>
        </div>
    )
}
