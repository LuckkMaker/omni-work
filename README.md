# OMNI Work

基于 DAPLink 仿真器的嵌入式开发工具集，提供类似 SEGGER J-Link 工具链的完整体验，以开源 DAPLink 硬件为基础，降低嵌入式开发者的工具成本。

- 当前版本：**0.3.1**（前端 `package.json` 与后端 `python/server.py` 同步）
- 后端基于 pyOCD，源码内置在 `python/pyocd/`，不通过 pip 安装

## 功能概览

OMNI Work 对标 SEGGER J-Link 工具链，核心模块均已实现：

| 模块 | 对标产品 | 状态 | 说明 |
|------|----------|------|------|
| Flash 烧录工具 | J-Flash | 已实现 | 固件烧录、擦除（chip/sector）、校验、回读、Hex 查看器、Fill Memory、Compare |
| Commander 命令行 | J-Link Commander | 已实现 | 交互式 REPL，复用 pyOCD Commander，支持 `source` 命令配置源码路径 |
| RTT Viewer | J-Link RTT Viewer | 已实现 | SEGGER RTT 实时数据收发，多 tab，文件发送/录制 |
| Monitor 变量监控 | J-Scope | 已实现 | DWARF 符号解析、SWD/RTT 传输、uPlot 波形图、触发、游标测量 |
| Tools 工具集 | — | 已实现 | Fault Analyzer、Map Analyzer、Number Converter、File Checksum |
| Settings | — | 已实现 | 终端主题、版本信息 |

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron 33 + Vite 5 | 跨平台桌面应用，electron-vite 构建 |
| 前端框架 | React 18 + React Router 6 | 页面路由，每个工具一个页面 |
| 语言 | TypeScript 5 | 全量类型检查 |
| UI 组件 | shadcn/ui (Radix) + Tailwind CSS 3 | 组件化 UI，可定制 |
| 状态管理 | Zustand 5 | 轻量级状态管理，按模块拆分 store |
| 终端 | xterm.js 5（`@xterm/xterm` + `addon-fit` + `addon-web-links`） | Commander / RTT 终端渲染 |
| 图表 | uPlot 1.6（Monitor 波形）、ECharts 6（Map Analyzer） | 高性能时序波形 + 内存分布可视化 |
| 通信 | Axios、WebSocket（ws 8） | HTTP 请求 + 实时数据推送 |
| 布局 | react-resizable-panels | 面板可拖拽调整 |
| 后端 | Python + FastAPI 0.115 + uvicorn 0.34 | 硬件交互层，REST + WebSocket |
| 硬件库 | pyOCD（源码内置 `python/pyocd/`） | DAPLink 通信与 Flash 操作 |
| 解析库 | pyelftools、capstone | ELF/DWARF 解析、ARM 反汇编 |
| USB 后端 | libusb / hidapi（pyOCD 依赖） | CMSIS-DAP v1/v2 通信 |
| 打包 | PyInstaller（后端）+ electron-builder + NSIS（前端安装包） | 前后端一体化打包 |

## 系统架构

```
┌─────────────────────────────────────────────────┐
│                Electron 应用                      │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │          Renderer Process (React)            │ │
│  │   Flash / Commander / RTT / Monitor / Tools  │ │
│  │        shadcn/ui + Tailwind CSS              │ │
│  └────────────────┬────────────────────────────┘ │
│                   │ IPC (contextBridge)            │
│  ┌────────────────┴────────────────────────────┐ │
│  │          Main Process (Electron)             │ │
│  │     Python Bridge (子进程管理 + 端口发现)      │ │
│  └────────────────┬────────────────────────────┘ │
│                   │ HTTP (Axios) + WebSocket       │
│  ┌────────────────┴────────────────────────────┐ │
│  │       Python Backend (FastAPI + pyOCD)       │ │
│  │    REST API  ·  WebSocket 事件推送             │ │
│  │         BackendInterface 抽象层               │ │
│  └────────────────┬────────────────────────────┘ │
│                   │ USB                           │
│           ┌───────▼───────┐                      │
│           │   DAPLink     │                      │
│           │   仿真器      │                      │
│           └───────┬───────┘                      │
│                   │ SWD/JTAG                     │
│           ┌───────▼───────┐                      │
│           │  目标 MCU      │                      │
│           │  (Cortex-M)   │                      │
│           └───────────────┘                      │
└─────────────────────────────────────────────────┘
```

