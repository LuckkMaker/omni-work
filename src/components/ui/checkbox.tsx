import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * shadcn/ui 官方 Checkbox 实现（基于 @radix-ui/react-checkbox）
 *
 * 与原自定义版本 API 兼容：
 *   <Checkbox checked={x} onCheckedChange={(v) => ...} disabled={...} title="..." />
 *
 * Radix 的 onCheckedChange 回调参数类型为 CheckedState（boolean | 'indeterminate'），
 * 此处过滤为 boolean 以保持向下兼容。
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'onCheckedChange'> & {
    onCheckedChange?: (checked: boolean) => void
    title?: string
  }
>(function Checkbox({ className, onCheckedChange, title, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      title={title}
      onCheckedChange={(v) => onCheckedChange?.(v === true)}
      className={cn(
        'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn('flex items-center justify-center text-current')}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
})

export { Checkbox }
