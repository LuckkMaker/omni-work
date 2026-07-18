# 重构计划 — 全局探针管理 + 侧边栏设备选择 + pyOCD 集成

## 问题概述

当前 Step 4 将探针选择和目标管理绑定在 Flash 页面,存在三个架构问题:

1. 探针状态不是全局的 — 切换页面后 WebSocket 断开,实时事件失效
2. 侧边栏缺少设备选择入口 — 用户必须在 Flash 页面才能操作探针
3. pyOCD 使用 `.venv` 虚拟环境(非全局),但不支持 STM32F407 等型号,且无法自定义型号列表

## 问题 1 — 探针状态全局化

### 现状

WebSocket 初始化(`useProbeWs`)、后端状态轮询(`useBackendStatus`)、探针列表拉取(`fetchProbes`)全部在 `src/pages/flash/index.tsx` 中调用。当用户从 `/flash` 导航到 `/commander` 时,FlashPage 组件卸载,`useProbeWs` 的 cleanup 执行 `wsClient.disconnect()`,WebSocket 被主动断开,此后所有实时事件(探针热插拔、连接状态变化)全部停止接收。

Zustand store 是模块级单例,数据在内存中保留,但离开 Flash 页面后不再有更新源 — 其他页面读到的探针状态是陈旧快照。

### 方案

将探针初始化逻辑从 FlashPage 提升到 MainLayout。MainLayout 是所有页面的父路由 layout,只要应用运行就不会卸载。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/layouts/MainLayout.tsx` | 新增 `useBackendStatus()` + `useProbeWs(port)` + `fetchProbes()` 触发逻辑 |
| `src/pages/flash/index.tsx` | 移除上述三处调用,精简为纯烧录业务页面 |
| `src/hooks/useProbeWs.ts` | 修复 port 变化时的重连逻辑(当前 `initialized` ref 阻止重连) |
| 后端 Python 代码 | 无需改动 |

### useProbeWs 重连逻辑修复

当前用 `initialized.current` 布尔值保证只初始化一次。如果后端重启导致 port 变化,不会重连新端口。改为跟踪已连接的 port:

```typescript
const connectedPort = useRef<number | null>(null)