- Electron 主进程启动时 spawn Python 子进程运行 FastAPI 服务，通过 stdout 首行 JSON `{"port": 12345}` 传递动态分配的端口号
- 前端通过 preload 暴露的 IPC API 获取端口后，使用 HTTP（Axios）与 WebSocket（ws 8）双通道与 Python 后端通信：HTTP 用于命令请求，WebSocket 用于实时事件推送（探针状态、Flash 进度、Monitor 采样数据、RTT 数据等）
- pyOCD 源码内置在 `python/pyocd/`，随项目分发，不通过 pip 安装，保证版本一致与离线可用

## 各页面详解

### Flash 页

- **功能**：固件烧录、擦除（chip/sector）、校验、回读、Hex 查看器（支持 1B/2B/4B 分组显示）、Fill Memory（纯前端数据操作）、Compare（文件与设备/数据对比）
- **技术栈**：Zustand `flash.store`、shadcn/ui、自定义 `HexViewer` 组件、`react-resizable-panels` 面板布局
- **关键组件**：`FilePanel`、`HexViewer`、`TabBar`、`FlashProgress`、`InfoPanel`、`LogConsole`、`CompareView`、`ProbeSelector`、`TargetSelector`
- **设计思路**：
  - tab 管理（`file`/`device`）区分文件数据视图与设备回读数据视图
  - `wrapOperation` 统一封装 Flash 操作，处理进度回调与异常
  - 通过 `monitor_backend.pause_during` 与 Monitor 互斥，避免总线冲突
- **注意**：Fill Memory 仅操作当前 tab 的内存数据，不会直接编程到设备；需通过烧录动作才会写入 Flash

### Commander 页

- **功能**：交互式命令行，复用 pyOCD Commander REPL，支持 `reg`、`read32`/`write32`、`halt`/`continue`、`step`、`load`、`erase`、`disasm`、`where`、`symbol`、`elf`、`source` 等命令
- **技术栈**：xterm.js 5（`@xterm/xterm` + addon-fit + addon-web-links）、Zustand `commander.store`、keep-alive 机制
- **关键组件**：`Terminal`（xterm 封装）、`CommandSidebar`（命令列表与帮助）
- **设计思路**：
  - `erase` 命令直接操作 `boot_memory` 的 Flash 实例（与 Flash 页一致），而非 `FlashEraser`，保证擦除行为与 Flash 页统一
  - `source` 命令参考 GDB `directory`/`substitute-path` 设计，解决跨机器源码路径映射问题，配合 `where`/`disasm` 显示源码
- **注意**：Commander 采用 keep-alive 机制，切走页面时使用 `display:none` 保留 xterm 实例与会话状态，切回时无需重新连接

### RTT Viewer 页

- **功能**：SEGGER RTT 实时数据收发，多 tab 通道管理，terminal/bar 两种输入模式，文件发送，录制到 `.dat` 文件
- **技术栈**：xterm.js 5、Zustand `rtt.store`、`useRttSession` 全局会话 hook（跨页面不停止）
- **关键组件**：`RttTerminal`、`RttTabBar`、`ConfigPanel`、`InputBar`、`SendFileButton`、`SaveFormatDialog`、`MultiStringDialog`
- **设计思路**：
  - RTT 会话在 `MainLayout` 顶层启用，切页面不中断数据流
  - 启动有 5 秒超时保护，避免长时间阻塞
- **注意**：若外部工具（如 IDE 调试器、其他 RTT 客户端）占用调试接口，会导致 SWD 挂起，需依赖超时保护并提示用户释放接口

### Monitor 页

- **功能**：变量实时监控与波形采样，DWARF 符号解析（自动从 ELF 提取变量地址），SWD/RTT 两种传输模式，触发（上升沿/下降沿/阈值），游标测量，CSV 导出
- **技术栈**：uPlot 1.6（波形渲染）、Zustand `monitor.store`、WebSocket 实时推送采样数据
- **关键组件**：`WaveformChart`（uPlot 封装）、`ChannelPanel`（通道配置）、`WatchPanel`（变量监视列表）
- **设计思路**：
  - HSS（High-Speed Sampling）异步采样模式：非侵入，通过 SWD 周期性读取内存，适合长期监控
  - RTT 模式：侵入但快速，目标程序主动推送数据，适合高频采样
  - `pause_during` 与 Flash/Commander 互斥，避免调试总线冲突
