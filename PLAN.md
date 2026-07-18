# Luckk Work - 项目详细计划

> 基于 DAPLink 仿真器的嵌入式开发工具集，对标 SEGGER J-Link 工具链

---

## 一、项目概述

### 1.1 项目定位

Luckk Work 是一套基于 DAPLink 仿真下载器的桌面端嵌入式开发工具集，目标是提供类似 SEGGER J-Link 工具链的完整体验，但以开源的 DAPLink 硬件为基础，降低嵌入式开发者的工具成本。

### 1.2 对标产品映射

| J-Link 工具 | Luckk Work 对应模块 | 核心功能 |
|---|---|---|
| J-Flash | **Flash 工具** (Phase 1) | 固件烧录、擦除、校验 |
| J-Link Commander | Commander (Phase 2) | 交互式命令行，内存/寄存器读写 |
| J-Link RTT Viewer | RTT Viewer (Phase 3) | RTT 实时数据收发 |
| J-Link SWO Viewer | SWO Viewer (Phase 4) | SWO/SWV 数据解码与显示 |
| J-Scope | Scope (Phase 5) | 实时数据波形可视化 |

### 1.3 技术栈

| 层 | 技术选型 | 说明 |
|---|---|---|
| 桌面框架 | Electron + Vite | 跨平台桌面应用 |
| 前端框架 | React + React Router | 页面路由，每个工具一个页面 |
| UI 组件 | shadcn/ui + Tailwind CSS | 组件化 UI，可定制 |
| 后端 | Python + FastAPI | 硬件交互层 |
| 硬件库 | pyOCD | DAPLink 通信与 Flash 操作 |
| 打包 | electron-builder + PyInstaller | 前后端一体化打包 |

---

## 二、技术选型分析：pyOCD vs 自研

### 2.1 pyOCD 能力评估

