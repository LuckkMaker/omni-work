import * as React from 'react'
import { cn } from '@/lib/utils'

interface SwitchProps {
  /** 是否开启 */
  checked: boolean
  /** 切换回调 */
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  title?: string
}

/** 紧凑开关组件（仿 shadcn/ui Switch）
 *
 * 用于右侧边栏两态配置项，比按钮+文字"开/关"更紧凑。
 */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch({ checked, onCheckedChange, disabled, className, title }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        title={title}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'peer inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-input',
          className
        )}
      >
        <span
          className={cn(
            'pointer-events-none block size-3 rounded-full bg-background shadow-lg ring-0 transition-transform',
            checked ? 'translate-x-3' : 'translate-x-0'
          )}
        />
      </button>
    )
  }
)
