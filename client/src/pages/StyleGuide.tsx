import { useState, type ReactNode } from 'react'
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
import TimePicker from '../components/TimePicker'
import Container from '../components/Container'
import Textarea from '../components/Textarea'
import Select from '../components/Select'
import RadioGroup from '../components/RadioGroup'
import Slider from '../components/Slider'
import Chip from '../components/Chip'
import EmptyState from '../components/EmptyState'
import Rating from '../components/Rating'
import Breadcrumbs from '../components/Breadcrumbs'
import Pagination from '../components/Pagination'
import Accordion from '../components/Accordion'
import Tooltip from '../components/Tooltip'
import DropdownMenu from '../components/DropdownMenu'
import Modal from '../components/Modal'
import Drawer from '../components/Drawer'
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

function ChipDemo() {
    const [chips, setChips] = useState(['Design', 'Engineering', 'Marketing', 'Sales'])
    return (
        <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
                <Chip
                    key={c}
                    icon="fa-solid fa-tag"
                    onRemove={() => setChips((x) => x.filter((y) => y !== c))}
                >
                    {c}
                </Chip>
            ))}
            {chips.length === 0 && (
                <span className="text-sm text-neutral-400">All removed — refresh to reset.</span>
            )}
        </div>
    )
}

function PaginationDemo() {
    const [page, setPage] = useState(1)
    return <Pagination page={page} pageCount={10} onChange={setPage} />
}

function ModalDemo() {
    const [open, setOpen] = useState(false)
    return (
        <>
            <Button onClick={() => setOpen(true)} icon="fa-solid fa-window-restore">
                Open modal
            </Button>
            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title="Delete project"
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={() => setOpen(false)}>Delete</Button>
                    </>
                }
            >
                This action cannot be undone. This will permanently delete the project and all of
                its data.
            </Modal>
        </>
    )
}