useEffect(() => {
  if (!port || connectedPort.current === port) return
  if (connectedPort.current !== null) {
    wsClient.disconnect()
  }
  connectedPort.current = port
  wsClient.connect(port)
  // ... 订阅事件
  return () => {
    // 不在 cleanup 中 disconnect,由 port 变化或组件卸载时处理
  }
}, [port])
```

## 问题 2 — 侧边栏 Dropdown Menu 设备选择

### 设计参考

参考 [shadcn-admin](https://shadcn-admin.netlify.app/) 的 TeamSwitcher 模式,在侧边栏顶部放置一个 **DeviceSwitcher** 组件,使用 Dropdown Menu 展示当前 DAPLink 设备和 MCU 型号。

### 侧边栏布局变更

```
aside (w-56)
├── DeviceSwitcher (顶部,替换原来的品牌区)
│   ├── 触发器: [USB图标] + [设备名 + MCU型号] + [ChevronsUpDown]
│   └── 下拉菜单:
│       ├── "已连接探针" 标签
│       ├── 探针列表 (每项: 图标 + 产品名 + 状态Badge)
│       ├── 分隔线
│       ├── "刷新设备列表" 操作项
│       └── 分隔线 + MCU 型号选择子菜单
├── nav 导航区 (Flash/Commander/RTT/SWO/Scope/设置)
└── 底部: 后端状态指示器 + 版本号
```

### 需要安装的依赖

```bash
npm install @radix-ui/react-dropdown-menu
```

### 需要新增的文件

| 文件 | 说明 |
|------|------|
| `src/components/ui/dropdown-menu.tsx` | shadcn Dropdown Menu 组件 |
| `src/components/layout/DeviceSwitcher.tsx` | 设备切换器(仿 TeamSwitcher) |

### DeviceSwitcher 交互逻辑

1. **触发器**:显示当前选中的探针名称和连接状态,未选中时显示"未选择设备"
2. **下拉菜单 — 探针列表**:列出所有已检测到的探针,点击选中(单选),显示连接状态 Badge
3. **下拉菜单 — 连接/断开**:选中探针后显示连接或断开按钮
4. **下拉菜单 — MCU 型号选择**:使用 `DropdownMenuSub` 二级菜单,展示可用型号列表,选中后调用 `setTarget()`
5. **下拉菜单 — 刷新**:点击"刷新设备列表"调用 `fetchProbes()`

### DeviceSwitcher 与 ProbeSelector 的关系

DeviceSwitcher 是**全局精简版**(侧边栏,所有页面可见),ProbeSelector 是**Flash 页面完整版**(显示 UID、VID/PID 等详细信息)。两者共享同一个 `useProbeStore`,数据完全同步。Flash 页面保留 ProbeSelector 用于详细操作,其他页面通过侧边栏 DeviceSwitcher 即可完成设备切换。

## 问题 3 — pyOCD 集成与自定义型号

### 现状

- pyOCD 0.44.1 安装在项目 `.venv` 虚拟环境中(非全局),Electron 通过 `findPython()` 优先使用 `.venv\Scripts\python.exe`
- 目标列表 API (`GET /api/targets`) 仅返回 pyOCD 内置型号(18 款 STM32)
- **STM32F407 不在内置列表中**,当前用 `stm32f429xg` 作为兼容替代

### pyOCD 内置 Target 结构分析

每个内置 target 是一个 Python 文件(如 `target_STM32F429xx.py`),包含三个核心部分:

1. **`FLASH_ALGO` 字典** — Flash 烧录算法的二进制指令(SVG 指令序列、函数入口地址、页缓冲区地址等)
2. **`MemoryMap`** — Flash/RAM 区域定义(起始地址、大小、扇区大小、页大小)
3. **Target 类** — 继承 `CoreSightTarget`,绑定 MEMORY_MAP + SVD 文件 + `post_connect_hook`(调试寄存器配置)

`__init__.py` 中的 `BUILTIN_TARGETS` 字典将型号名(如 `stm32f429xg`)映射到 Target 类。

### 方案 — FLM 生成内置 Target + pyOCD 源码集成

采用用户熟悉的 FLM 工作流,将 pyOCD 开发包纳入项目后端,人工添加型号并打包分发:

#### 工作流程

```
FLM 文件 (Keil 下载算法)
    │
    ▼  generate_flash_algo.py
FLASH_ALGO 字典 (Python)
    │
    ▼  人工编写 target_XXX.py
自定义内置 Target (MemoryMap + FLASH_ALGO + Target 类)
    │
    ▼  注册到 BUILTIN_TARGETS
pyOCD 识别新型号
    │
    ▼  打包 .venv → 应用分发
最终用户无需任何操作
```

#### Step 1 — 将 pyOCD 源码纳入项目

将 pyOCD 从 `.venv` 依赖升级为项目内嵌的源码包,放在 `python/pyocd/` 目录下:

```
python/
├── pyocd/                    # pyOCD 源码(从 .venv 拷贝或 git submodule)
│   ├── debug/
│   │   └── svd/
│   │       └── svd_data.zip  # 内置 SVD 压缩包 — 需追加 STM32F407.svd
│   ├── target/
│   │   ├── builtin/
│   │   │   ├── __init__.py   # BUILTIN_TARGETS 字典 — 注册新型号
│   │   │   ├── target_STM32F429xx.py  (已有)
│   │   │   └── target_STM32F407xx.py  (新增 — 人工创建)
│   │   └── ...
│   └── ...
├── tools/
│   └── generate_flash_algo.py  # FLM → FLASH_ALGO 转换工具
├── flm/                       # FLM 源文件存放
│   └── STM32F4xx_1024.FLM     # 从 samples/stm32f407/ 拷入
├── core/
├── api/
└── server.py
```

安装方式从 `pip install pyocd` 改为项目内 import。`requirements.txt` 中移除 `pyocd` 依赖,改为 `python/pyocd/` 目录随项目分发。

#### Step 2 — 添加 STM32F407 型号

以 STM32F407IG(1MB Flash, 192KB RAM)为例:

**2a. 用 FLM 生成 FLASH_ALGO**

从 Keil 安装目录(`ARM/Flash/ST/`)或 CMSIS-Pack 中获取 `stm32f4xx.flm` 文件,运行:

```bash
python tools/generate_flash_algo.py flm/STM32F4xx_FLM/stm32f4xx.flm -o tools/stm32f4xx_algo.py --copyright "Luckk Work"
```

生成的 `stm32f4xx_algo.py` 包含完整的 `FLASH_ALGO` 字典。`generate_flash_algo.py` 依赖 `pyocd.target.pack.flash_algo.PackFlashAlgo` 解析 FLM(ELF 格式),提取算法指令和符号地址。

**2b. 编写 target_STM32F407xx.py**

参考已有的 `target_STM32F429xx.py` 结构,创建 STM32F407 target:

```python
# target_STM32F407xx.py
from ...coresight.coresight_target import CoreSightTarget
from ...core.memory_map import (FlashRegion, RamRegion, MemoryMap)
from ...debug.svd.loader import SVDFile