- **注意**：
  - HSS 模式实际采样率受 SWD 带宽限制，并非标称值
  - 采样率与信号频率的整数倍关系会导致混叠（aliasing），需合理选择采样率

### Tools 页

工具集页面，包含四个独立子工具：

- **Fault Analyzer**：Cortex-M 故障寄存器分析，解析 CFSR/HFSR/MMFSR/BFSR/UFSR 等故障状态寄存器，定位 fault 类型与原因
- **Map Analyzer**：ARM `.map` 链接器输出文件解析与可视化（基于 ECharts 6），分析 ROM/RAM/Stack 占用分布、各 section 大小、符号表
- **Number Converter**：十进制/十六进制/二进制互转，纯前端计算，无后端依赖
- **File Checksum**：CRC32/MD5/SHA-1/SHA-256 校验和计算，基于浏览器 SubtleCrypto API 与前端 CRC 实现

### Settings 页

- 终端主题选择（影响 Commander / RTT 终端配色）
- 版本信息展示（前端 `package.json` 版本 + 后端 `BACKEND_VERSION`）

## 后端 API

后端 FastAPI 服务监听 `127.0.0.1`，动态端口（开发模式固定 `8765`）。基础路径 `http://127.0.0.1:{port}/api`。

### 路由模块

| 模块 | 前缀 | 文件 | 说明 |
|------|------|------|------|
| probes | `/api/probes` | `python/api/probes.py` | 探针管理（列表/连接/断开/刷新） |
| targets | `/api/targets` | `python/api/targets.py` | 支持的 MCU 型号查询 |
| devices | `/api/devices` | `python/api/devices.py` | 设备目录（设备数据库） |
| flash | `/api` | `python/api/flash.py` | Flash 擦除/烧录/校验/回读/复位 |
| files | `/api/files` | `python/api/files.py` | 固件文件解析/读取/保存 |
| commander | `/api` | `python/api/commander.py` | Commander REPL 会话与命令执行 |
| rtt | `/api` | `python/api/rtt.py` | RTT 会话启动/停止/收发 |
| monitor | `/api` | `python/api/monitor.py` | Monitor 采样启动/停止/变量解析 |
| system | `/api` | `python/api/system.py` | 系统信息（版本、平台） |
| tools | `/api` | `python/api/tools.py` | 工具集（fault/map 分析） |

### REST API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/probes` | GET | 列出所有已连接探针（含状态） |
| `/api/probes/states` | GET | 获取探针状态（轻量级） |
| `/api/probes/{uid}/connect` | POST | 连接指定探针 |
| `/api/probes/{uid}/disconnect` | POST | 断开探针 |
| `/api/probes/{uid}/target` | GET | 获取当前目标信息 |
| `/api/probes/{uid}/target` | POST | 手动设置目标芯片型号 |
| `/api/probes/{uid}/status` | GET | 获取探针状态 |
| `/api/probes/refresh` | POST | 手动刷新探针列表 |
| `/api/targets` | GET | 列出所有支持的 MCU 型号 |
| `/api/targets/{part_number}` | GET | 获取指定 MCU 信息 |
| `/api/devices` | GET | 列出设备目录 |
| `/api/devices/{part_number}` | GET | 获取设备详情 |
| `/api/probes/{uid}/flash/erase` | POST | 擦除 Flash（chip/sector/sector_range） |
| `/api/probes/{uid}/flash/program` | POST | 烧录固件 |
| `/api/probes/{uid}/flash/verify` | POST | 校验 Flash 内容 |
| `/api/probes/{uid}/flash/blank-check` | POST | 检查空白 |
| `/api/probes/{uid}/flash/read` | POST | 读取 Flash（返回 base64） |
| `/api/probes/{uid}/flash/cancel` | POST | 取消 Flash 操作 |
| `/api/probes/{uid}/reset` | POST | 复位目标（hw/sw） |
| `/api/files/parse` | POST | 解析固件文件（bin/hex/elf） |
| `/api/files/read` | POST | 读取文件数据 |
| `/api/files/save` | POST | 保存数据到文件 |
| `/api/commander/...` | — | Commander 会话与命令执行 |
| `/api/rtt/...` | — | RTT 会话管理 |
| `/api/monitor/...` | — | Monitor 采样控制 |
| `/api/system/...` | — | 系统信息 |
| `/api/tools/...` | — | Fault/Map 分析工具 |
| `/api/health` | GET | 健康检查 |

