# shadcn/ui 风格与规则

本项目的 UI 基于 shadcn/ui 组件系统，使用 CSS 变量 + Tailwind CSS 实现主题化。主题为亮色主题（不使用暗色模式）。

## 1. 核心配置

### components.json

```json
{
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/styles/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### tailwind.config.js 关键配置

```js
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,jsx,ts,tsx}', './electron/**/*.{js,ts}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' }
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
```

## 2. CSS 变量体系

所有颜色以 `H S% L%` 格式存储，通过 `hsl(var(--xxx))` 引用。`--radius` 为 `0.5rem`。本项目仅使用亮色主题，不定义 `.dark` 变量。

### globals.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
}
```

## 3. 主题色速查表

配色方案：shadcn/ui `slate` 基色 + `blue` 主色。仅使用亮色主题。

### 色板总览

| 语义 Token | 用途 | HSL | HEX | Tailwind 色阶 |
|-----------|------|-----|-----|-------------|
| `--background` | 页面底色 | `0 0% 100%` | `#ffffff` | slate-0 |
| `--foreground` | 正文文字 | `222.2 84% 4.9%` | `#0f172a` | slate-950 |
| `--card` | 卡片背景 | `0 0% 100%` | `#ffffff` | slate-0 |
| `--card-foreground` | 卡片内文字 | `222.2 84% 4.9%` | `#0f172a` | slate-950 |
| `--popover` | 弹出层背景 | `0 0% 100%` | `#ffffff` | slate-0 |
| `--popover-foreground` | 弹出层文字 | `222.2 84% 4.9%` | `#0f172a` | slate-950 |
| `--primary` | 主色（按钮/链接/高亮） | `221.2 83.2% 53.3%` | `#2563eb` | blue-600 |
| `--primary-foreground` | 主色上的文字 | `210 40% 98%` | `#f8fafc` | slate-50 |
| `--secondary` | 次级背景 | `210 40% 96.1%` | `#f1f5f9` | slate-100 |
| `--secondary-foreground` | 次级背景上文字 | `222.2 47.4% 11.2%` | `#1e293b` | slate-800 |
| `--muted` | 静默背景（侧边栏底色） | `210 40% 96.1%` | `#f1f5f9` | slate-100 |
| `--muted-foreground` | 辅助文字（描述/标签） | `215.4 16.3% 46.9%` | `#64748b` | slate-500 |
| `--accent` | hover 高亮背景 | `210 40% 96.1%` | `#f1f5f9` | slate-100 |
| `--accent-foreground` | hover 高亮上文字 | `222.2 47.4% 11.2%` | `#1e293b` | slate-800 |
| `--destructive` | 危险/删除操作 | `0 84.2% 60.2%` | `#ef4444` | red-500 |
| `--destructive-foreground` | 危险色上的文字 | `210 40% 98%` | `#f8fafc` | slate-50 |
| `--border` | 边框/分割线 | `214.3 31.8% 91.4%` | `#e2e8f0` | slate-200 |
| `--input` | 输入框边框 | `214.3 31.8% 91.4%` | `#e2e8f0` | slate-200 |
| `--ring` | 聚焦环色 | `221.2 83.2% 53.3%` | `#2563eb` | blue-600 |
| `--radius` | 圆角基准 | `0.5rem` | — | — |

### 色彩层级关系

```
层级        HEX        Tailwind
底色        #ffffff    background
表面        #ffffff    card
静默表面    #f1f5f9    muted
高亮表面    #f1f5f9    accent
边框        #e2e8f0    border
正文        #0f172a    foreground
辅助文字    #64748b    muted-foreground
主色        #2563eb    primary
危险色      #ef4444    destructive
```

### 使用规则

- 必须使用语义 token（如 `bg-primary`、`text-muted-foreground`），不要硬编码颜色值（如 `bg-blue-600`、`text-gray-500`）
- 透明度修饰用斜杠语法：`bg-primary/90`（hover）、`bg-muted/30`（侧边栏底色）
- 聚焦环统一用 `focus:ring-2 focus:ring-ring`
- 边框统一用 `border border-border`，不要写 `border-gray-200`

## 4. cn() 工具函数

文件路径：`src/lib/utils.ts`

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

