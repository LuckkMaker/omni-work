"""命令示例数据库

为 pyOCD Commander 命令提供准确的示例代码和中文说明。
这些示例直接由后端返回给前端展示，不经过自动生成。

格式：{ 'command_name': [{'cmd': '示例命令', 'desc': '中文说明'}, ...] }
"""

# 命令示例数据库
COMMAND_EXAMPLES = {
    # ── Memory 命令 ──────────────────────────
    'read32': [
        {'cmd': 'read32 0x20000000', 'desc': '读取 SRAM 起始处 1 个 32 位字'},
        {'cmd': 'read32 0x20000000 16', 'desc': '读取 SRAM 起始处 16 字节（4 个字）'},
        {'cmd': 'read32 0x08000000 32', 'desc': '读取 Flash 起始处 32 字节'},
        {'cmd': 'read32 0xE0042000', 'desc': '读取 DBGMCU_IDCODE（STM32 设备 ID + 版本号）'},
        {'cmd': 'read32 0xE000ED00', 'desc': '读取 CPUID（ARM Cortex-M4 内核 ID）'},
        {'cmd': 'read32 0x1FFF7A10 12', 'desc': '读取 96 位唯一设备 ID（UID，3 个字）'},
    ],
    'read16': [
        {'cmd': 'read16 0x20000000', 'desc': '读取 1 个 16 位半字'},
        {'cmd': 'read16 0x20000000 8', 'desc': '读取 8 字节（4 个半字）'},
    ],
    'read8': [
        {'cmd': 'read8 0x20000000', 'desc': '读取 1 个字节'},
        {'cmd': 'read8 0x20000000 16', 'desc': '读取 16 字节'},
    ],
    'write32': [
        {'cmd': 'write32 0x20000000 0xDEADBEEF', 'desc': '向 SRAM 写入 1 个 32 位字'},
        {'cmd': 'write32 0x20000000 0x12345678 0x9ABCDEF0', 'desc': '连续写入多个 32 位字'},
    ],
    'write16': [
        {'cmd': 'write16 0x20000000 0xBEEF', 'desc': '写入 1 个 16 位半字'},
    ],
    'write8': [
        {'cmd': 'write8 0x20000000 0xFF', 'desc': '写入 1 个字节'},
    ],
    'savemem': [
        {'cmd': 'savemem 0x20000000 256 dump.bin', 'desc': '将 256 字节内存转储到文件'},
        {'cmd': 'savemem 0x08000000 1024 flash_dump.bin', 'desc': '转储 1KB Flash 内容到文件'},
    ],
    'loadmem': [
        {'cmd': 'loadmem 0x20000000 data.bin', 'desc': '从文件加载内容到指定内存地址'},
    ],
    'load': [
        {'cmd': 'load firmware.hex', 'desc': '烧录 hex 固件文件到 Flash'},
        {'cmd': 'load firmware.bin 0x08000000', 'desc': '烧录 bin 文件到指定 Flash 地址'},
        {'cmd': 'load D:/workspaces/firmware.hex', 'desc': '烧录绝对路径的固件文件'},
    ],
    'compare': [
        {'cmd': 'compare 0x08000000 1024 firmware.bin', 'desc': '比较 1KB Flash 内容与文件'},
        {'cmd': 'cmp 0x08000000 firmware.bin', 'desc': '比较 Flash 内容与文件（简写）'},
    ],
    'fill': [
        {'cmd': 'fill 0x20000000 0x100 0x00', 'desc': '用 0x00 填充 256 字节内存'},
        {'cmd': 'fill 32 0x20000000 0x100 0xDEADBEEF', 'desc': '用 32 位值填充 256 字节'},
    ],
    'disasm': [
        {'cmd': 'disasm 0x08000000 32', 'desc': '反汇编 Flash 起始处 32 字节'},
        {'cmd': 'disasm -c 16 0x08000000', 'desc': '反汇编 16 条指令'},
    ],

    # ── Flash 命令 ──────────────────────────
    'erase': [
        {'cmd': 'erase', 'desc': '擦除整个 Flash'},
        {'cmd': 'erase 0x08000000 4', 'desc': '擦除指定地址处 4 个扇区'},
    ],
    'unlock': [
        {'cmd': 'unlock', 'desc': '解锁 Flash 写保护'},
    ],

    # ── DAP (Debug Access Port) 命令 ──────────────────────────
    'readdp': [
        {'cmd': 'readdp 0x0', 'desc': '读取 DPIDR（调试端口 ID，SWD 模式）'},
        {'cmd': 'readdp 0x4', 'desc': '读取 CTRL/STAT（控制状态寄存器）'},
        {'cmd': 'readdp 0x8', 'desc': '读取 SELECT（DP bank 选择 + APSEL）'},
    ],
    'writedp': [
        {'cmd': 'writedp 0x4 0x1F', 'desc': '写 ABORT 寄存器（清除错误标志）'},
        {'cmd': 'writedp 0x8 0x0', 'desc': '写 SELECT（选择 APSEL=0, bank=0）'},
    ],
    'readap': [
        {'cmd': 'readap 0 0xFC', 'desc': '读取 APSEL=0 的 IDR（AP 标识寄存器）'},
        {'cmd': 'readap 0 0x0', 'desc': '读取 APSEL=0 的 CSW（控制状态字）'},
        {'cmd': 'readap 0 0x4', 'desc': '读取 APSEL=0 的 TAR（传输地址寄存器）'},
        {'cmd': 'readap 0xFC', 'desc': '读取默认 APSEL 的 IDR（简写）'},
    ],
    'writeap': [
        {'cmd': 'writeap 0 0x0 0xA2000042', 'desc': '写 CSW（32 位传输，地址自增）'},
        {'cmd': 'writeap 0 0x4 0xE0042000', 'desc': '写 TAR（指向 DBGMCU_IDCODE）'},
        {'cmd': 'writeap 0 0xC 0x0', 'desc': '写 DRW（向 TAR 地址写入 0）'},
    ],
    'initdp': [
        {'cmd': 'initdp', 'desc': '初始化 DP 并上电调试（用于 --no-init 模式）'},
    ],
    'makeap': [
        {'cmd': 'makeap 0', 'desc': '为 APSEL=0 创建 AP 对象并打印 IDR'},
        {'cmd': 'makeap 1', 'desc': '为 APSEL=1 创建 AP 对象'},
    ],
    'flushprobe': [
        {'cmd': 'flushprobe', 'desc': '刷新探针缓冲，确保所有请求完成'},
    ],
    'reinit': [
        {'cmd': 'reinit', 'desc': '重新初始化目标对象'},
    ],

    # ── Register 命令 ──────────────────────────
    'reg': [
        {'cmd': 'reg', 'desc': '读取所有核心寄存器'},
        {'cmd': 'reg r0', 'desc': '读取 R0 寄存器'},
        {'cmd': 'reg r0 r1 r2', 'desc': '读取多个寄存器'},
        {'cmd': 'reg -f r0', 'desc': '强制读取 R0（绕过缓存）'},
    ],
    'wreg': [
        {'cmd': 'wreg r0 0x20000000', 'desc': '设置 R0 为 0x20000000'},
        {'cmd': 'wreg pc 0x08000000', 'desc': '设置 PC 为 0x08000000'},
    ],

    # ── Run Control 命令 ──────────────────────────
    'halt': [
        {'cmd': 'halt', 'desc': '暂停 CPU 执行'},
    ],
    'resume': [
        {'cmd': 'resume', 'desc': '恢复 CPU 执行'},
        {'cmd': 'continue', 'desc': '恢复执行（continue 简写）'},
    ],
    'step': [
        {'cmd': 'step', 'desc': '单步执行一条指令'},
        {'cmd': 'step 10', 'desc': '单步执行 10 条指令'},
    ],
    'reset': [
        {'cmd': 'reset', 'desc': '复位目标并运行'},
        {'cmd': 'reset -h', 'desc': '复位目标并暂停（reset halt）'},
    ],
    'status': [
        {'cmd': 'status', 'desc': '查看目标当前状态'},
    ],
    'where': [
        {'cmd': 'where', 'desc': '查看当前 PC 指向的位置（含源码）'},
    ],

    # ── Breakpoint / Watchpoint 命令 ──────────────────────────
    'break': [
        {'cmd': 'break 0x08000100', 'desc': '在地址 0x08000100 设置断点'},
        {'cmd': 'break main', 'desc': '在 main 函数入口设置断点'},
    ],
    'watch': [
        {'cmd': 'watch 0x20000000', 'desc': '在地址 0x20000000 设置监视点'},
        {'cmd': 'watch 0x20000000 rw', 'desc': '设置读写监视点'},
        {'cmd': 'watch 0x20000000 w 4', 'desc': '设置 4 字节写监视点'},
    ],

    # ── Disassembly / Symbol 命令 ──────────────────────────
    'elf': [
        {'cmd': 'elf firmware.axf', 'desc': '加载 ELF/AXF 符号文件'},
        {'cmd': 'elf build/debug/firmware.elf', 'desc': '加载调试目录下的 ELF 文件'},
        {'cmd': '# 流程: halt → erase → load firmware.axf → reset -h → elf firmware.axf', 'desc': '完整烧录调试流程示例'},
    ],
    'symbol': [
        {'cmd': 'symbol main', 'desc': '查看 main 符号的地址'},
    ],

    # ── GDB Server 命令 ──────────────────────────
    'gdbserver': [
        {'cmd': 'gdbserver start', 'desc': '启动 GDB Server'},
        {'cmd': 'gdbserver status', 'desc': '查看 GDB Server 状态'},
        {'cmd': 'gdbserver stop', 'desc': '停止 GDB Server'},
    ],

    # ── Target / Probe 命令 ──────────────────────────
    'list': [
        {'cmd': 'list', 'desc': '列出所有已连接的调试探针'},
    ],
    'targets': [
        {'cmd': 'targets', 'desc': '列出所有支持的目标芯片'},
        {'cmd': 'targets apm32f407xg', 'desc': '过滤显示包含关键字的目标'},
    ],
    'select': [
        {'cmd': 'select 0', 'desc': '选择索引为 0 的探针'},
    ],

    # ── Session / Info 命令 ──────────────────────────
    'show': [
        {'cmd': 'show map', 'desc': '显示内存映射'},
        {'cmd': 'show target', 'desc': '显示目标信息'},
        {'cmd': 'show cores', 'desc': '显示所有核心信息'},
    ],
    'help': [
        {'cmd': 'help', 'desc': '显示所有命令列表'},
        {'cmd': 'help read32', 'desc': '显示 read32 命令的详细帮助'},
    ],

    # ── Exit ──────────────────────────
    'exit': [
        {'cmd': 'exit', 'desc': '退出 Commander'},
        {'cmd': 'quit', 'desc': '退出 Commander（quit 简写）'},
    ],
}


def get_example_strings(cmd_name: str):
    """兼容旧接口：返回纯字符串列表"""
    examples = COMMAND_EXAMPLES.get(cmd_name, [])
    return [e['cmd'] for e in examples] if examples else []
