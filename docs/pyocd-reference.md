# pyOCD 命令参考手册

本手册整理了 pyOCD 的三类接口，供本项目开发参考：

1. **CLI 命令行工具** — `pyocd <subcommand>` 形式的命令行操作
2. **Commander REPL 命令** — 交互式调试器中的命令
3. **Python API** — 在代码中直接调用的类和方法

---

## 目录

- [CLI 命令行工具](#cli-命令行工具)
  - [通用参数](#通用参数)
  - [list — 列出探针/目标/板子](#list)
  - [load — 烧录固件](#load)
  - [erase — 擦除 Flash](#erase)
  - [reset — 复位目标](#reset)
  - [commander — 交互式调试](#commander)
  - [gdbserver — GDB 调试服务器](#gdbserver)
  - [rtt — SEGGER RTT 日志](#rtt)
  - [run — 运行目标程序](#run)
  - [server — 探针服务器](#server)
  - [json — JSON 格式输出](#json)
  - [pack — CMSIS Pack 管理](#pack)
- [Commander REPL 命令](#commander-repl-命令)
- [Python API](#python-api)
  - [ConnectHelper — 连接探针](#connecthelper)
  - [Session — 会话管理](#session)
  - [SoCTarget / CoreSightTarget — 目标操作](#soctarget)
  - [FlashEraser — 擦除](#flasheraser)
  - [FileProgrammer — 烧录](#fileprogrammer)
  - [DAPAccessCMSISDAP — 底层探针访问](#dapaccesscmsisdap)
  - [MemoryMap / MemoryRegion — 内存映射](#memorymap)
- [本项目后端 API](#本项目后端-api)

---

## CLI 命令行工具

### 通用参数

以下参数在大多数子命令中通用（`list` 和 `json` 除外）：

#### 配置参数

| 参数 | 说明 |
|------|------|
| `-j, --project PATH` | 项目目录，默认为当前目录 |
| `--config PATH` | 指定 YAML 配置文件 |
| `--no-config` | 不使用配置文件 |
| `--script PATH` | 用户脚本，默认为 `pyocd_user.py` |
| `-O OPTION=VALUE` | 设置命名选项 |
| `-da, --daparg DAPARG` | （已弃用）发送设置到 DAPAccess 层 |
| `--pack PATH` | CMSIS Device Family Pack 的 .pack 文件路径 |
| `--cbuild-run PATH` | CSolution 的 .cbuild-run.yml 文件路径 |

#### 连接参数

| 参数 | 说明 |
|------|------|
| `-u, --uid, --probe UNIQUE_ID` | 通过唯一 ID 选择探针（支持部分匹配） |
| `-t, --target TARGET` | 设置目标芯片型号 |
| `-f, --frequency FREQUENCY` | SWD/JTAG 时钟频率（Hz），支持 K/M 后缀，如 `10m`、`2.5khz` |
| `-W, --no-wait` | 无探针时不等待 |
| `-M, --connect MODE` | 连接模式：`halt`、`pre-reset`、`under-reset`、`attach` |

#### 日志参数

| 参数 | 说明 |
|------|------|
| `-v, --verbose` | 增加日志级别（可多次指定） |
| `-q, --quiet` | 降低日志级别（可多次指定） |
| `-L, --log-level LOGGERS=LEVEL` | 设置指定 logger 的级别，如 `-L*.trace,pyocd.core.*=debug` |
| `--color {always,auto,never}` | 控制彩色日志（默认 auto） |

---

### list

列出可用的探针、目标、板子或功能。

```bash
pyocd list                     # 列出已连接的探针
pyocd list --targets           # 列出所有已知的目标芯片
pyocd list --boards            # 列出所有已知的板子
pyocd list --probes            # 列出探针（详细）
```

| 参数 | 说明 |
|------|------|
| `--targets, -t` | 列出所有已知的目标芯片 |
| `--boards, -b` | 列出所有已知的板子 |
| `--probes, -p` | 列出已连接的探针 |

---

### load

烧录固件到目标 Flash。

```bash
pyocd load firmware.bin -t apm32f407xg
pyocd load firmware.hex --format hex
pyocd load firmware.elf --base-address 0x08000000
pyocd load firmware.bin --erase chip --verify --reset
```

| 参数 | 说明 |
|------|------|
| `file` | 固件文件路径（.bin/.hex/.elf） |
| `-b, --base-address ADDR` | 基地址（主要用于 .bin 文件） |
| `--format {bin,hex,elf,auto}` | 文件格式（默认 auto） |
| `--erase {auto,chip,sector}` | 擦除模式（默认 auto） |
| `--no-erase` | 不擦除 |
| `--verify` | 烧录后校验 |
| `--no-reset` | 烧录后不复位 |
| `--trust-crc` | 校验时使用 CRC（快速） |
| `--no-security` | 跳过安全区域检查 |
| `-n, --no-progress` | 不显示进度条 |

---

### erase

擦除目标 Flash。

```bash
pyocd erase -t apm32f407xg --chip          # 擦除整个芯片
pyocd erase -t apm32f407xg --sector 0x08000000 0x10000  # 擦除指定扇区
```

| 参数 | 说明 |
|------|------|
| `--chip` | 擦除整个芯片 |
| `--sector ADDR LENGTH` | 擦除指定地址范围（可多次指定） |
| `-n, --no-progress` | 不显示进度条 |

---

### reset

复位目标芯片。

```bash
pyocd reset -t apm32f407xg              # 默认复位
pyocd reset -t apm32f407xg --halt       # 复位后暂停
pyocd reset -t apm32f407xg -m hw        # 硬件复位
```

| 参数 | 说明 |
|------|------|
| `-m, --method METHOD` | 复位方法：`default`、`hw`、`sw`、`sysresetreq`、`vectreset`、`emulated` |
| `-c, --core CORE` | 执行软件复位的核心编号（默认 0） |
| `-l, --halt` | 复位后在第一条指令处暂停 |

---

### commander

启动交互式调试器，可执行内存读写、寄存器查看、断点等操作。

```bash
pyocd commander -t apm32f407xg                    # 交互模式
pyocd commander -t apm32f407xg -c "reg" "halt"    # 执行命令后退出
pyocd commander -t apm32f407xg -x commands.txt    # 从文件执行命令
pyocd commander -t apm32f407xg -c "reg" -i        # 执行后进入交互模式
```

| 参数 | 说明 |
|------|------|
| `-H, --halt` | 连接时暂停核心（已弃用，用 `--connect halt`） |
| `-N, --no-init` | 不初始化调试系统 |
| `--elf PATH` | 指定 ELF 文件 |
| `-c, --command CMD` | 执行命令（可多次指定） |
| `-x, --execute FILE` | 从文件执行命令（`-` 表示 stdin） |
| `-i, --interactive` | 命令执行完后进入交互模式 |

---

### gdbserver

启动 GDB 远程调试服务器。

```bash
pyocd gdbserver -t apm32f407xg --port 3333 --swd
```

| 参数 | 说明 |
|------|------|
| `-p, --port PORT` | GDB 服务器端口（默认 3333） |
| `-T, --telnet-port PORT` | Telnet 半托管服务器端口（默认 4444） |
| `--swd` | 使用 SWD 接口 |
| `--jtag` | 使用 JTAG 接口 |
| `-b, --board BOARD_ID` | 选择板子 |
| `--allow-remote` | 允许远程连接 |
| `--persist` | 断开后保持调试会话 |
| `--elf PATH` | ELF 文件路径 |
| `-r, --rate` | 半托管轮询频率（Hz） |
| `--rtt` | 启用 RTT |
| `--server` | 嵌入式 GDB 服务器路径 |

---

### rtt

SEGGER Real-Time Transfer (RTT) 日志查看。

```bash
pyocd rtt -t apm32f407xg -d rtt.log        # 记录到文件
pyocd rtt -t apm32f407xg -a 0x20000000 -s 0x1000  # 指定搜索范围
```

| 参数 | 说明 |
|------|------|
| `-a, --address ADDR` | RTT 控制块搜索起始地址 |
| `-s, --size SIZE` | RTT 控制块搜索范围大小 |
| `--up-channel-id ID` | 上行通道 ID |
| `--down-channel-id ID` | 下行通道 ID |
| `-d, --log-file FILE` | 日志文件（启用日志模式） |

---

### run

运行目标程序并捕获半托管输出。

```bash
pyocd run -t apm32f407xg firmware.elf
pyocd run -t apm32f407xg --timelimit 30    # 30 秒后停止
```

| 参数 | 说明 |
|------|------|
| `--eot` | 检测到 EOT 字符 (0x04) 时终止 |
| `--timelimit SECONDS` | 最大执行时间（秒） |

---

### server

启动探针服务器（远程探针访问）。

```bash
pyocd server -p 5555 --allow-remote
```

| 参数 | 说明 |
|------|------|
| `-p, --port PORT` | 服务器端口（默认 5555） |
| `--allow-remote` | 允许远程 TCP/IP 连接 |
| `--local-only` | 仅本地连接 |

---

### json

以 JSON 格式输出探针/目标/板子/功能列表。

```bash
pyocd json -p    # 探针列表
pyocd json -t    # 目标列表
pyocd json -b    # 板子列表
pyocd json -f    # 功能和选项列表
```

| 参数 | 说明 |
|------|------|
| `-p, --probes` | 列出可用探针 |
| `-t, --targets` | 列出所有已知目标 |
| `-b, --boards` | 列出所有已知板子 |
| `-f, --features` | 列出可用功能和选项 |

---

### pack

CMSIS Device Family Pack 管理。

```bash
pyocd pack update              # 更新 pack 索引
pyocd pack find STM32F4*       # 查找匹配的 pack
pyocd pack install STM32F407   # 安装 pack
pyocd pack show                # 显示已安装的 pack
pyocd pack clean               # 清除所有 pack
```

子命令：`clean`、`find`、`install`、`show`、`update`

| 参数 | 说明 |
|------|------|
| `-n, --no-download` | 只列出不实际下载 |
| `-H, --no-header` | 不打印表头 |

---

## Commander REPL 命令

在 `pyocd commander` 交互模式中可用的命令。

### 会话与状态

| 命令 | 说明 |
|------|------|
| `list` | 列出所有探针 |
| `status` | 显示目标状态（运行/暂停） |
| `exit`, `quit` | 退出 commander |
| `help [command]` | 显示帮助 |
| `sleep MS` | 睡眠指定毫秒 |
| `set OPTION VALUE` | 设置会话选项 |

### 复位与运行控制

| 命令 | 说明 |
|------|------|
| `reset` | 复位目标 |
| `halt` | 暂停目标 |
| `continue`, `go` | 继续运行 |
| `step` | 单步执行 |

### 寄存器

| 命令 | 说明 |
|------|------|
| `reg [name]` | 读取寄存器（不指定名称则读取所有） |
| `wreg NAME VALUE` | 写入寄存器 |
| `reg --all` | 读取所有寄存器包括调试寄存器 |

### 内存读写

| 命令 | 说明 |
|------|------|
| `read8 ADDR [COUNT]` | 读取 8 位内存 |
| `read16 ADDR [COUNT]` | 读取 16 位内存 |
| `read32 ADDR [COUNT]` | 读取 32 位内存 |
| `read64 ADDR [COUNT]` | 读取 64 位内存 |
| `write8 ADDR DATA...` | 写入 8 位内存 |
| `write16 ADDR DATA...` | 写入 16 位内存 |
| `write32 ADDR DATA...` | 写入 32 位内存 |
| `write64 ADDR DATA...` | 写入 64 位内存 |
| `savemem ADDR SIZE FILE` | 保存内存到文件 |
| `loadmem ADDR FILE` | 从文件加载到内存 |
| `load FILE [FORMAT]` | 烧录固件文件 |
| `compare ADDR FILE` | 比较内存与文件 |
| `fill ADDR SIZE PATTERN` | 填充内存 |
| `find ADDR SIZE PATTERN` | 在内存中搜索 |

### Flash 操作

| 命令 | 说明 |
|------|------|
| `erase [ADDR LENGTH]` | 擦除 Flash（不指定参数则擦除整个芯片） |
| `unlock` | 解锁安全区域 |

### 断点与观察点

| 命令 | 说明 |
|------|------|
| `break ADDR` | 设置断点 |
| `remove BREAKPOINT` | 移除断点 |
| `lsbreak` | 列出断点 |
| `watch ADDR [SIZE] [R/W/RW]` | 设置观察点 |
| `rmbreak BREAKPOINT` | 移除断点 |
| `rmwatch WATCHPOINT` | 移除观察点 |
| `lswatch` | 列出观察点 |

### 调试端口 (DP/AP)

| 命令 | 说明 |
|------|------|
| `readdp ADDR` | 读取 DP 寄存器 |
| `writedp ADDR DATA` | 写入 DP 寄存器 |
| `readap ADDR` | 读取 AP 寄存器 |
| `writeap ADDR DATA` | 写入 AP 寄存器 |
| `initdp` | 初始化 DP |
| `makeap AP_NUM` | 创建 AP |
| `flushprobe` | 刷新探针缓冲 |
| `reinit` | 重新初始化 |

### 其他

| 命令 | 说明 |
|------|------|
| `disasm ADDR [COUNT]` | 反汇编 |
| `where` | 显示当前 PC 位置和源码 |
| `symbol NAME` | 查找符号地址 |
| `core NUM` | 选择核心 |
| `gdbserver start` / `stop` | 启动/停止 GDB 服务器 |
| `probeserver start` / `stop` | 启动/停止探针服务器 |

---

## Python API

### ConnectHelper

连接探针和创建会话的入口。

```python
from pyocd.core.helpers import ConnectHelper

# 方式1: 自动选择探针并创建会话
with ConnectHelper.session_with_chosen_probe(
    target="apm32f407xg",
    frequency=10_000_000,  # 10 MHz
) as session:
    target = session.target
    target.reset_and_halt()
    # ... 操作 ...
    target.resume()

# 方式2: 获取所有已连接探针
probes = ConnectHelper.get_all_connected_probes()
for probe in probes:
    print(f"UID: {probe.unique_id}, vendor: {probe.vendor_name}")

# 方式3: 使用指定 UID 创建会话
with ConnectHelper.session_with_chosen_probe(
    unique_id="00000080066bff48",
    target="apm32f407xg",
) as session:
    pass
```

| 方法 | 说明 |
|------|------|
| `session_with_chosen_probe(...)` | 自动选择探针并创建会话（上下文管理器） |
| `get_all_connected_probes()` | 获取所有已连接探针列表 |
| `get_connected_probe(unique_id)` | 通过 UID 获取指定探针 |

**关键参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `unique_id` | `str` | 探针唯一 ID（支持部分匹配） |
| `target` | `str` | 目标芯片型号 |
| `frequency` | `int` | SWD/JTAG 时钟频率 (Hz) |
| `options` | `dict` | 会话选项字典 |
| `connect_mode` | `ConnectMode` | 连接模式：`halt`、`pre_reset`、`under_reset`、`attach` |
| `halting_enabled` | `bool` | 连接时是否暂停 |
| `auto_open` | `bool` | 是否自动打开会话 |

---

### Session

会话管理，包含探针、目标、板子等。

```python
session = ConnectHelper.session_with_chosen_probe(target="apm32f407xg")

# 打开/关闭
session.open()
session.close()
session.is_open  # bool

# 核心属性
session.target      # SoCTarget 对象
session.probe       # Probe 对象
session.board       # Board 对象
session.options     # 选项字典

# 日志
session.log.set_level("info")
```

| 方法/属性 | 说明 |
|----------|------|
| `open(init_board=True)` | 打开会话 |
| `close()` | 关闭会话 |
| `is_open` | 会话是否打开 |
| `target` | 目标芯片对象 (SoCTarget) |
| `probe` | 探针对象 |
| `board` | 板子对象 |
| `options` | 会话选项字典 |
| `user_script` | 用户脚本 |

---

### SoCTarget

目标芯片操作，包括内存读写、复位、断点等。

```python
target = session.target

# 运行控制
target.reset()           # 复位
target.reset_and_halt()  # 复位并暂停
target.halt()            # 暂停
target.resume()          # 继续

# 内存读写（单值）
target.write_memory(0x20000000, 0x12345678, transfer_size=32)
val = target.read_memory(0x20000000, transfer_size=32)

# 批量读写
target.write_memory_block8(0x20000000, [0x01, 0x02, 0x03])
target.write_memory_block32(0x20000000, [0x12345678, 0xAABBCCDD])
data8 = target.read_memory_block8(0x08000000, 1024)   # 返回 list[int]
data32 = target.read_memory_block32(0x08000000, 256)   # 返回 list[int]，256 个 word

# 寄存器
target.read_core_register("r0")
target.write_core_register("r0", 0x1234)

# 状态
target.get_state()  # Target.State.RUNNING / HALTED / RESET

# 断点
target.set_breakpoint(0x08001000)
target.remove_breakpoint(0x08001000)
target.get_breakpoint_type()
```

| 方法 | 说明 |
|------|------|
| `reset(reset_type=None)` | 复位目标 |
| `reset_and_halt(reset_type=None)` | 复位并暂停 |
| `halt()` | 暂停 |
| `resume()` | 继续运行 |
| `write_memory(addr, data, transfer_size=32)` | 写入单个值 |
| `read_memory(addr, transfer_size=32, now=True)` | 读取单个值 |
| `write_memory_block8(addr, data)` | 批量写入 8 位 |
| `write_memory_block32(addr, data)` | 批量写入 32 位 |
| `read_memory_block8(addr, size)` | 批量读取 8 位 |
| `read_memory_block32(addr, size)` | 批量读取 32 位（**推荐，性能最优**） |
| `read_core_register(name)` | 读取 CPU 寄存器 |
| `write_core_register(name, value)` | 写入 CPU 寄存器 |
| `get_state()` | 获取目标状态 |
| `set_breakpoint(addr)` | 设置断点 |
| `remove_breakpoint(addr)` | 移除断点 |

**ResetType 枚举：** `hw`（硬件）、`sw`（软件）、`sysresetreq`、`vectreset`、`emulated`

---

### FlashEraser

擦除 Flash 内容。

```python
from pyocd.flash.eraser import FlashEraser

# 整片擦除
eraser = FlashEraser(session, FlashEraser.Mode.CHIP)
eraser.erase()

# 扇区擦除
eraser = FlashEraser(session, FlashEraser.Mode.SECTOR)
eraser.erase(addresses=[(0x08000000, 0x10000), (0x08010000, 0x10000)])

# 大规模擦除（不受扇区边界限制）
eraser = FlashEraser(session, FlashEraser.Mode.MASS)
eraser.erase()
```

| 模式 | 说明 |
|------|------|
| `FlashEraser.Mode.MASS` | 大规模擦除，不受扇区边界限制 |
| `FlashEraser.Mode.CHIP` | 整片擦除 |
| `FlashEraser.Mode.SECTOR` | 扇区擦除，需提供 `addresses` 参数 |

**方法：**

| 方法 | 说明 |
|------|------|
| `erase(addresses=None)` | 执行擦除；SECTOR 模式需要 `addresses=[(addr, length), ...]` |

---

### FileProgrammer

烧录固件文件到 Flash。

```python
from pyocd.flash.file_programmer import FileProgrammer

# 简单烧录
programmer = FileProgrammer(session)
programmer.program("firmware.bin")

# 指定格式和基地址
programmer.program("firmware.bin", file_format="bin", base_address=0x08000000)

# 分步操作（可添加多个文件）
programmer = FileProgrammer(session)
programmer.add_file("bootloader.bin", file_format="bin", base_address=0x08000000)
programmer.add_file("app.bin", file_format="bin", base_address=0x08008000)
# 实际烧录由 FileProgrammer 内部在 program() 或 commit() 时执行
```

| 方法 | 说明 |
|------|------|
| `add_file(path, file_format=None, **kwargs)` | 添加文件到待烧录队列 |
| `program(path, file_format=None, **kwargs)` | 烧录单个文件（一步到位） |

**支持的文件格式：** `bin`、`hex`（Intel HEX）、`elf`、`auto`（自动检测）

**kwargs 关键参数：**

| 参数 | 说明 |
|------|------|
| `base_address` | 基地址（仅 .bin 文件） |
| `skip` | 跳过的字节数 |
| `length` | 烧录的长度 |
| `no_reset` | 烧录后不复位 |
| `trust_crc` | 使用 CRC 校验 |

---

### DAPAccessCMSISDAP

底层探针访问层（一般不需要直接使用）。

```python
from pyocd.probe.pydapaccess import DAPAccessCMSISDAP

# 列出所有 CMSIS-DAP 探针
probes = DAPAccessCMSISDAP.get_connected_devices()
for p in probes:
    print(f"UID: {p.get_unique_id()}")

# 检查 v2 (WinUSB bulk) 支持
probe = probes[0]
iface = getattr(probe, '_interface', None)
if iface:
    is_bulk = getattr(iface, 'is_bulk', False)
    print(f"CMSIS-DAP {'v2' if is_bulk else 'v1'}")

# 打开探针
probe.open()
link = probe._link

# 读取探针信息
pkt_size = link.identify(link.ID.MAX_PACKET_SIZE)  # v1=64, v2=512
pkt_count = link.identify(link.ID.MAX_PACKET_COUNT)  # v1=4, v2=64
fw_ver = link.identify(link.ID.CMSIS_DAP_VERSION)
caps = link.identify(link.ID.CAPABILITIES)

probe.close()
```

| `link.ID` 枚举 | 说明 |
|----------------|------|
| `MAX_PACKET_SIZE` | 最大包大小（v1=64, v2=512） |
| `MAX_PACKET_COUNT` | 最大包数量（v1=4, v2=64） |
| `CMSIS_DAP_VERSION` | CMSIS-DAP 版本 |
| `CAPABILITIES` | 支持的功能位掩码 |
| `SWO_BUFFER_SIZE` | SWO 缓冲区大小 |
| `MAX_PACKET_COUNT_CONFIG` | 可配置的最大包数量 |

---

### MemoryMap

内存映射和区域查询。

```python
from pyocd.core.memory_map import MemoryType

# 获取 Flash 区域
flash_regions = [r for r in session.target.memory_map if r.type == MemoryType.FLASH]
for region in flash_regions:
    print(f"Flash: 0x{region.start:08X} - 0x{region.start + region.length:08X} ({region.length} bytes)")
    print(f"  blocksize: {region.blocksize} bytes")
    print(f"  erased_byte: 0x{region.erased_byte_value:02X}")

# 获取 RAM 区域
ram_regions = [r for r in session.target.memory_map if r.type == MemoryType.RAM]

# 通过地址查找所属区域
region = session.target.memory_map.get_region_for_address(0x08000000)
```

| `MemoryType` 枚举 | 说明 |
|-------------------|------|
| `FLASH` | Flash 存储器 |
| `RAM` | 随机存取存储器 |
| `ROM` | 只读存储器 |
| `DEVICE` | 外设寄存器 |
| `SYSTEM` | 系统区域 |

| MemoryRegion 属性 | 说明 |
|-------------------|------|
| `start` | 起始地址 |
| `length` | 大小（字节） |
| `end` | 结束地址（start + length） |
| `type` | 区域类型 (MemoryType) |
| `blocksize` | 扇区大小（字节） |
| `erased_byte_value` | 擦除后的字节值（通常 0xFF） |
| `is_flash` | 是否为 Flash |
| `is_ram` | 是否为 RAM |
| `is_boot_memory` | 是否为启动存储器 |

---

## 本项目后端 API

本项目通过 FastAPI 封装了 pyOCD 的常用操作，HTTP API 基础路径为 `http://127.0.0.1:8765/api`。

### 探针管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/probes` | 列出所有探针（含连接状态） |
| GET | `/probes/states` | 获取探针状态（轻量级） |
| POST | `/probes/{uid}/connect` | 连接探针 |
| POST | `/probes/{uid}/disconnect` | 断开探针 |
| GET | `/probes/{uid}/target` | 获取目标信息 |
| POST | `/probes/{uid}/target` | 设置目标型号 |
| GET | `/probes/{uid}/status` | 获取探针状态 |
| POST | `/probes/refresh` | 刷新探针列表 |

**连接请求体：**
```json
{
  "target": "apm32f407xg",
  "interface": "swd",
  "speed": 10000000
}
```

### Flash 操作

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/probes/{uid}/flash/erase` | 擦除 Flash |
| POST | `/probes/{uid}/flash/program` | 烧录固件 |
| POST | `/probes/{uid}/flash/verify` | 校验 Flash |
| POST | `/probes/{uid}/flash/blank-check` | 检查空白 |
| POST | `/probes/{uid}/flash/read` | 读取 Flash |
| POST | `/probes/{uid}/reset` | 复位目标 |
| POST | `/probes/{uid}/flash/cancel` | 取消 Flash 操作 |

**擦除请求体：**
```json
{
  "type": "chip",
  "address": 0,
  "size": 0
}
```
`type` 可选值：`chip`（整片）、`sector`（扇区）、`sector_range`（范围）

**烧录请求体：**
```json
{
  "file_path": "D:/firmware.bin",
  "verify": true,
  "reset": true,
  "base_address": null
}
```

**读取请求体：**
```json
{
  "type": "chip",
  "address": 0,
  "size": 0,
  "output_path": ""
}
```
返回 `{ "success": true, "base64_data": "...", "base_address": ..., "bytes_read": ..., "duration_ms": ... }`

### 文件操作

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/files/parse` | 解析固件文件 |
| POST | `/files/read` | 读取文件数据 |
| POST | `/files/save` | 保存数据到文件 |

### 目标与设备

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/targets` | 列出所有支持的 MCU 型号 |
| GET | `/targets/{part_number}` | 获取 MCU 信息 |
| GET | `/devices` | 列出设备目录 |
| GET | `/devices/{part_number}` | 获取设备详情 |

### WebSocket 事件

连接 `ws://127.0.0.1:8765/ws` 接收实时事件：

| 事件 | 说明 |
|------|------|
| `probe.connected` | 探针已连接 |
| `probe.disconnected` | 探针已断开 |
| `probe.list` | 探针列表更新 |
| `flash.progress` | Flash 操作进度 |
| `flash.complete` | Flash 操作完成 |
| `log` | 日志消息 |

---

## 常用会话选项

通过 `-O option=value` 或 `options={...}` 设置。

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `frequency` | 1000000 | SWD/JTAG 时钟频率 (Hz) |
| `dap_protocol` | `swd` | 调试协议：`swd`、`jtag` |
| `connect_mode` | `halt` | 连接模式 |
| `reset_type` | `sw` | 复位类型 |
| `cmsis_dap.deferred_transfers` | `True` | 延迟传输（批量打包 USB 请求） |
| `cmsis_dap.limit_packets` | `False` | 限制包数量（调试用） |
| `auto_set_target` | `False` | 自动检测目标 |
| `hide_programming_progress` | `False` | 隐藏编程进度 |
| `keep_unwritten` | `False` | 保留未写入的 Flash 内容 |
| `smart_flash` | `True` | 智能烧录（跳过空白页） |
| `chip_erase` | `auto` | 芯片擦除模式 |
| `enable_rtconsole` | `False` | 启用 RTT 控制台 |
| `rtt_location` | `auto` | RTT 控制块位置 |
| `log_level` | `info` | 日志级别 |