CHIP_ERASE_WEIGHT = 15.0

class DBGMCU:
    CR = 0xE0042004
    CR_VALUE = 0x7
    APB1_FZ = 0xE0042008
    APB1_FZ_VALUE = 0x06e01dff
    APB2_FZ = 0xE004200C
    APB2_FZ_VALUE = 0x00070003

# 从 generate_flash_algo.py 输出粘贴
FLASH_ALGO = { ... }

class STM32F407xG(CoreSightTarget):
    VENDOR = "STMicroelectronics"
    MEMORY_MAP = MemoryMap(
        # STM32F407IG: 1MB Flash, 3 个扇区区域
        FlashRegion(start=0x08000000, length=0x10000, sector_size=0x4000,
                    page_size=0x1000, is_boot_memory=True,
                    erase_all_weight=CHIP_ERASE_WEIGHT, algo=FLASH_ALGO),
        FlashRegion(start=0x08010000, length=0x10000, sector_size=0x10000,
                    page_size=0x1000, erase_all_weight=CHIP_ERASE_WEIGHT, algo=FLASH_ALGO),
        FlashRegion(start=0x08020000, length=0xE0000, sector_size=0x20000,
                    page_size=0x1000, erase_all_weight=CHIP_ERASE_WEIGHT, algo=FLASH_ALGO),
        # 192KB RAM (112KB + 64KB CCM)
        RamRegion(start=0x20000000, length=0x10000),   # 64KB SRAM1
        RamRegion(start=0x20010000, length=0x10000),   # 64KB SRAM2
        RamRegion(start=0x10000000, length=0x10000),   # 64KB CCM
    )

    def __init__(self, session):
        super().__init__(session, self.MEMORY_MAP)
        self._svd_location = SVDFile.from_builtin("STM32F407.svd")

    def post_connect_hook(self):
        self.write32(DBGMCU.CR, DBGMCU.CR_VALUE)
        self.write32(DBGMCU.APB1_FZ, DBGMCU.APB1_FZ_VALUE)
        self.write32(DBGMCU.APB2_FZ, DBGMCU.APB2_FZ_VALUE)
```

**2c. 注册到 BUILTIN_TARGETS**

在 `python/pyocd/target/builtin/__init__.py` 中添加:

```python
from . import target_STM32F407xx

