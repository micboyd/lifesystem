import { Card } from '../Card'
import Badge from '../Badge'

interface StatCardProps {
    label: string
    value: string
    /** Font Awesome class string, e.g. "fa-solid fa-fire". */
    icon: string
    /** Optional trend shown as a badge, e.g. "+12%". */
    trend?: string
    trendVariant?: 'success' | 'warning' | 'danger'
}

export default function StatCard({
    label,
    value,
    icon,
    trend,
    trendVariant = 'success',
}: StatCardProps) {
    return (
        <Card className="p-5">
            <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-100 text-neutral-500">
                    <i className={icon} aria-hidden="true" />
                </span>
                {trend && <Badge variant={trendVariant}>{trend}</Badge>}
            </div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-neutral-950 tabular-nums">
                {value}
            </p>
            <p className="mt-0.5 text-sm text-neutral-400">{label}</p>
        </Card>
    )
}
