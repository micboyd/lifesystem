import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button'
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from '../components/Card'
import Badge from '../components/Badge'
import Input from '../components/Input'
import Alert from '../components/Alert'
import Tabs from '../components/Tabs'
import Switch from '../components/Switch'
import Checkbox from '../components/Checkbox'
import Avatar from '../components/Avatar'
import Spinner from '../components/Spinner'
import Progress from '../components/Progress'
import DatePicker from '../components/DatePicker'
import Container from '../components/Container'
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
    // Helpers for the Date Picker disabled/error demo (relative to today).
    const today = new Date()
    const isoDay = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const plusDays = (n: number) =>
        isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n))

    return (
        <main className="min-h-screen bg-white">
            {/* Header */}
            <section className="border-b border-neutral-100 pt-12 pb-10">
                <Container>
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
                </Container>
            </section>

            {/* Sections */}
            <Container className="py-16 space-y-16">
                <Section
                    title="Container"
                    description="Centered, max-width (6xl) page wrapper with consistent horizontal padding. The navbar and every page use it so their edges line up."
                    preview={
                        <Container className="rounded-xl border border-dashed border-neutral-300 bg-white py-6 text-center text-sm text-neutral-500">
                            Centered content — max-w-6xl with responsive padding
                        </Container>
                    }
                    code={`<Container>
    <YourContent />
</Container>

{/* Render as a different element */}
<Container as="main" className="py-16">…</Container>`}
                />

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
                            <div className="flex flex-wrap items-center gap-4">
                                <Button icon="fa-solid fa-plus">New item</Button>
                                <Button variant="secondary" icon="fa-solid fa-arrow-right" iconPosition="right">
                                    Continue
                                </Button>
                                <Button variant="ghost" icon="fa-solid fa-trash">
                                    Delete
                                </Button>
                            </div>
                            <Button fullWidth icon="fa-solid fa-rocket">
                                Full width
                            </Button>
                        </div>
                    }
                    code={`<Button size="sm">Small</Button>
<Button>Medium</Button>
<Button size="lg">Large</Button>

<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button disabled>Disabled</Button>

{/* With Font Awesome icons */}
<Button icon="fa-solid fa-plus">New item</Button>
<Button variant="secondary" icon="fa-solid fa-arrow-right" iconPosition="right">Continue</Button>
<Button variant="ghost" icon="fa-solid fa-trash">Delete</Button>

<Button fullWidth icon="fa-solid fa-rocket">Full width</Button>`}
                />

                <Section
                    title="Inputs"
                    description="Text fields with labels, hints, error states, and disabled state."
                    preview={
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                            <Input
                                label="Email"
                                type="email"
                                placeholder="you@example.com"
                                icon="fa-solid fa-envelope"
                            />
                            <Input
                                label="Password"
                                type="password"
                                placeholder="••••••••"
                                icon="fa-solid fa-lock"
                            />
                            <Input
                                label="Search"
                                placeholder="Search…"
                                icon="fa-solid fa-magnifying-glass"
                            />
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
                    code={`<Input label="Email" type="email" placeholder="you@example.com" icon="fa-solid fa-envelope" />
<Input label="Password" type="password" placeholder="••••••••" icon="fa-solid fa-lock" />
<Input label="Search" placeholder="Search…" icon="fa-solid fa-magnifying-glass" />
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

                <Section
                    title="Alerts"
                    description="Inline messages with four variants. Each shows a matching icon automatically; pass onClose for a dismiss button, or icon to override."
                    preview={
                        <div className="max-w-2xl space-y-3">
                            <Alert variant="info" title="Heads up" onClose={() => {}}>
                                This is an informational message.
                            </Alert>
                            <Alert variant="success" title="Saved">
                                Your changes have been saved successfully.
                            </Alert>
                            <Alert variant="warning" title="Careful">
                                This action may have unintended consequences.
                            </Alert>
                            <Alert variant="danger" title="Something went wrong">
                                We couldn&apos;t complete your request. Please try again.
                            </Alert>
                        </div>
                    }
                    code={`<Alert variant="info" title="Heads up" onClose={handleClose}>This is an informational message.</Alert>
<Alert variant="success" title="Saved">Your changes have been saved successfully.</Alert>
<Alert variant="warning" title="Careful">This action may have unintended consequences.</Alert>
<Alert variant="danger" title="Something went wrong">We couldn't complete your request.</Alert>

{/* Override the auto icon */}
<Alert variant="info" icon="fa-solid fa-rocket" title="Launched">Override the default icon.</Alert>`}
                />

                <Section
                    title="Tabs"
                    description="Segmented pill control. Uncontrolled by default, or pass value/onChange."
                    preview={<Tabs tabs={['Overview', 'Activity', 'Settings']} />}
                    code={`<Tabs tabs={['Overview', 'Activity', 'Settings']} />

{/* Controlled */}
<Tabs tabs={tabs} value={active} onChange={setActive} />`}
                />

                <Section
                    title="Switch"
                    description="Toggle for boolean settings. Supports controlled and disabled states."
                    preview={
                        <div className="flex flex-col gap-4">
                            <Switch label="Email notifications" defaultChecked />
                            <Switch label="Public profile" />
                            <Switch label="Disabled" disabled />
                        </div>
                    }
                    code={`<Switch label="Email notifications" defaultChecked />
<Switch label="Public profile" />
<Switch label="Disabled" disabled />

{/* Controlled */}
<Switch label="Dark mode" checked={dark} onChange={setDark} />`}
                />

                <Section
                    title="Checkbox"
                    description="Styled checkbox with label, checked, and disabled states."
                    preview={
                        <div className="flex flex-col gap-3">
                            <Checkbox label="Accept terms and conditions" defaultChecked />
                            <Checkbox label="Subscribe to the newsletter" />
                            <Checkbox label="Disabled option" disabled />
                        </div>
                    }
                    code={`<Checkbox label="Accept terms and conditions" defaultChecked />
<Checkbox label="Subscribe to the newsletter" />
<Checkbox label="Disabled option" disabled />`}
                />

                <Section
                    title="Avatar"
                    description="Image avatar with initials fallback in three sizes."
                    preview={
                        <div className="flex items-center gap-4">
                            <Avatar name="Ada Lovelace" size="sm" />
                            <Avatar name="Grace Hopper" />
                            <Avatar name="Alan Turing" size="lg" />
                            <Avatar
                                size="lg"
                                name="Photo"
                                src="https://i.pravatar.cc/120?img=12"
                            />
                        </div>
                    }
                    code={`<Avatar name="Ada Lovelace" size="sm" />
<Avatar name="Grace Hopper" />
<Avatar name="Alan Turing" size="lg" />
<Avatar size="lg" name="Photo" src="https://i.pravatar.cc/120?img=12" />`}
                />

                <Section
                    title="Spinner"
                    description="Loading indicator in three sizes."
                    preview={
                        <div className="flex items-center gap-6">
                            <Spinner size="sm" />
                            <Spinner />
                            <Spinner size="lg" />
                        </div>
                    }
                    code={`<Spinner size="sm" />
<Spinner />
<Spinner size="lg" />`}
                />

                <Section
                    title="Progress"
                    description="Progress bar with optional label and a success variant."
                    preview={
                        <div className="max-w-md space-y-6">
                            <Progress value={35} />
                            <Progress value={70} showLabel />
                            <Progress value={100} variant="success" showLabel />
                        </div>
                    }
                    code={`<Progress value={35} />
<Progress value={70} showLabel />
<Progress value={100} variant="success" showLabel />`}
                />

                <Section
                    title="Date Picker"
                    description="Calendar dropdown for a single date or a date range, with hover preview and a clear button. Supports min/max bounds, disabled dates, and error (red) dates. Uncontrolled by default, or pass value/onChange."
                    preview={
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                            <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    Single date
                                </p>
                                <DatePicker className="max-w-xs" />
                            </div>
                            <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    Date range
                                </p>
                                <DatePicker mode="range" className="max-w-xs" />
                            </div>
                            <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    Disabled + error dates
                                </p>
                                <DatePicker
                                    className="max-w-xs"
                                    minDate={isoDay(today)}
                                    disabledDates={(d) => d.getDay() === 0 || d.getDay() === 6}
                                    errorDates={[plusDays(3), plusDays(4)]}
                                />
                                <p className="mt-1.5 text-xs text-neutral-400">
                                    Past dates &amp; weekends disabled; two days flagged red.
                                </p>
                            </div>
                        </div>
                    }
                    code={`<DatePicker />
<DatePicker mode="range" />

{/* Controlled — single returns "YYYY-MM-DD", range returns { start, end } */}
<DatePicker value={date} onChange={setDate} />
<DatePicker mode="range" value={range} onChange={setRange} />

{/* Bounds, disabled days, and error (red) days */}
<DatePicker
    minDate="2026-06-04"
    maxDate="2026-12-31"
    disabledDates={(date) => date.getDay() === 0 || date.getDay() === 6}
    errorDates={['2026-06-07', '2026-06-08']}
/>`}
                />
            </Container>
        </main>
    )
}