function DrawerDemo() {
    const [side, setSide] = useState<'left' | 'right' | null>(null)
    return (
        <>
            <div className="flex flex-wrap gap-3">
                <Button
                    variant="secondary"
                    onClick={() => setSide('left')}
                    icon="fa-solid fa-arrow-right-from-bracket"
                >
                    Open left
                </Button>
                <Button
                    variant="secondary"
                    onClick={() => setSide('right')}
                    icon="fa-solid fa-arrow-left-from-bracket"
                >
                    Open right
                </Button>
            </div>
            <Drawer
                open={side === 'left'}
                onClose={() => setSide(null)}
                side="left"
                title="Filters"
                footer={<Button onClick={() => setSide(null)}>Apply</Button>}
            >
                Drawer content slides in from the left. Put filters, details, or forms here.
            </Drawer>
            <Drawer
                open={side === 'right'}
                onClose={() => setSide(null)}
                side="right"
                title="Details"
                footer={<Button onClick={() => setSide(null)}>Done</Button>}
            >
                Drawer content slides in from the right.
            </Drawer>
        </>
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
                                <Button
                                    variant="secondary"
                                    icon="fa-solid fa-arrow-right"
                                    iconPosition="right"
                                >
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
                                    JWT-based auth with bcrypt password hashing baked in from day
                                    one.
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
                                    Tailwind v4 with a clean component library. Dark mode coming
                                    soon.
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
                            <Avatar size="lg" name="Photo" src="https://i.pravatar.cc/120?img=12" />
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

                <Section
                    title="Time Picker"
                    description="Dropdown for picking a time, with scrollable hour/minute columns and a clear button. Supports 12- or 24-hour display, a configurable minute step, and min/max bounds. Value is a 24-hour 'HH:mm' string. Uncontrolled by default, or pass value/onChange."
                    preview={
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                            <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    24-hour
                                </p>
                                <TimePicker className="max-w-xs" />
                            </div>
                            <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    12-hour (AM/PM)
                                </p>
                                <TimePicker use12Hour minuteStep={15} className="max-w-xs" />
                            </div>
                            <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    Bounded (09:00–17:30)
                                </p>
                                <TimePicker
                                    className="max-w-xs"
                                    minTime="09:00"
                                    maxTime="17:30"
                                    minuteStep={30}
                                />
                                <p className="mt-1.5 text-xs text-neutral-400">
                                    Times outside business hours are disabled.
                                </p>
                            </div>
                        </div>
                    }
                    code={`<TimePicker />
<TimePicker use12Hour minuteStep={15} />

{/* Controlled — value is 24-hour "HH:mm" */}
<TimePicker value={time} onChange={setTime} />

{/* Bounds */}
<TimePicker minTime="09:00" maxTime="17:30" minuteStep={30} />`}
                />

                <Section
                    title="Select"
                    description="Custom dropdown select (not the native element) matching the Input/DatePicker styling. Uncontrolled by default, or pass value/onChange."
                    preview={
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:max-w-2xl">
                            <Select
                                label="Fruit"
                                icon="fa-solid fa-apple-whole"
                                options={[
                                    { label: 'Apple', value: 'apple' },
                                    { label: 'Banana', value: 'banana' },
                                    { label: 'Cherry', value: 'cherry' },
                                    { label: 'Durian (sold out)', value: 'durian', disabled: true },
                                ]}
                                defaultValue="banana"
                            />
                            <Select
                                label="With placeholder"
                                placeholder="Choose a plan…"
                                options={[
                                    { label: 'Free', value: 'free' },
                                    { label: 'Pro', value: 'pro' },
                                    { label: 'Enterprise', value: 'enterprise' },
                                ]}
                            />
                        </div>
                    }
                    code={`<Select
    label="Fruit"
    icon="fa-solid fa-apple-whole"
    options={[
        { label: 'Apple', value: 'apple' },
        { label: 'Banana', value: 'banana' },
        { label: 'Durian (sold out)', value: 'durian', disabled: true },
    ]}
    defaultValue="banana"
/>

{/* Controlled */}
<Select options={options} value={value} onChange={setValue} />`}
                />

                <Section
                    title="Radio Group"
                    description="Styled radio buttons matching the Checkbox. Vertical or horizontal."
                    preview={
                        <div className="flex flex-col gap-8">
                            <RadioGroup
                                defaultValue="medium"
                                options={[
                                    { label: 'Small', value: 'small' },
                                    { label: 'Medium', value: 'medium' },
                                    { label: 'Large', value: 'large' },
                                    { label: 'X-Large (unavailable)', value: 'xl', disabled: true },
                                ]}
                            />
                            <RadioGroup
                                orientation="horizontal"
                                defaultValue="card"
                                options={[
                                    { label: 'Card', value: 'card' },
                                    { label: 'PayPal', value: 'paypal' },
                                    { label: 'Bank transfer', value: 'bank' },
                                ]}
                            />
                        </div>
                    }
                    code={`<RadioGroup
    defaultValue="medium"
    options={[
        { label: 'Small', value: 'small' },
        { label: 'Medium', value: 'medium' },
        { label: 'Large', value: 'large' },
    ]}
/>

<RadioGroup orientation="horizontal" options={options} value={value} onChange={setValue} />`}
                />

                <Section
                    title="Slider"
                    description="Range input with the neutral-950 accent. Optional label and value readout."
                    preview={
                        <div className="flex max-w-md flex-col gap-8">
                            <Slider label="Volume" defaultValue={40} showValue />
                            <Slider
                                label="Brightness"
                                min={0}
                                max={10}
                                step={1}
                                defaultValue={7}
                                showValue
                            />
                            <Slider defaultValue={60} disabled />
                        </div>
                    }
                    code={`<Slider label="Volume" defaultValue={40} showValue />
<Slider label="Brightness" min={0} max={10} step={1} defaultValue={7} showValue />
<Slider defaultValue={60} disabled />

{/* Controlled */}
<Slider value={value} onChange={setValue} />`}
                />

                <Section
                    title="Textarea"
                    description="Multiline text field mirroring the Input chrome, with label, hint, and error states."
                    preview={
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:max-w-2xl">
                            <Textarea
                                label="Bio"
                                placeholder="Tell us about yourself…"
                                hint="Max 200 characters."
                            />
                            <Textarea
                                label="Feedback"
                                placeholder="What went wrong?"
                                error="This field is required."
                            />
                        </div>
                    }
                    code={`<Textarea label="Bio" placeholder="Tell us about yourself…" hint="Max 200 characters." />
<Textarea label="Feedback" placeholder="What went wrong?" error="This field is required." />`}
                />

                <Section
                    title="Chip / Tag"
                    description="Compact, removable tags (distinct from Badge). Add onRemove for a dismiss button."
                    preview={<ChipDemo />}
                    code={`<Chip icon="fa-solid fa-tag">Design</Chip>

{/* Removable */}
<Chip onRemove={() => remove(item)}>Engineering</Chip>`}
                />

                <Section
                    title="Rating"
                    description="Star rating with hover preview. Interactive or read-only, in three sizes."
                    preview={
                        <div className="flex flex-col gap-4">
                            <Rating defaultValue={3} />
                            <Rating defaultValue={4} size="lg" />
                            <Rating value={4} readOnly size="sm" />
                        </div>
                    }
                    code={`<Rating defaultValue={3} />
<Rating defaultValue={4} size="lg" />
<Rating value={4} readOnly size="sm" />

{/* Controlled */}
<Rating value={value} onChange={setValue} />`}
                />

                <Section
                    title="Empty State"
                    description="Icon + title + message + optional action, for empty lists and zero-results."
                    preview={
                        <EmptyState
                            icon="fa-regular fa-folder-open"
                            title="No projects yet"
                            description="Create your first project to get started — it only takes a minute."
                            action={<Button icon="fa-solid fa-plus">New project</Button>}
                        />
                    }
                    code={`<EmptyState
    icon="fa-regular fa-folder-open"
    title="No projects yet"
    description="Create your first project to get started."
    action={<Button icon="fa-solid fa-plus">New project</Button>}
/>`}
                />

                <Section
                    title="Breadcrumbs"
                    description="Path navigation. Linked items use the router; the last item is the current page."
                    preview={
                        <Breadcrumbs
                            items={[
                                { label: 'Home', href: '/' },
                                { label: 'Style Guide', href: '/styleguide' },
                                { label: 'Breadcrumbs' },
                            ]}
                        />
                    }
                    code={`<Breadcrumbs
    items={[
        { label: 'Home', href: '/' },
        { label: 'Style Guide', href: '/styleguide' },
        { label: 'Breadcrumbs' },
    ]}
/>`}
                />

                <Section
                    title="Pagination"
                    description="Page controls with prev/next and ellipsis truncation. Controlled via page/onChange."
                    preview={<PaginationDemo />}
                    code={`const [page, setPage] = useState(1)

<Pagination page={page} pageCount={10} onChange={setPage} />`}
                />

                <Section
                    title="Accordion"
                    description="Collapsible sections with a smooth height transition. Single-open by default, or allowMultiple."
                    preview={
                        <Accordion
                            className="w-full bg-white"
                            defaultOpen={0}
                            items={[
                                {
                                    title: 'What is Lifesystem?',
                                    content:
                                        'A modern MERN starter with a clean, rounded component library built on Tailwind.',
                                },
                                {
                                    title: 'Can I use these components elsewhere?',
                                    content:
                                        'Yes — every component is self-contained and copy-paste friendly from this style guide.',
                                },
                                {
                                    title: 'Does it support dark mode?',
                                    content:
                                        'Not yet, but the neutral palette makes it straightforward to add later.',
                                },
                            ]}
                        />
                    }
                    code={`<Accordion
    defaultOpen={0}
    items={[
        { title: 'What is Lifesystem?', content: 'A modern MERN starter…' },
        { title: 'Can I reuse these?', content: 'Yes — copy-paste friendly.' },
    ]}
/>

{/* Allow several open at once */}
<Accordion allowMultiple items={items} />`}
                />

                <Section
                    title="Tooltip"
                    description="Hover/focus hint that wraps any element. Four placements."
                    preview={
                        <div className="flex flex-wrap items-center gap-4">
                            <Tooltip content="Top tooltip">
                                <Button variant="secondary">Top</Button>
                            </Tooltip>
                            <Tooltip content="Bottom tooltip" placement="bottom">
                                <Button variant="secondary">Bottom</Button>
                            </Tooltip>
                            <Tooltip content="Right tooltip" placement="right">
                                <Button variant="secondary">Right</Button>
                            </Tooltip>
                            <Tooltip content="Copy to clipboard">
                                <span className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 text-neutral-500">
                                    <i className="fa-solid fa-copy" aria-hidden="true" />
                                </span>
                            </Tooltip>
                        </div>
                    }
                    code={`<Tooltip content="Copy to clipboard">
    <Button variant="secondary">Hover me</Button>
</Tooltip>

<Tooltip content="Bottom" placement="bottom">…</Tooltip>`}
                />

                <Section
                    title="Dropdown Menu"
                    description="Anchored action menu with icons, dividers, and danger items. Self-managed open state."
                    preview={
                        <DropdownMenu
                            trigger={
                                <Button variant="secondary" icon="fa-solid fa-ellipsis">
                                    Actions
                                </Button>
                            }
                            items={[
                                { label: 'Edit', icon: 'fa-solid fa-pen' },
                                { label: 'Duplicate', icon: 'fa-solid fa-copy' },
                                { label: 'Share', icon: 'fa-solid fa-share' },
                                'divider',
                                { label: 'Delete', icon: 'fa-solid fa-trash', danger: true },
                            ]}
                        />
                    }
                    code={`<DropdownMenu
    trigger={<Button variant="secondary" icon="fa-solid fa-ellipsis">Actions</Button>}
    items={[
        { label: 'Edit', icon: 'fa-solid fa-pen', onClick: onEdit },
        { label: 'Share', icon: 'fa-solid fa-share', href: '/share' },
        'divider',
        { label: 'Delete', icon: 'fa-solid fa-trash', danger: true, onClick: onDelete },
    ]}
/>`}
                />

                <Section
                    title="Modal"
                    description="Centered dialog rendered in a portal. Closes on Esc, backdrop click, or the × button. Optional title and footer."
                    preview={<ModalDemo />}
                    code={`const [open, setOpen] = useState(false)

<Button onClick={() => setOpen(true)}>Open modal</Button>
<Modal
    open={open}
    onClose={() => setOpen(false)}
    title="Delete project"
    footer={
        <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={confirmDelete}>Delete</Button>
        </>
    }
>
    This action cannot be undone.
</Modal>`}
                />

                <Section
                    title="Drawer"
                    description="Side panel that slides in from the left or right. Shares the modal's portal, backdrop, Esc, and scroll-lock behavior."
                    preview={<DrawerDemo />}
                    code={`const [open, setOpen] = useState(false)

<Button onClick={() => setOpen(true)}>Open drawer</Button>
<Drawer open={open} onClose={() => setOpen(false)} side="right" title="Details">
    Drawer content goes here.
</Drawer>`}
                />
            </Container>
        </main>
    )
}
