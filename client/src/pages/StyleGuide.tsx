import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button'
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from '../components/Card'
import Badge from '../components/Badge'
import Input from '../components/Input'
import CodeBlock from '../components/CodeBlock'

interface SectionProps {
    title: string
    description?: string
    preview: ReactNode
    code: string
}

function Section({ title, description, preview, code }: SectionProps) {
    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-neutral-950">{title}</h2>
                {description && <p className="mt-1 text-sm text-neutral-400">{description}</p>}
            </div>
            {/* Live preview */}
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-8">{preview}</div>
            {/* Code snippet */}
            <CodeBlock code={code} />
        </section>
    )
}

export default function StyleGuide() {
    return (
        <main className="min-h-screen bg-white">
            {/* Header */}
            <section className="border-b border-neutral-100 px-6 pt-12 pb-10">
                <div className="mx-auto max-w-5xl">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Lifesystem — Design System
                    </p>
                    <h1 className="mb-3 text-4xl font-bold tracking-tight text-neutral-950 sm:text-5xl">
                        Style Guide
                    </h1>
                    <p className="mb-6 max-w-xl text-base text-neutral-400 sm:text-lg">
                        Every component in the library, with live examples and copy-paste code
                        snippets.
                    </p>
                    <Link
                        to="/"
                        className="text-sm font-semibold tracking-tight text-neutral-500 transition-colors duration-150 hover:text-neutral-900"
                    >
                        ← Back to home
                    </Link>
                </div>
            </section>

            {/* Sections */}
            <div className="max-w-5xl mx-auto px-6 py-16 space-y-16">
                <Section
                    title="Badges"
                    description="Small status indicators with five variants."
                    preview={
                        <div className="flex flex-wrap items-center gap-3">
                            <Badge>Default</Badge>
                            <Badge variant="outline">Outline</Badge>
                            <Badge variant="success">Success</Badge>
                            <Badge variant="warning">Warning</Badge>
                            <Badge variant="danger">Danger</Badge>
                        </div>
                    }
                    code={`<Badge>Default</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="success">Success</Badge>
<Badge variant="warning">Warning</Badge>
<Badge variant="danger">Danger</Badge>`}
                />

                <Section
                    title="Buttons"
                    description="Three sizes, three variants, plus disabled and full-width states."
                    preview={
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-4">
                                <Button size="sm">Small</Button>
                                <Button>Medium</Button>
                                <Button size="lg">Large</Button>
                            </div>
                            <div className="flex flex-wrap items-center gap-4">
                                <Button variant="secondary">Secondary</Button>
                                <Button variant="ghost">Ghost</Button>
                                <Button disabled>Disabled</Button>
                            </div>
                            <Button fullWidth>Full width</Button>
                        </div>
                    }
                    code={`<Button size="sm">Small</Button>
<Button>Medium</Button>
<Button size="lg">Large</Button>

<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button disabled>Disabled</Button>

<Button fullWidth>Full width</Button>`}
                />

                <Section
                    title="Inputs"
                    description="Text fields with labels, hints, error states, and disabled state."
                    preview={
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                            <Input label="Email" type="email" placeholder="you@example.com" />
                            <Input label="Password" type="password" placeholder="••••••••" />
                            <Input
                                label="With hint"
                                placeholder="Enter a value"
                                hint="This is a helpful hint."
                            />
                            <Input
                                label="With error"
                                placeholder="Enter a value"
                                error="This field is required."
                            />
                            <Input label="Disabled" placeholder="Can't touch this" disabled />
                        </div>
                    }
                    code={`<Input label="Email" type="email" placeholder="you@example.com" />
<Input label="Password" type="password" placeholder="••••••••" />
<Input label="With hint" placeholder="Enter a value" hint="This is a helpful hint." />
<Input label="With error" placeholder="Enter a value" error="This field is required." />
<Input label="Disabled" placeholder="Can't touch this" disabled />`}
                />

                <Section
                    title="Cards"
                    description="Composable card built from Header, Title, Body, and Footer parts."
                    preview={
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle>Authentication</CardTitle>
                                        <Badge variant="success">Ready</Badge>
                                    </div>
                                </CardHeader>
                                <CardBody>
                                    JWT-based auth with bcrypt password hashing baked in from day one.
                                </CardBody>
                                <CardFooter>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="px-0 hover:bg-transparent underline underline-offset-4"
                                    >
                                        Learn more →
                                    </Button>
                                </CardFooter>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle>Styling</CardTitle>
                                        <Badge variant="warning">In progress</Badge>
                                    </div>
                                </CardHeader>
                                <CardBody>
                                    Tailwind v4 with a clean component library. Dark mode coming soon.
                                </CardBody>
                                <CardFooter>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="px-0 hover:bg-transparent underline underline-offset-4"
                                    >
                                        Learn more →
                                    </Button>
                                </CardFooter>
                            </Card>
                        </div>
                    }
                    code={`<Card>
    <CardHeader>
        <div className="flex items-center justify-between">
            <CardTitle>Authentication</CardTitle>
            <Badge variant="success">Ready</Badge>
        </div>
    </CardHeader>
    <CardBody>
        JWT-based auth with bcrypt password hashing baked in from day one.
    </CardBody>
    <CardFooter>
        <Button variant="ghost" size="sm">Learn more →</Button>
    </CardFooter>
</Card>`}
                />
            </div>
        </main>
    )
}