# 在 BUILTIN_TARGETS 字典中添加:
'stm32f407xg': target_STM32F407xx.STM32F407xG,
```

#### Step 3 — 后端适配

`pyocd_backend.py` 的 `connect()` / `set_target()` 无需改动 — pyOCD 从 `BUILTIN_TARGETS` 字典中查找型号,新注册的 `stm32f407xg` 会自动可用。

`api/targets.py` 也无需改动 — `TARGET` 字典就是 `BUILTIN_TARGETS.copy()`,新型号自动出现在 `GET /api/targets` 返回列表中。

### 改动文件

| 文件 | 改动 |
|------|------|
| `python/pyocd/` | 新建目录,放入 pyOCD 源码(从 `.venv/Lib/site-packages/pyocd/` 拷贝) |
| `python/pyocd/target/builtin/target_STM32F407xx.py` | 新建,STM32F407 target 定义 |
| `python/pyocd/target/builtin/__init__.py` | 注册 `stm32f407xg` 到 `BUILTIN_TARGETS` |
| `python/tools/generate_flash_algo.py` | 新建,从 pyOCD GitHub 仓库获取 |
| `python/flm/` | 新建目录,存放 FLM 源文件 |
| `python/requirements.txt` | 移除 `pyocd>=0.44.0`,改为项目内源码 |
| `python/server.py` | import 路径调整(从 site-packages 改为项目内 pyocd) |
| `python/core/pyocd_backend.py` | 无需改动(已通过 BUILTIN_TARGETS 自动识别) |
| `python/api/targets.py` | 无需改动(已通过 TARGET 字典自动返回) |

### 优势

- 用户可自主添加任何型号,只需 FLM 文件 + MemoryMap 配置
- 新型号作为 pyOCD 内置 target,无需运行时加载 pack,启动更快
- 整个 pyOCD 随应用打包分发,最终用户零配置
- 与用户已有的 FLM 开发经验无缝衔接
- SVD 文件需追加到 `pyocd/debug/svd/svd_data.zip` 压缩包中(pyOCD 不用 `data/` 目录,而是将所有 SVD 文件打包进 zip,通过 `SVDFile.from_builtin("STM32F407.svd")` 从 zip 内读取)
- `samples/stm32f407/` 目录已准备好 `STM32F407.svd` 和 `STM32F4xx_1024.FLM` 两个文件,直接使用

## 实施步骤

### Phase A — 探针状态全局化(问题 1)

| 步骤 | 文件 | 内容 |
|------|------|------|
| A1 | `src/hooks/useProbeWs.ts` | 修复 port 变化重连逻辑 |
| A2 | `src/layouts/MainLayout.tsx` | 移入 useBackendStatus + useProbeWs + fetchProbes |
| A3 | `src/pages/flash/index.tsx` | 移除上述调用,精简页面 |
| A4 | 验证 | 切换页面后 WebSocket 不断开,探针状态实时更新 |

### Phase B — 侧边栏 DeviceSwitcher(问题 2)

| 步骤 | 文件 | 内容 |
|------|------|------|
| B1 | `package.json` | 安装 `@radix-ui/react-dropdown-menu` |
| B2 | `src/components/ui/dropdown-menu.tsx` | 创建 shadcn Dropdown Menu 组件 |
| B3 | `src/components/layout/DeviceSwitcher.tsx` | 创建设备切换器 |
| B4 | `src/layouts/MainLayout.tsx` | 侧边栏顶部替换为 DeviceSwitcher,底部加后端状态指示器 |
| B5 | 验证 | 侧边栏可切换探针、连接/断开、选择 MCU 型号 |

### Phase C — pyOCD 源码集成 + FLM 自定义型号(问题 3)

| 步骤 | 文件 | 内容 |
|------|------|------|
| C1 | `python/pyocd/` | 从 `.venv` 拷贝 pyOCD 源码到项目目录 |
| C2 | `python/pyocd/debug/svd/svd_data.zip` | 将 `samples/stm32f407/STM32F407.svd` 追加到 zip 中 |
| C3 | `python/tools/generate_flash_algo.py` | 从 pyOCD GitHub 仓库下载 FLM 转换工具 |
| C4 | `python/flm/` | 创建目录,拷入 `samples/stm32f407/STM32F4xx_1024.FLM` |
| C5 | `python/requirements.txt` | 移除 pyocd 依赖,保留 cmsis_pack_manager/pyelftools 等 |
| C6 | `python/server.py` | 调整 import 路径,优先从项目内 `pyocd/` 加载 |
| C7 | `python/pyocd/target/builtin/target_STM32F407xx.py` | 用 generate_flash_algo.py 从 FLM 生成 FLASH_ALGO,编写 target 类,SVD 引用 `STM32F407.svd` |
| C8 | `python/pyocd/target/builtin/__init__.py` | 注册 stm32f407xg 到 BUILTIN_TARGETS |
| C9 | 验证 | `GET /api/targets` 返回 stm32f407xg,连接后显示正确 Flash 布局(1MB, 0x08000000) |

### Phase D — 前端型号选择优化

| 步骤 | 文件 | 内容 |
|------|------|------|
| D1 | `src/shared/types.ts` | 扩展 targets API 返回类型(含 favorite 标记) |
| D2 | `src/services/target.service.ts` | 更新返回类型 |
| D3 | `src/stores/probe.store.ts` | targetList 增加 favorite 分组 |
| D4 | DeviceSwitcher / TargetSelector | 常用型号置顶,支持搜索过滤 |
