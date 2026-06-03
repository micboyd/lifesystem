import Button from '../components/Button'
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from '../components/Card'
import Badge from '../components/Badge'
import Input from '../components/Input'

export default function Home() {
    return (
        <main className="min-h-screen bg-neutral-50">
            {/* Hero */}
            <section className="bg-black text-white px-6 py-24">
                <div className="max-w-6xl mx-auto">
                    <p className="text-xs font-bold tracking-widest uppercase text-neutral-400 mb-4">
                        Lifesystem — v1.0
                    </p>
                    <h1 className="text-6xl font-black tracking-tighter leading-none mb-6">
                        Build something
                        <br />
                        that matters.
                    </h1>
                    <p className="text-neutral-400 text-lg max-w-xl mb-10">
                        A modern MERN stack starter. React, TypeScript, Express, and MongoDB — ready
                        to ship.
                    </p>
                    <div className="flex items-center gap-4">
                        <Button size="lg">Get started</Button>
                        <Button
                            size="lg"
                            variant="ghost"
                            className="text-white hover:bg-neutral-800"
                        >
                            Learn more
                        </Button>
                    </div>
                </div>
            </section>

            {/* Component showcase */}
            <section className="max-w-6xl mx-auto px-6 py-20 space-y-16">
                {/* Badges */}
                <div>
                    <h2 className="text-2xl font-black tracking-tight mb-6">Badges</h2>
                    <div className="flex flex-wrap items-center gap-3">
                        <Badge>Default</Badge>
                        <Badge variant="outline">Outline</Badge>
                        <Badge variant="success">Success</Badge>
                        <Badge variant="warning">Warning</Badge>
                        <Badge variant="danger">Danger</Badge>
                    </div>
                </div>

                {/* Buttons */}
                <div>
                    <h2 className="text-2xl font-black tracking-tight mb-6">Buttons</h2>
                    <div className="flex flex-wrap items-center gap-4 mb-4">
                        <Button size="sm">Small</Button>
                        <Button>Medium</Button>
                        <Button size="lg">Large</Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 mb-4">
                        <Button variant="secondary">Secondary</Button>
                        <Button variant="ghost">Ghost</Button>
                        <Button disabled>Disabled</Button>
                    </div>
                    <Button fullWidth>Full width</Button>
                </div>

                {/* Inputs */}
                <div>
                    <h2 className="text-2xl font-black tracking-tight mb-6">Inputs</h2>
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
                </div>

                {/* Cards */}
                <div>
                    <h2 className="text-2xl font-black tracking-tight mb-6">Cards</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            {
                                title: 'Authentication',
                                body: 'JWT-based auth with bcrypt password hashing baked in from day one.',
                                badge: 'Ready' as const,
                            },
                            {
                                title: 'Database',
                                body: 'MongoDB with Mongoose schemas and TypeScript interfaces throughout.',
                                badge: 'Ready' as const,
                            },
                            {
                                title: 'Styling',
                                body: 'Tailwind v4 with a clean component library. Dark mode coming soon.',
                                badge: 'In progress' as const,
                            },
                        ].map(({ title, body, badge }) => (
                            <Card key={title}>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle>{title}</CardTitle>
                                        <Badge variant={badge === 'Ready' ? 'success' : 'warning'}>
                                            {badge}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardBody>{body}</CardBody>
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
                        ))}
                    </div>
                </div>
            </section>
        </main>
    )
}