用途：合并条件 className，自动处理 Tailwind 类名冲突。所有需要条件拼接 className 的地方必须使用 `cn()`。

## 5. 组件清单与使用规则

### 组件清单

| 组件 | 路径 | 用途 |
|------|------|------|
| `Button` | `@/components/ui/button` | 按钮组件，支持 variant/size |
| `Input` | `@/components/ui/input` | 文本输入框 |
| `Textarea` | `@/components/ui/textarea` | 多行文本输入 |
| `Label` | `@/components/ui/label` | 表单标签 |
| `Select` | `@/components/ui/select` | 下拉选择（非原生 `<select>`） |
| `Checkbox` | `@/components/ui/checkbox` | 复选框 |
| `RadioGroup` | `@/components/ui/radio-group` | 单选按钮组 |
| `Dialog` | `@/components/ui/dialog` | 模态弹窗 |
| `AlertDialog` | `@/components/ui/alert-dialog` | 确认弹窗（删除等危险操作） |
| `Tabs` | `@/components/ui/tabs` | 标签页切换 |
| `Card` | `@/components/ui/card` | 卡片容器 |
| `Table` | `@/components/ui/table` | 表格 |
| `Badge` | `@/components/ui/badge` | 状态标签 |
| `Skeleton` | `@/components/ui/skeleton` | 骨架屏加载占位 |
| `Separator` | `@/components/ui/separator` | 分割线 |
| `Tooltip` | `@/components/ui/tooltip` | 悬停提示 |
| `Sonner` | `@/components/ui/sonner` | Toast 通知 |
| `ScrollArea` | `@/components/ui/scroll-area` | 滚动区域 |
| `Progress` | `@/components/ui/progress` | 进度条 |

### Button 变体对照

```tsx
import { Button } from '@/components/ui/button'

// 主按钮
<Button onClick={...}>烧录</Button>

// 描边按钮
<Button variant="outline" onClick={...}>取消</Button>

// 危险按钮
<Button variant="destructive" onClick={...}>擦除</Button>

// 小号按钮（表格操作列）
<Button variant="outline" size="sm">编辑</Button>
<Button variant="outline" size="sm" className="text-destructive">删除</Button>

// 图标按钮
<Button variant="ghost" size="sm" className="h-7 w-7 p-0"><X className="size-4" /></Button>

// 链接式按钮
<Button variant="link" className="px-0 text-muted-foreground">返回</Button>

// 带图标的按钮（Button 内置 gap-2，不需要 mr-1.5）
<Button><Plus className="size-4" />新建</Button>
```

### Select 用法

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

<Select value={value} onValueChange={(v) => setValue(v)}>
  <SelectTrigger className="w-full"><SelectValue placeholder="选择..." /></SelectTrigger>
  <SelectContent>
    <SelectItem value="a">选项 A</SelectItem>
    <SelectItem value="b">选项 B</SelectItem>
  </SelectContent>
</Select>

// 注意：Select 的 value 是 string，数字类型需要 String() / Number() 转换
// 注意：Select 不支持空字符串 value，用 undefined + placeholder 代替
```

### Dialog 用法

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

<Dialog open={showDialog} onOpenChange={setShowDialog}>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle>标题</DialogTitle>
    </DialogHeader>
    {/* 表单内容 */}
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowDialog(false)}>取消</Button>
      <Button onClick={handleSubmit}>确认</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Card 用法

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>标题</CardTitle>
  </CardHeader>
  <CardContent>
    {/* 内容 */}
  </CardContent>
</Card>
```

### Progress 用法（Flash 进度条）

```tsx
import { Progress } from '@/components/ui/progress'

<Progress value={68} className="h-2" />
```

### Badge 用法

```tsx
import { Badge } from '@/components/ui/badge'

<Badge variant="secondary">v1.0</Badge>
<Badge variant="outline">活跃</Badge>
<Badge variant="destructive">错误</Badge>
```

### Sonner Toast 用法

```tsx
import { toast } from 'sonner'

toast.success('烧录成功')
toast.error('烧录失败')

// 需要在 main.tsx 中添加 <Toaster /> 组件
import { Toaster } from '@/components/ui/sonner'
```

## 6. 布局模式

### 侧边栏布局（主应用框架）

