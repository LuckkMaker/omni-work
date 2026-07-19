# OMNI Work

基于 DAPLink 仿真器的嵌入式开发工具集，提供类似 SEGGER J-Link 工具链的完整体验，以开源 DAPLink 硬件为基础，降低嵌入式开发者的工具成本。

## 功能概览

OMNI Work 对标 SEGGER J-Link 工具链，分阶段实现以下模块：

| 模块 | 对标产品 | 状态 | 说明 |
|------|----------|------|------|
| Flash 工具 | J-Flash | 开发中 | 固件烧录、擦除、校验 |
| Commander | J-Link Commander | 规划中 | 交互式命令行，内存/寄存器读写 |
| RTT Viewer | J-Link RTT Viewer | 规划中 | RTT 实时数据收发 |
| SWO Viewer | J-Link SWO Viewer | 规划中 | SWO/SWV 数据解码与显示 |
| Scope | J-Scope | 规划中 | 实时数据波形可视化 |

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron 33 + Vite 5 | 跨平台桌面应用 |
| 前端框架 | React 18 + React Router 6 | 页面路由，每个工具一个页面 |
| UI 组件 | shadcn/ui + Tailwind CSS 3 | 组件化 UI，可定制 |
| 状态管理 | Zustand 5 | 轻量级状态管理 |
| 后端 | Python 3.11 + FastAPI | 硬件交互层 |
| 硬件库 | pyOCD 0.44 | DAPLink 通信与 Flash 操作 |
| 通信 | HTTP REST + WebSocket | 命令请求 + 实时数据推送 |
| 打包 | electron-builder + PyInstaller | 前后端一体化打包 |

## 系统架构

```
┌─────────────────────────────────────────────────┐
│                Electron 应用                      │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │          Renderer Process (React)            │ │
│  │   Flash / Commander / RTT / SWO / Scope      │ │
│  │        shadcn/ui + Tailwind CSS              │ │
│  └────────────────┬────────────────────────────┘ │
│                   │ IPC (contextBridge)            │
│  ┌────────────────┴────────────────────────────┐ │
│  │          Main Process (Electron)             │ │
│  │     Python Bridge (子进程管理 + 端口发现)      │ │
│  └────────────────┬────────────────────────────┘ │
│                   │ HTTP + WebSocket              │
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

Electron 主进程启动时 spawn Python 子进程运行 FastAPI 服务，通过 stdout 首行 JSON `{"port": 12345}` 传递动态分配的端口号。前端通过 preload 暴露的 IPC API 获取端口后，直接与 Python 后端进行 HTTP 和 WebSocket 通信。

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
│   │   ├── flash/               # Flash 工具
│   │   │   ├── index.tsx
│   │   │   └── components/      # ProbeSelector / TargetSelector
│   │   ├── commander/           # Commander（规划中）
│   │   ├── rtt/                 # RTT Viewer（规划中）
│   │   ├── swo/                 # SWO Viewer（规划中）
│   │   ├── scope/               # Scope（规划中）
│   │   └── settings/            # 全局设置
│   ├── components/ui/           # shadcn/ui 基础组件
│   ├── stores/                  # Zustand 状态管理
│   ├── services/                # API 服务层
│   │   ├── api.ts               # HTTP 客户端
│   │   ├── ws.ts                # WebSocket 客户端
│   │   ├── probe.service.ts     # 探针 API
│   │   ├── flash.service.ts     # Flash 操作 API
│   │   ├── target.service.ts    # 目标芯片 API
│   │   └── file.service.ts      # 文件解析 API
│   ├── hooks/                   # 通用 hooks
│   ├── layouts/                 # 布局组件
│   ├── shared/                  # 共享类型定义
│   └── styles/                  # 全局样式
│
├── python/                      # Python 后端
│   ├── server.py                # FastAPI 入口
│   ├── api/                     # REST 路由
│   │   ├── probes.py            # 探针管理
│   │   ├── flash.py             # Flash 操作
│   │   ├── targets.py           # 目标芯片
│   │   └── files.py             # 文件解析
│   ├── core/                    # 核心抽象层
│   │   ├── interface.py         # BackendInterface 抽象基类
│   │   ├── pyocd_backend.py     # pyOCD 实现
│   │   ├── events.py            # WebSocket 事件系统
│   │   └── probe_monitor.py     # 探针热插拔监控
│   └── requirements.txt
│
├── samples/                     # 测试固件
│   ├── GPIO_Toggle.bin
│   └── GPIO_Toggle.hex
│
├── docs/                        # 文档
│   └── rules.md                 # UI 风格规范
├── PLAN.md                      # 项目详细计划
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

### 运行

```bash
# 启动 Electron 开发模式（自动启动 Python 后端）
npm run dev
```

开发模式下 Python 后端使用固定端口 `8765`，Electron 通过 IPC 获取端口后前端自动连接。

### 单独运行 Python 后端（调试用）

```bash
.venv\Scripts\python.exe python/server.py --port 8765
```

### 类型检查

```bash
npm run typecheck
```

## 后端 API

### REST API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/probes` | GET | 列出所有已连接探针（含状态） |
| `/api/probes/{uid}/connect` | POST | 连接指定探针 |
| `/api/probes/{uid}/disconnect` | POST | 断开探针 |
| `/api/probes/{uid}/target` | GET | 获取当前目标信息 |
| `/api/probes/{uid}/target` | POST | 手动设置目标芯片型号 |
| `/api/probes/refresh` | POST | 手动刷新探针列表 |
| `/api/targets` | GET | 列出所有支持的 MCU 型号 |
| `/api/probes/{uid}/flash/erase` | POST | 擦除 Flash（chip/sector） |
| `/api/probes/{uid}/flash/program` | POST | 烧录固件 |
| `/api/probes/{uid}/flash/verify` | POST | 校验 Flash 内容 |
| `/api/probes/{uid}/reset` | POST | 复位目标（hw/sw） |
| `/api/files/parse` | POST | 解析固件文件（bin/hex/elf） |
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
| `log` | 日志消息 |

## 支持的目标芯片

pyOCD 内置支持 70+ 款 Cortex-M MCU，包括 STM32、GD32、NXP 等主流系列。完整列表可通过 `/api/targets` 接口获取。通过 CMSIS Device Family Packs 可进一步扩展覆盖范围。

> 注意：首次连接时 pyOCD 可能识别为通用 `cortex_m` 类型（无 Flash 布局信息），此时需手动选择具体 MCU 型号以获取正确的 Flash 参数。

## 开发阶段规划

| 阶段 | 内容 | 预计工期 |
|------|------|----------|
| Phase 1 | Flash 工具 | 2-3 周 |
| Phase 2 | Commander | 1.5-2 周 |
| Phase 3 | RTT Viewer | 1.5-2 周 |
| Phase 4 | SWO Viewer | 2 周 |
| Phase 5 | Scope | 2-3 周 |

当前进度：Phase 1 Step 1-4 已完成（项目初始化、探针管理后端、Flash 操作后端、探针与目标选择前端），Step 5（文件加载与烧录）开发中。

详见 [PLAN.md](PLAN.md) 获取完整项目计划。

## UI 风格

本项目使用 shadcn/ui 组件系统，采用 `slate` 基色 + `blue` 主色的亮色主题。所有颜色通过 CSS 变量 + Tailwind 语义 token 引用，不硬编码颜色值。详见 [docs/rules.md](docs/rules.md)。

## 许可证

待定