pyOCD 是 ARM 官方生态中的开源 Python 调试工具，专为 Cortex-M 微控制器设计，当前版本 v0.44.1（2026年5月），采用 Apache 2.0 许可证 [$TRAE_REF](https://github.com/pyocd/pyOCD)。

**核心能力：**

- **DAPLink 原生支持**：完整支持 CMSIS-DAP v1 (HID) 和 v2 (WinUSB)，DAPLink 是一等公民 [$TRAE_REF](https://github.com/pyocd/pyOCD)
- **MCU 覆盖广**：内置 70+ 款 MCU 支持，通过 CMSIS Device Family Packs 可覆盖市面上几乎所有 Cortex-M 器件 [$TRAE_REF](https://github.com/pyocd/pyOCD)
- **Flash 编程**：支持 bin/hex/elf 格式文件烧录，内置擦除、编程、校验全流程
- **Python API**：提供完整的 Python API，可直接嵌入应用后端，无需通过 CLI 调用
- **调试功能**：断点、内存读写、寄存器访问、单步执行——为后续 Commander 阶段铺路
- **RTT 支持**：内置 Segger RTT 数据流支持，不限于 J-Link 探针 [$TRAE_REF](https://github.com/pyocd/pyOCD)
- **SWO/SWV**：支持 SWO 数据解码，为 SWO Viewer 阶段提供基础
- **跨平台**：Linux、macOS、Windows、FreeBSD 全平台支持

**局限性：**

- Beta 质量（API 在 0.x 版本 considered stable，1.0 可能有变动）
- Python 层有性能开销（Flash 速度不如 C/C++ 实现的 OpenOCD）
- 依赖 libusb，打包时需处理平台差异

### 2.2 自研方案评估

自研需要从零实现以下模块：

1. **USB 通信层**：CMSIS-DAP 协议的 HID/WinUSB 通信（约 2-4 周）
2. **DAP 协议层**：SWD/JTAG 传输、DP/AP 访问（约 2-3 周）
3. **Flash 算法层**：每款 MCU 的 flash algorithm 加载与执行（每款 3-5 天，且需获取各厂商的 flash 算法）
4. **目标识别**：DPIDR 读取、PartNo 识别、目标匹配（约 1 周）
5. **文件解析**：hex/elf/bin 格式解析（约 1 周）

### 2.3 对比

| 维度 | pyOCD | 自研 |
|---|---|---|
| DAPLink 通信 | 原生支持 | 需实现 USB HID/WinUSB + CMSIS-DAP 协议 |
| MCU 覆盖 | 70+ 内置 + CMSIS-Packs 近乎全覆盖 | 需逐个实现 flash algorithm |
| Flash 编程 | bin/hex/elf 开箱即用 | 从零实现 |
| 调试/RTT/SWO | 全部内置 | 后续阶段需大量额外开发 |
| 首版开发周期 | 2-3 周（集成 + 封装） | 2-3 月（基础功能） |
| 性能 | Python 层有开销 | C/C++ 可达更高性能 |
| 定制灵活性 | 中等（API 扩展） | 完全可控 |
| 维护成本 | 社区维护，跟随上游更新 | 全部自行承担 |
| 许可证 | Apache 2.0（商用友好） | 自由选择 |

### 2.4 推荐方案

**采用 pyOCD 作为核心引擎，上层封装薄抽象层。**

理由：

1. pyOCD 已完整覆盖 Phase 1-5 所需的全部底层能力（Flash、调试、RTT、SWO），无需重复造轮子
2. DAPLink 是 pyOCD 的一等支持探针，兼容性经过社区验证
3. Apache 2.0 许可证对商用无限制
4. Python API 可直接嵌入 FastAPI 后端，无需子进程 CLI 调用
5. 自研的投入产出比极低——2-3 个月只能做到 pyOCD 已有的基础功能

**薄抽象层设计**：在 pyOCD 之上封装 `BackendInterface` 抽象接口，所有业务逻辑通过接口调用，不直接依赖 pyOCD。这样保留了未来替换底层引擎的可能性（如性能不足时切换到 OpenOCD 或自研 C 扩展），同时当前阶段零额外成本。

---

## 三、系统架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Electron 应用                         │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Renderer Process (React)              │  │
│  │                                                   │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐          │  │
│  │  │  Flash   │ │Commander │ │   RTT    │  ...     │  │
│  │  │  页面    │ │  页面    │ │  页面    │          │  │
│  │  └──────────┘ └──────────┘ └──────────┘          │  │
│  │       │ shadcn/ui 组件 + Tailwind CSS             │  │
│  │       │ React Router 路由                          │  │
│  │       │ Zustand 状态管理                           │  │
│  └───────┼───────────────────────────────────────────┘  │
│          │ ipcRenderer (contextBridge)                   │
│  ┌───────┼───────────────────────────────────────────┐  │
│  │       ▼            Main Process                   │  │
│  │  ┌──────────────┐  ┌──────────────────────────┐   │  │
│  │  │ Window 管理   │  │  Python Bridge           │   │  │
│  │  │ 菜单/托盘     │  │  (child_process 管理)     │   │  │
│  │  │ IPC 路由      │  │  HTTP/WebSocket 转发      │   │  │
│  │  └──────────────┘  └──────────┬───────────────┘   │  │
│  └───────────────────────────────┼───────────────────┘  │
│                                  │ HTTP + WebSocket      │
│  ┌───────────────────────────────┼───────────────────┐  │
│  │            Python Backend (子进程)                 │  │
│  │                               ▼                   │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │            FastAPI Server                     │ │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐     │ │  │
│  │  │  │ REST API │ │WebSocket │ │ 事件推送  │     │ │  │
│  │  │  └──────────┘ └──────────┘ └──────────┘     │ │  │
│  │  └──────────────────┬───────────────────────────┘ │  │
│  │                     │                              │  │
│  │  ┌──────────────────▼───────────────────────────┐ │  │
│  │  │          BackendInterface (抽象层)            │ │  │
│  │  │  ┌──────────────────────────────────────┐    │ │  │
│  │  │  │         pyOCD Backend 实现            │    │ │  │
│  │  │  │  ┌──────────────────────────────┐    │    │ │  │
│  │  │  │  │       pyOCD Library           │    │    │ │  │
│  │  │  │  │  (CMSIS-DAP / DAPLink)        │    │    │ │  │
│  │  │  │  └──────────────────────────────┘    │    │ │  │
│  │  │  └──────────────────────────────────────┘    │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
│                          │ USB                          │
│                  ┌───────▼───────┐                      │
│                  │   DAPLink     │                      │
│                  │   仿真器      │                      │
│                  └───────┬───────┘                      │
│                          │ SWD/JTAG                     │
│                  ┌───────▼───────┐                      │
│                  │  目标 MCU     │                      │
│                  │  (Cortex-M)   │                      │
│                  └───────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Electron ↔ Python 通信方案

采用 **FastAPI 本地 HTTP 服务 + WebSocket** 方案：

| 通道 | 协议 | 用途 |
|---|---|---|
| 命令请求 | HTTP REST | 设备列表、连接、擦除、烧录等请求-响应型操作 |
| 实时数据 | WebSocket | 烧录进度、日志输出、RTT 数据流、SWO 数据流 |

**通信流程：**

1. Electron 主进程启动时，spawn Python 子进程，传入 `--port 0`（自动分配端口）
2. Python 后端启动 FastAPI，将实际监听端口通过 stdout 输出（首行 JSON：`{"port": 12345}`）
3. Electron 主进程读取端口，通过 `ipcMain` 暴露给渲染进程
4. 渲染进程通过 preload script 暴露的 API 发起 HTTP 请求和 WebSocket 连接
5. 所有请求经 Electron 主进程中转（便于鉴权、日志、生命周期管理）

**为什么不用 stdin/stdout JSON-RPC：**

- WebSocket 天然支持双向实时推送，适合进度条、日志流、RTT 数据
- FastAPI 自带 OpenAPI 文档，便于前后端联调
- 可独立启动 Python 后端进行测试，不依赖 Electron
- 端口动态分配，无冲突风险

### 3.3 打包方案

| 组件 | 工具 | 产物 |
|---|---|---|
| Python 后端 | PyInstaller | 单目录可执行文件（含 Python 运行时 + pyOCD + 依赖） |
| Electron 前端 | electron-builder | Windows NSIS 安装包 / macOS DMG / Linux AppImage |
| libusb | 随 PyInstaller 打包 | 平台对应的动态库 |

打包时 Electron 将 Python 产物作为额外资源打包，运行时解压到临时目录执行。

### 3.4 项目目录结构

```
luckk-work/
├── electron/                       # Electron 主进程
│   ├── main.ts                     # 入口：窗口创建、生命周期
│   ├── preload.ts                  # preload：contextBridge 安全暴露 API
│   └── python-bridge.ts            # Python 子进程管理（启动/停止/端口发现）
│
├── src/                            # React 渲染进程 (Vite 构建)
│   ├── pages/                      # 路由页面
│   │   ├── flash/                  # Phase 1: Flash 工具
│   │   │   ├── index.tsx           # 页面主组件
│   │   │   ├── components/         # Flash 专属组件
│   │   │   │   ├── ProbeSelector.tsx
│   │   │   │   ├── TargetSelector.tsx
│   │   │   │   ├── FileDropZone.tsx
│   │   │   │   ├── FlashProgress.tsx
│   │   │   │   └── LogConsole.tsx
│   │   │   └── hooks/
│   │   │       └── useFlash.ts
│   │   ├── commander/              # Phase 2: Commander（后续）
│   │   ├── rtt/                    # Phase 3: RTT Viewer（后续）
│   │   ├── swo/                    # Phase 4: SWO Viewer（后续）
│   │   ├── scope/                  # Phase 5: Scope（后续）
│   │   └── settings/              # 全局设置
│   ├── components/                 # 跨页面共享组件 (shadcn/ui)
│   │   ├── ui/                     # shadcn 基础组件
│   │   └── shared/                 # 业务共享组件
│   ├── stores/                     # Zustand 状态管理
│   │   ├── probe.store.ts          # 探针状态
│   │   └── settings.store.ts       # 全局设置
│   ├── services/                   # API 服务层
│   │   ├── api.ts                  # HTTP 客户端封装
│   │   ├── ws.ts                   # WebSocket 客户端封装
│   │   └── probe.service.ts        # 探针相关 API
│   ├── hooks/                      # 通用 hooks
│   ├── types/                      # TypeScript 类型定义
│   ├── App.tsx                     # 应用根组件 + 路由
│   └── main.tsx                    # Vite 入口
│
├── python/                         # Python 后端
│   ├── server.py                   # FastAPI 入口
│   ├── api/                        # API 路由
│   │   ├── probes.py               # 探针管理路由
│   │   ├── flash.py                # Flash 操作路由
│   │   └── targets.py              # 目标芯片路由
│   ├── services/                   # 业务逻辑层
│   │   ├── probe_service.py        # 探针管理
│   │   ├── flash_service.py        # Flash 操作
│   │   └── target_service.py       # 目标芯片管理
│   ├── core/                       # 核心抽象层
│   │   ├── interface.py            # BackendInterface 抽象基类
│   │   ├── pyocd_backend.py        # pyOCD 实现
│   │   └── events.py               # 事件系统（WebSocket 推送）
│   └── requirements.txt            # Python 依赖
│
├── package.json                    # Node 依赖 + 脚本
├── vite.config.ts                  # Vite 配置
├── electron-builder.yml            # 打包配置
├── tsconfig.json
└── tailwind.config.js
```

---

## 四、Phase 1：Flash 工具详细计划

### 4.1 功能需求

#### 核心功能

| 功能 | 说明 | 优先级 |
|---|---|---|
| 探针检测 | 自动扫描已连接的 DAPLink 设备，显示 VID/PID/序列号 | P0 |
| 目标识别 | 自动识别目标 MCU 型号（通过 DPIDR/CoreDebug 读取） | P0 |
| 手动选目标 | 支持手动选择 MCU 型号（当自动识别失败时） | P0 |
| 文件加载 | 支持 .bin / .hex / .elf 格式固件文件 | P0 |
| 擦除 | 全片擦除（Chip Erase） | P0 |
| 烧录 | 将固件写入 Flash，实时显示进度 | P0 |
| 校验 | 烧录后自动校验 Flash 内容 | P0 |
| 复位运行 | 烧录完成后复位并运行目标 | P0 |
| 烧录日志 | 实时显示操作日志（时间戳 + 级别） | P0 |
| 扇区擦除 | 按地址范围擦除指定扇区 | P1 |
| Flash 读取 | 读取 Flash 内容并保存为文件 | P1 |
| 烧录配置 | 时钟速度、复位方式、是否自动校验等 | P1 |
| 拖拽烧录 | 拖拽固件文件到窗口直接烧录 | P2 |
| 历史记录 | 记录最近烧录的文件和目标 | P2 |
| 批量烧录 | 多设备同时烧录（多探针场景） | P2 |

#### 交互流程

```
用户打开 Flash 页面
    │
    ├── 自动扫描探针 ──→ 显示探针列表
    │                        │
    │                   用户选择探针
    │                        │
    │                   连接探针 ──→ 自动识别目标 MCU
    │                                   │
    │                              识别成功？──是──→ 显示目标信息
    │                                │
    │                               否
    │                                │
    │                          手动选择 MCU 型号
    │
    ├── 用户拖拽/选择固件文件
    │       │
    │   解析文件 ──→ 显示文件信息（格式/大小/入口地址）
    │
    ├── 用户点击「烧录」
    │       │
    │   擦除 → 编程 → 校验 → 复位
    │       │
    │   每步实时推送进度和日志
    │       │
    └── 烧录完成 ──→ 显示结果（成功/失败 + 耗时 + 速率）
```

### 4.2 后端 API 设计

#### REST API

```
# 探针管理
GET    /api/probes                    # 列出所有已连接探针
POST   /api/probes/{uid}/connect      # 连接指定探针
POST   /api/probes/{uid}/disconnect   # 断开探针
GET    /api/probes/{uid}/target       # 获取当前连接的目标信息

# 目标芯片
GET    /api/targets                   # 列出所有支持的 MCU 型号
GET    /api/targets/{part_number}     # 获取指定 MCU 的详细信息（Flash 布局等）
POST   /api/probes/{uid}/target       # 手动设置目标 MCU

# Flash 操作
POST   /api/probes/{uid}/flash/erase  # 擦除（body: { type: "chip" | "sector", address?, size? }）
POST   /api/probes/{uid}/flash/program  # 烧录（body: { file_path, format, verify, reset }）
POST   /api/probes/{uid}/flash/verify # 校验
POST   /api/probes/{uid}/flash/read   # 读取 Flash（body: { address, size, output_path }）
POST   /api/probes/{uid}/reset        # 复位目标（body: { type: "hw" | "sw", run: true }）

# 文件解析
POST   /api/files/parse               # 解析固件文件，返回格式/大小/段信息
```

#### WebSocket 事件

```
# 连接：ws://localhost:{port}/ws

# 服务端推送事件：
{
  "event": "flash.progress",
  "data": {
    "phase": "erase" | "program" | "verify",
    "current": 4096,
    "total": 262144,
    "percent": 1.56
  }
}

{
  "event": "log",
  "data": {
    "timestamp": "2026-07-09T10:30:00.123",
    "level": "info" | "warning" | "error",
    "message": "Erasing sector 0 at address 0x08000000..."
  }
}

{
  "event": "flash.complete",
  "data": {
    "success": true,
    "duration_ms": 3420,
    "bytes_written": 262144,
    "speed_kbps": 76.6
  }
}

{
  "event": "probe.connected",
  "data": { "uid": "ABC123", "vendor": "ARM", "product": "DAPLink" }
}

{
  "event": "probe.disconnected",
  "data": { "uid": "ABC123" }
}
```

### 4.3 抽象层接口设计

```python
# python/core/interface.py

from abc import ABC, abstractmethod
from typing import Optional
from dataclasses import dataclass

@dataclass
class ProbeInfo:
    uid: str
    vendor: str
    product: str
    vid: int
    pid: int
    serial: str

@dataclass
class TargetInfo:
    part_number: str
    core: str
    flash_start: int
    flash_size: int
    page_size: int
    sector_size: int

@dataclass
class FlashResult:
    success: bool
    bytes_written: int
    duration_ms: int
    error: Optional[str] = None

class BackendInterface(ABC):
    """硬件后端抽象接口，解耦业务逻辑与具体实现"""

    @abstractmethod
    def list_probes(self) -> list[ProbeInfo]:
        """扫描所有已连接探针"""

    @abstractmethod
    def connect(self, probe_uid: str) -> bool:
        """连接指定探针"""

    @abstractmethod
    def disconnect(self, probe_uid: str) -> bool:
        """断开探针"""

    @abstractmethod
    def get_target_info(self, probe_uid: str) -> Optional[TargetInfo]:
        """获取当前连接目标的芯片信息"""

    @abstractmethod
    def set_target(self, probe_uid: str, part_number: str) -> bool:
        """手动设置目标芯片型号"""

    @abstractmethod
    def erase(self, probe_uid: str, erase_type: str = "chip",
              address: int = 0, size: int = 0) -> FlashResult:
        """擦除 Flash"""

    @abstractmethod
    def program(self, probe_uid: str, file_path: str,
                verify: bool = True, reset: bool = True) -> FlashResult:
        """烧录固件"""

    @abstractmethod
    def verify(self, probe_uid: str, file_path: str) -> FlashResult:
        """校验 Flash 内容"""

    @abstractmethod
    def reset(self, probe_uid: str, reset_type: str = "hw",
              run: bool = True) -> bool:
        """复位目标"""

    @abstractmethod
    def read_memory(self, probe_uid: str, address: int,
                    size: int) -> bytes:
        """读取内存"""
```

### 4.4 UI 页面设计

```
┌─────────────────────────────────────────────────────────────┐
│  Luckk Work          [Flash] [Commander] [RTT] [Scope]    │  ← 顶部导航栏
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ 探针选择 ──────────┐  ┌─ 目标信息 ───────────────────┐  │
│  │ ◉ DAPLink (E661...) │  │ MCU: STM32F103RC             │  │
│  │   ARM · CMSIS-DAP   │  │ Core: Cortex-M3              │  │
│  │   [刷新]            │  │ Flash: 256KB @ 0x08000000    │  │
│  └─────────────────────┘  │ Page: 2KB  Sector: 2KB       │  │
│                            └───────────────────────────────┘  │
│                                                             │
│  ┌─ 固件文件 ─────────────────────────────────────────────┐ │
│  │                                                         │ │
│  │            拖拽 .bin/.hex/.elf 文件到此处               │ │
│  │                  或 [选择文件]                          │ │
│  │                                                         │ │
│  │  已加载: firmware.hex (48.2 KB, ELF, 入口 0x08000100)  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ 烧录选项 ─────────────────────────────────────────────┐ │
│  │  [✓] 烧录后校验    [✓] 烧录后复位运行                   │ │
│  │  [✓] 烧录前擦除    时钟速度: [10 MHz ▾]                │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│         [  擦  除  ]    [  烧  录  ]    [  校  验  ]       │
│                                                             │
│  ┌─ 进度 ─────────────────────────────────────────────────┐ │
│  │  编程中 ████████████░░░░░░░░  68%  (175KB / 256KB)    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ 日志 ─────────────────────────────────────────────────┐ │
│  │  10:30:01 [INFO]  Connecting to DAPLink E661...        │ │
│  │  10:30:01 [INFO]  Target: STM32F103RC (Cortex-M3)     │ │
│  │  10:30:02 [INFO]  Erasing chip...                      │ │
│  │  10:30:03 [INFO]  Programming 48.2 KB...               │ │
│  │  10:30:04 [INFO]  Verifying...                         │ │
│  │  10:30:04 [INFO]  Verify OK                            │ │
│  │  10:30:04 [INFO]  Reset and run                       │ │
│  │  10:30:04 [INFO]  Done in 3.4s (14.2 KB/s)            │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.5 开发步骤分解

#### Step 1: 项目初始化（预计 1-2 天）

- [ ] 初始化 Electron + Vite + React + TypeScript 项目骨架
- [ ] 配置 Tailwind CSS + shadcn/ui
- [ ] 配置 React Router，创建空白页面骨架（Flash / Commander / RTT / SWO / Scope）
- [ ] 创建 Python 虚拟环境，安装 pyOCD + FastAPI + uvicorn
- [ ] 实现 Electron 主进程启动 Python 子进程的基础逻辑
- [ ] 验证端到端通信链路：React → Electron → Python → 返回数据

#### Step 2: Python 后端 - 探针管理（预计 1-2 天）

- [ ] 实现 `BackendInterface` 抽象接口
- [ ] 实现 `PyOCDBackend`：`list_probes()` 调用 `pyocd.probe.aggregator.DebugProbeAggregator`
- [ ] 实现 `connect()` / `disconnect()` / `get_target_info()`
- [ ] 实现 `/api/probes` REST 路由
- [ ] 实现探针热插拔检测（USB 设备事件监听）
- [ ] WebSocket 推送探针连接/断开事件

#### Step 3: Python 后端 - Flash 操作（预计 2-3 天）

- [ ] 实现 `erase()`：全片擦除 + 扇区擦除
- [ ] 实现 `program()`：文件解析 + Flash 编程 + 进度回调
- [ ] 实现 `verify()`：读回比对
- [ ] 实现 `reset()`：硬件/软件复位
- [ ] 进度回调通过事件系统推送到 WebSocket
- [ ] 实现文件解析服务（bin/hex/elf）
- [ ] 实现目标芯片列表 API

#### Step 4: 前端 - 探针与目标选择（预计 2 天）

- [ ] 实现 `ProbeSelector` 组件：探针列表 + 刷新 + 选中状态
- [ ] 实现 `TargetSelector` 组件：自动识别显示 + 手动选择下拉
- [ ] 实现 Zustand store 管理探针连接状态
- [ ] 实现 API service 层封装（HTTP + WebSocket）

#### Step 5: 前端 - 文件加载与烧录（预计 2-3 天）

- [ ] 实现 `FileDropZone` 组件：拖拽 + 文件选择
- [ ] 调用文件解析 API 显示文件信息
- [ ] 实现 `FlashProgress` 组件：进度条 + 阶段标识
- [ ] 实现 `LogConsole` 组件：日志列表 + 自动滚动 + 级别着色
- [ ] 实现烧录选项面板（校验/复位/擦除/时钟）
- [ ] 实现烧录按钮组（擦除/烧录/校验）+ 状态机
- [ ] WebSocket 连接管理：进度更新 + 日志推送

#### Step 6: 集成测试与优化（预计 2-3 天）

- [ ] 端到端测试：DAPLink + 真实 MCU 板烧录全流程
- [ ] 错误处理：探针断开、通信超时、文件格式错误等异常场景
- [ ] 性能优化：大文件烧录进度更新频率控制
- [ ] UI 打磨：加载状态、禁用状态、操作确认
- [ ] 多 MCU 型号验证（STM32 / GD32 / NXP 等）

#### Step 7: 打包与发布（预计 1-2 天）

- [ ] PyInstaller 打包 Python 后端
- [ ] electron-builder 打包完整应用
- [ ] 测试打包后的应用在干净系统上运行
- [ ] libusb 依赖处理（Windows / macOS / Linux）

**Phase 1 预计总工期：2-3 周**

---

## 五、后续阶段规划

### Phase 2: Commander（交互式调试终端）

**对标：J-Link Commander**

| 功能 | 说明 |
|---|---|
| 交互式命令行 | REPL 风格，输入命令直接操作 MCU |
| 内存读写 | `read32 0x20000000` / `write32 0x40021000 0x01` |
| 寄存器读写 | 读写 Core 寄存器 (R0-R15, xPSR 等) |
| 外设寄存器 | 按地址访问外设寄存器，支持常用 MCU 寄存器映射 |
| 断点控制 | 设置/删除断点，单步执行 |
| 复位控制 | 硬件/软件复位，halt/resume |
| 脚本支持 | 支持加载 .cmd 脚本批量执行 |
| 命令历史 | 上下键浏览历史命令 |

**技术要点：** pyOCD 的 `Commander` 类提供完整的 REPL 能力，可直接复用。前端实现终端组件（xterm.js），WebSocket 传输输入输出。

**预计工期：1.5-2 周**

### Phase 3: RTT Viewer（实时数据收发）

**对标：J-Link RTT Viewer**

| 功能 | 说明 |
|---|---|
| RTT 通道选择 | 支持 RTT Channel 0-15 |
| 数据接收 | 实时显示目标 MCU 通过 RTT 发送的数据 |
| 数据发送 | 向目标 MCU 发送文本/十六进制数据 |
| 显示模式 | 文本模式 / 十六进制模式 / 混合模式 |
| 数据过滤 | 支持按通道过滤 |
| 数据保存 | 将接收数据保存为文件 |
| 自动重连 | 目标复位后自动重连 RTT |

**技术要点：** pyOCD 内置 RTT 支持（`rtt` 子命令），通过 `RTTController` API 实现。前端使用 xterm.js 显示数据流，WebSocket 实时传输。

**预计工期：1.5-2 周**

### Phase 4: SWO Viewer（SWO 数据解码）

**对标：J-Link SWO Viewer**

| 功能 | 说明 |
|---|---|
| SWO 配置 | 配置 SWO 时钟频率、波特率 |
| ITM 解码 | 解码 ITM Stimulus 端口数据 (0-31) |
| DWT PC 采样 | 显示程序计数器采样数据 |
| DWT 地址采样 | 数据读写地址追踪 |
| 时间戳 | ITM 本地/全局时间戳 |
| 数据导出 | 导出解码数据为 CSV |

**技术要点：** pyOCD 支持 SWO/SWV 数据解码。需要配置 SWO 时钟并处理数据流，前端需要高频数据更新的可视化组件。

**预计工期：2 周**

### Phase 5: Scope（实时波形可视化）

**对标：J-Scope**

| 功能 | 说明 |
|---|---|
| 变量采样 | 通过 SWD 读取目标内存中的变量值（轮询采样） |
| 波形显示 | 实时绘制变量值随时间变化的波形 |
| 多通道 | 同时采样多个变量 |
| 采样率配置 | 配置采样频率（10Hz - 10kHz） |
| 触发模式 | 值触发 / 边沿触发 |
| 数据导出 | 导出采样数据为 CSV |
| 变量地址映射 | 从 ELF 文件解析变量地址（支持 DWARF 调试信息） |

**技术要点：** 后端定时通过 pyOCD 读取内存地址，前端使用轻量级波形图库（如 uPlot）实现高频渲染。ELF 解析可借助 pyelftools。这是最考验性能优化的阶段——需要平衡采样率和 UI 刷新率。

**预计工期：2-3 周**

### Phase 6: 高级功能与生态

| 功能 | 说明 |
|---|---|
| CMSIS-Pack 管理 | 内置 CMSIS-Pack 安装器，支持在线下载和本地导入 |
| 多探针管理 | 同时连接多个 DAPLink，独立操作 |
| 烧录脚本 | 支持 Python 脚本自动化烧录流程 |
| 烧录模板 | 保存常用烧录配置为模板 |
| 固件签名 | 烧录前校验固件签名（安全启动场景） |
| CLI 模式 | 提供命令行接口，支持 CI/CD 集成 |
| 插件系统 | 允许第三方扩展工具页面 |
| RTT 数据解析 | 支持 JSON/Protobuf 等格式的 RTT 数据解析 |
| 示波器模式 | 结合 SWO + 内存采样实现混合数据采集 |

**预计工期：持续迭代**

---

## 六、里程碑总览

| 阶段 | 内容 | 预计工期 | 累计 |
|---|---|---|---|
| Phase 1 | Flash 工具 | 2-3 周 | 2-3 周 |
| Phase 2 | Commander | 1.5-2 周 | 4-5 周 |
| Phase 3 | RTT Viewer | 1.5-2 周 | 6-7 周 |
| Phase 4 | SWO Viewer | 2 周 | 8-9 周 |
| Phase 5 | Scope | 2-3 周 | 10-12 周 |
| Phase 6 | 高级功能 | 持续迭代 | - |

---

## 七、技术风险与应对

| 风险 | 影响 | 应对策略 |
|---|---|---|
| pyOCD Flash 速度慢 | 大固件烧录耗时长 | 抽象层预留替换接口；必要时用 C 扩展加速热路径 |
| libusb 跨平台差异 | 打包后依赖缺失 | 使用 PyInstaller hiddenimports + 平台预编译库 |
| Electron 内存占用 | 应用体积大 | 使用 contextIsolation + 按需加载页面组件 |
| pyOCD API 变动 | 1.0 版本可能不兼容 | 抽象层隔离；锁定 pyOCD 版本 |
| USB 权限问题 | Linux 下无法访问设备 | 内置 udev 规则安装脚本；Windows 下使用 WinUSB 驱动 |
| WebSocket 连接稳定性 | 长时间运行断连 | 自动重连机制 + 心跳检测 |

---

## 八、开发环境要求

### 前端

- Node.js 20+
- pnpm（包管理器）
- VS Code + ESLint + Prettier

### 后端

- Python 3.11+
- pyOCD 0.44+
- libusb 1.0+（Windows 下通过 Zadig 安装 WinUSB 驱动）

### 硬件

- DAPLink 仿真器（CMSIS-DAP v1 或 v2）
- 目标 MCU 开发板（建议 STM32 系列用于开发测试）