```tsx
<div className="flex h-screen w-full">
  <aside className="flex w-56 flex-col border-r border-border bg-muted/30">
    {/* Logo 区域 */}
    <div className="flex h-14 items-center gap-2 border-b border-border px-4">
      <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-bold">
        DW
      </div>
      <span className="text-sm font-semibold">DAPLink Work</span>
    </div>
    {/* 导航 */}
    <nav className="flex-1 space-y-1 p-3">
      {/* NavLink items */}
    </nav>
    {/* 底部版本信息 */}
    <div className="border-t border-border p-3 text-xs text-muted-foreground">
      v0.1.0
    </div>
  </aside>
  <main className="flex-1 overflow-auto">
    <Outlet />
  </main>
</div>
```

### 导航项

```tsx
<NavLink
  className={({ isActive }) =>
    cn(
      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    )
  }
>
```

### 搜索输入（带图标）

```tsx
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

<div className="relative">
  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
  <Input className="pl-9" placeholder="搜索..." />
</div>
```

### 定义列表（key-value 展示，如目标芯片信息）

```tsx
<dl className="grid grid-cols-2 gap-y-2 text-sm">
  <dt className="text-muted-foreground">MCU</dt>
  <dd className="font-medium">STM32F103RC</dd>
  <dt className="text-muted-foreground">Flash</dt>
  <dd className="font-medium">256KB @ 0x08000000</dd>
</dl>
```

## 7. 图标规则

使用 `lucide-react` 图标库：

```tsx
import { Cpu, Library, Settings, Home, HelpCircle, Zap, Terminal, Radio, Activity } from 'lucide-react'

// 尺寸统一（使用 size-* 简写，替代 h-* w-*）
<Icon className="size-4" />   // 导航、按钮内
<Icon className="size-5" />   // 卡片、统计
<Icon className="size-6" />   // 页面标题旁
```

Button 组件内置 `gap-2`，图标不需要 `mr-1.5` 等间距类。

## 8. 依赖包

```json
{
  "dependencies": {
    "@radix-ui/react-alert-dialog": "^1.1.x",
    "@radix-ui/react-checkbox": "^1.1.x",
    "@radix-ui/react-dialog": "^1.1.x",
    "@radix-ui/react-label": "^2.1.x",
    "@radix-ui/react-progress": "^1.1.x",
    "@radix-ui/react-radio-group": "^1.2.x",
    "@radix-ui/react-scroll-area": "^1.2.x",
    "@radix-ui/react-select": "^2.1.x",
    "@radix-ui/react-separator": "^1.1.x",
    "@radix-ui/react-slot": "^1.1.x",
    "@radix-ui/react-tabs": "^1.1.x",
    "@radix-ui/react-tooltip": "^1.1.x",
    "class-variance-authority": "^0.7.x",
    "clsx": "^2.1.1",
    "lucide-react": "^0.408.0",
    "sonner": "^1.5.x",
    "tailwind-merge": "^2.4.0",
    "tailwindcss-animate": "^1.0.7"
  }
}
```

| 包 | 用途 |
|----|------|
| `@radix-ui/*` | shadcn/ui 组件底层依赖 |
| `class-variance-authority` | 组件变体管理（variant/size） |
| `clsx` | 条件 className 拼接 |
| `tailwind-merge` | Tailwind 类名冲突合并 |
| `tailwindcss-animate` | 动画（accordion 等） |
| `lucide-react` | 图标库 |
| `sonner` | Toast 通知 |

不使用 `next-themes`（本项目仅亮色主题，无需主题切换）。

## 9. 字体

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
-webkit-font-smoothing: antialiased;
```

使用系统字体栈，不引入额外字体文件。

## 10. 页面结构模板

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function PageName() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">页面标题</h1>
        <p className="text-sm text-muted-foreground mt-1">页面描述</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>区块标题</CardTitle>
        </CardHeader>
        <CardContent>
          {/* ... */}
        </CardContent>
      </Card>
    </div>
  )
}
```

## 11. 主题说明

- 本项目仅使用亮色主题，不启用暗色模式
- CSS 变量仅在 `:root` 中定义，不定义 `.dark`
- 组件中使用语义化颜色（`bg-background`、`text-foreground` 等）
- 不要在组件中硬编码颜色值（如 `bg-white`、`text-gray-500`），必须使用语义化变量