### WebSocket 事件

连接 `ws://127.0.0.1:{port}/ws` 后接收以下事件推送：

| 事件 | 说明 |
|------|------|
| `probe.list` | 探针列表更新 |
| `probe.connected` | 探针已连接 |
| `probe.disconnected` | 探针已断开 |
| `probe.added` | 探针热插入 |
| `probe.removed` | 探针热拔出 |
| `flash.progress` | 烧录进度（erase/program/verify） |
| `flash.complete` | 烧录完成 |
| `rtt.data` | RTT 数据到达 |
| `monitor.data` | Monitor 采样数据 |
| `log` | 日志消息 |

## 项目结构

```
omni-work/
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 窗口创建、生命周期、IPC 路由
│   ├── preload.ts               # contextBridge 安全暴露 API
│   └── python-bridge.ts         # Python 子进程管理（启动/停止/端口发现）
│
├── src/                         # React 渲染进程
│   ├── pages/                   # 路由页面
│   │   ├── flash/               # Flash 烧录工具
│   │   │   ├── index.tsx
│   │   │   ├── components/      # HexViewer / FilePanel / TabBar / FlashProgress ...
│   │   │   └── utils/           # sectors.ts
│   │   ├── commander/           # Commander 命令行
│   │   │   ├── index.tsx
│   │   │   └── components/      # Terminal / CommandSidebar
│   │   ├── rtt/                 # RTT Viewer
│   │   │   ├── index.tsx
│   │   │   ├── components/      # RttTerminal / RttTabBar / ConfigPanel ...
│   │   │   └── hooks/           # useRecordToFile
│   │   ├── monitor/             # Monitor 变量监控
│   │   │   ├── index.tsx
│   │   │   └── components/      # WaveformChart / ChannelPanel / WatchPanel
│   │   ├── tools/               # 工具集
│   │   │   ├── index.tsx
│   │   │   ├── fault-analyzer.tsx
│   │   │   ├── map-analyzer.tsx
│   │   │   ├── number-converter.tsx
│   │   │   └── file-checksum.tsx
│   │   └── settings/            # 全局设置
│   ├── components/              # 通用组件
│   │   ├── ui/                  # shadcn/ui 基础组件
│   │   ├── layout/              # DeviceSwitcher / StatusBar
│   │   ├── LogConsole.tsx
│   │   ├── NotificationContainer.tsx
│   │   └── TargetDeviceDialog.tsx
│   ├── stores/                  # Zustand 状态管理
│   │   ├── flash.store.ts
│   │   ├── commander.store.ts
│   │   ├── rtt.store.ts
│   │   ├── monitor.store.ts
│   │   ├── tools.store.ts
│   │   ├── probe.store.ts
│   │   ├── notification.store.ts
│   │   └── ui.store.ts
│   ├── services/                # API 服务层
│   │   ├── api.ts               # HTTP 客户端
│   │   ├── ws.ts                # WebSocket 客户端
│   │   ├── probe.service.ts
│   │   ├── target.service.ts
│   │   ├── device.service.ts
│   │   ├── flash.service.ts
│   │   ├── file.service.ts
│   │   ├── commander.service.ts
│   │   ├── rtt.service.ts
│   │   ├── monitor.service.ts
│   │   └── system.service.ts
│   ├── hooks/                   # 通用 hooks
│   │   ├── useBackendStatus.ts
│   │   ├── useProbeWs.ts
│   │   └── useRttSession.ts     # RTT 全局会话（跨页面不停止）
│   ├── layouts/                 # MainLayout（三段式布局）
│   ├── config/                  # terminal-themes.ts
│   ├── lib/                     # utils.ts（cn 等工具函数）
│   ├── utils/                   # checksum.ts 等工具
│   ├── shared/                  # 共享类型定义
│   └── styles/                  # 全局样式（globals.css）
│
├── python/                      # Python 后端
│   ├── server.py                # FastAPI 入口（版本 0.3.1）
│   ├── api/                     # REST 路由
│   │   ├── probes.py            # 探针管理
│   │   ├── targets.py           # 目标芯片
│   │   ├── devices.py           # 设备目录
│   │   ├── flash.py             # Flash 操作
│   │   ├── files.py             # 文件解析
│   │   ├── commander.py         # Commander REPL
│   │   ├── rtt.py               # RTT 会话
│   │   ├── monitor.py           # Monitor 采样
│   │   ├── tools.py             # Fault/Map 分析
│   │   └── system.py            # 系统信息
│   ├── core/                    # 核心抽象层
│   │   ├── interface.py         # BackendInterface 抽象基类
│   │   ├── pyocd_backend.py     # pyOCD 实现
│   │   ├── commander_backend.py # Commander 会话管理
│   │   ├── rtt_backend.py       # RTT 会话管理
│   │   ├── monitor_backend.py   # Monitor 采样管理
│   │   ├── map_parser.py        # .map 文件解析
│   │   ├── database.py          # 设备数据库
│   │   ├── events.py            # WebSocket 事件系统
│   │   ├── probe_monitor.py     # 探针热插拔监控
│   │   └── command_examples.py  # Commander 示例命令
│   ├── pyocd/                   # pyOCD 源码（内置，不通过 pip 安装）
│   ├── data/                    # 设备信息（device_info.json / devices.db）
│   ├── flm/                     # Flash 算法文件（.FLM）
│   ├── build.py                 # PyInstaller 打包脚本
│   └── requirements.txt
│
├── samples/                     # 测试固件
│   ├── GPIO_Toggle.bin
│   └── GPIO_Toggle.hex
│
├── docs/                        # 文档
│   ├── ui-rules.md              # UI 设计规则
│   └── pyocd-reference.md       # pyOCD 命令参考手册
│
├── build.ps1                    # 一体化打包脚本
└── package.json
```

