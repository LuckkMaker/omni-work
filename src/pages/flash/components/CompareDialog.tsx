import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useFlashStore } from '@/stores/flash.store'

export function CompareDialog() {
  const { showCompareDialog, setShowCompareDialog, doCompare } = useFlashStore()

  const handleSelectFile = async () => {
    const path = await window.electron?.openFileDialog?.()
    if (!path) return
    doCompare(path)
  }

  return (
    <Dialog open={showCompareDialog} onOpenChange={(open) => { if (!open) setShowCompareDialog(false) }}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>比较</DialogTitle>
          <DialogDescription>选择一个文件与当前 tab 数据进行逐字节对比</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCompareDialog(false)}>取消</Button>
          <Button onClick={handleSelectFile}>选择文件...</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
