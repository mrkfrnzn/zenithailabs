import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-zinc-800 text-zinc-100 border border-zinc-700',
        amber: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
        green: 'bg-green-500/20 text-green-400 border border-green-500/30',
        red: 'bg-red-500/20 text-red-400 border border-red-500/30',
        blue: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
        purple: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
        orange: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