## 快速开始

### 环境要求

- **Node.js** 20+
- **Python** 3.11+（需包含 venv 模块）
- **DAPLink 仿真器**（CMSIS-DAP v1 或 v2）
- **目标 MCU 开发板**（建议 STM32 系列用于测试）

### 安装

```bash
# 安装前端依赖
npm install

# 创建 Python 虚拟环境并安装依赖
# Windows（使用系统 Python，非 TRAE 内置版本）
C:\Users\<用户名>\AppData\Local\Programs\Python\Python311\python.exe -m venv .venv
.venv\Scripts\pip.exe install -r python/requirements.txt
```

或使用 npm 脚本一键创建虚拟环境：

```bash
npm run python:install
```

### 运行

```bash
# 启动 Electron 开发模式（自动启动 Python 后端）
npm run dev
```

开发模式下 Python 后端使用固定端口 `8765`，Electron 通过 IPC 获取端口后前端自动连接。

### 单独运行 Python 后端（调试用）

```bash
# 使用 npm 脚本
npm run python:dev

# 或直接调用
.venv\Scripts\python.exe python/server.py --port 8765
```

### 类型检查

```bash
npm run typecheck
```

### 打包

```bash
# 一体化打包（构建前端 + PyInstaller 打包后端 + electron-builder 生成 NSIS 安装包）
npm run package

# 清理后重新打包
npm run package:clean
```

打包产物：`release/OMNI Work-0.3.1-x64-setup.exe`（NSIS 安装包）

## 支持的目标芯片

pyOCD 内置支持 70+ 款 Cortex-M MCU，包括 STM32、GD32、APM32、NXP 等主流系列。完整列表可通过 `/api/targets` 接口获取。通过 CMSIS Device Family Packs 可进一步扩展覆盖范围。

> 注意：首次连接时 pyOCD 可能识别为通用 `cortex_m` 类型（无 Flash 布局信息），此时需手动选择具体 MCU 型号以获取正确的 Flash 参数。

## 开发说明

- **UI 设计规则**：详见 [docs/ui-rules.md](docs/ui-rules.md)，包含颜色 token、圆角策略、排版、间距、图标、组件规范、通知系统等完整设计标准
- **pyOCD 命令参考**：详见 [docs/pyocd-reference.md](docs/pyocd-reference.md)，整理了 pyOCD 的 CLI 子命令、Commander REPL 命令、Python API 及本项目后端封装
- **版本同步**：前端版本号定义在 `package.json` 的 `version` 字段，后端版本号定义在 `python/server.py` 的 `BACKEND_VERSION` 常量，两者需保持一致（当前 0.3.1）
- **pyOCD 源码**：内置在 `python/pyocd/`，修改后无需 pip 安装，直接生效；打包时由 PyInstaller 一并打入后端可执行文件

## 许可证

待定
