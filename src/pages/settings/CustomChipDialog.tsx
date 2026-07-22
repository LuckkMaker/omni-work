import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, FileCode, FolderOpen } from 'lucide-react'
import { createCustomDevice, extractFlmInfo } from '@/services/device.service'
import { useNotificationStore } from '@/stores/notification.store'
import type { CustomDeviceCreate } from '@shared/types'

interface CustomChipDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const CORE_OPTIONS = [
  'Cortex-M0', 'Cortex-M0+', 'Cortex-M1', 'Cortex-M3',
  'Cortex-M4', 'Cortex-M7', 'Cortex-M23', 'Cortex-M33', 'Cortex-M55',
]

const EMPTY_FORM = {
  flm_path: '',
  part_number: '',
  display_name: '',
  vendor: 'Custom',
  core: 'Cortex-M4',
  flash_base_address: '0x08000000',
  flash_size: '256',
  ram_base_address: '0x20000000',
  ram_size: '64',
  sector_size: '0x400',
  page_size: '0x400',
}

export function CustomChipDialog({ open, onOpenChange, onSuccess }: CustomChipDialogProps) {
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [creating, setCreating] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const notify = useNotificationStore((s) => s.push)

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSelectFlm = async () => {
    const path = await window.electron.openFileDialog({ extensions: ['FLM'], title: '选择 FLM Flash 算法文件' })
    if (!path) return
    update('flm_path', path)

    // 自动提取参数
    setExtracting(true)
    try {
      const info = await extractFlmInfo(path)
      if (info.flash_base) update('flash_base_address', info.flash_base as string)
      if (info.flash_size) update('flash_size', String(info.flash_size))
      if (info.page_size) update('page_size', info.page_size as string)
    } catch {
      // 提取失败不致命
    } finally {
      setExtracting(false)
    }
  }

  const handleSubmit = async () => {
    if (!form.flm_path) { notify({ type: 'warning', title: '请先选择 FLM 文件' }); return }
    if (!form.part_number) { notify({ type: 'warning', title: '请输入芯片型号' }); return }

    setCreating(true)
    try {
      const req: CustomDeviceCreate = {
        flm_path: form.flm_path,
        part_number: form.part_number,
        core: form.core,
        flash_base_address: form.flash_base_address,
        flash_size: parseInt(form.flash_size) || 0,
        ram_base_address: form.ram_base_address,
        ram_size: parseInt(form.ram_size) || 0,
        vendor: form.vendor,
        display_name: form.display_name || form.part_number,
      }
      await createCustomDevice(req)
      notify({ type: 'success', title: `自定义芯片 ${form.part_number} 创建成功` })
      setForm({ ...EMPTY_FORM })
      onOpenChange(false)
      onSuccess()
    } catch (e) {
      notify({ type: 'error', title: '创建自定义芯片失败', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setCreating(false)
    }
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      // 关闭时重置表单
      setForm({ ...EMPTY_FORM })
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="size-4" />
            添加自定义芯片
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* FLM 文件选择 */}
          <div className="space-y-1.5">
            <Label>FLM Flash 算法文件</Label>
            <div className="flex items-center gap-2">
              <Input
                value={form.flm_path}
                placeholder="选择 .FLM 文件..."
                className="font-mono text-xs"
                readOnly
              />
              <Button variant="outline" size="sm" onClick={handleSelectFlm} disabled={extracting}>
                {extracting ? <Loader2 className="size-3.5 animate-spin" /> : <FolderOpen className="size-3.5" />}
                选择文件
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              FLM 文件包含 Flash 擦除/编程算法，可从芯片厂商获取或从 CMSIS-Pack 中提取
            </p>
          </div>

          {/* 基本信息分组 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>芯片型号 <span className="text-red-500">*</span></Label>
              <Input
                value={form.part_number}
                onChange={(e) => update('part_number', e.target.value)}
                placeholder="my-custom-mcu"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>显示名称</Label>
              <Input
                value={form.display_name}
                onChange={(e) => update('display_name', e.target.value)}
                placeholder="留空则使用型号"
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>厂商</Label>
              <Input
                value={form.vendor}
                onChange={(e) => update('vendor', e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>内核</Label>
              <Select value={form.core} onValueChange={(v) => update('core', v)}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CORE_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Flash 区域分组 */}
          <div className="rounded-md border border-border p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Flash 区域</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">基地址</Label>
                <Input
                  value={form.flash_base_address}
                  onChange={(e) => update('flash_base_address', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">大小 (KB)</Label>
                <Input
                  type="number"
                  value={form.flash_size}
                  onChange={(e) => update('flash_size', e.target.value)}
                  className="text-xs tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">扇区大小 (hex)</Label>
                <Input
                  value={form.sector_size}
                  onChange={(e) => update('sector_size', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">页大小 (hex)</Label>
                <Input
                  value={form.page_size}
                  onChange={(e) => update('page_size', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* RAM 区域分组 */}
          <div className="rounded-md border border-border p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">RAM 区域</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">基地址</Label>
                <Input
                  value={form.ram_base_address}
                  onChange={(e) => update('ram_base_address', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">大小 (KB)</Label>
                <Input
                  type="number"
                  value={form.ram_size}
                  onChange={(e) => update('ram_size', e.target.value)}
                  className="text-xs tabular-nums"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={creating}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : null}
            添加芯片
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
