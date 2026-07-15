import { ProbeSelector } from './components/ProbeSelector'
import { TargetSelector } from './components/TargetSelector'

export default function FlashPage() {
  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Flash 烧录</h1>
        <p className="text-sm text-muted-foreground mt-1">
          固件烧录、擦除、校验
        </p>
      </div>

      {/* 仿真器选择 + 目标信息 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ProbeSelector />
        <TargetSelector />
      </div>
    </div>
  )
}
