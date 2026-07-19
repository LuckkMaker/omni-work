"""命令示例数据库

为 pyOCD Commander 命令提供准确的示例代码。
这些示例直接由后端返回给前端展示，不经过自动生成。
"""

# 命令示例数据库
# 格式：{ 'command_name': ['示例1', '示例2', ...] }
COMMAND_EXAMPLES = {
    # ── Memory 命令 ──────────────────────────
    'read32': [
        'read32 0x20000000',
        'read32 0x20000000 16',
        'read32 0x08000000 32',
        'read32 0xE0042000',
        'read32 0xE000ED00',
        'read32 0x1FFF7A10 3',
    ],
    'read16': [
        'read16 0x20000000',
        'read16 0x20000000 8',
    ],
    'read8': [
        'read8 0x20000000',
        'read8 0x20000000 16',
    ],
    'write32': [
        'write32 0x20000000 0xDEADBEEF',
        'write32 0x20000000 0x12345678 0x9ABCDEF0',
    ],
    'write16': [
        'write16 0x20000000 0xBEEF',
    ],
    'write8': [
        'write8 0x20000000 0xFF',
    ],
    'savemem': [
        'savemem 0x20000000 256 dump.bin',
        'savemem 0x08000000 1024 flash_dump.bin',
    ],
    'loadmem': [
        'loadmem 0x20000000 data.bin',
    ],
    'load': [
        'load firmware.hex',
        'load firmware.bin 0x08000000',
        'load D:/workspaces/firmware.hex',
    ],
    'compare': [
        'compare 0x08000000 1024 firmware.bin',
        'cmp 0x08000000 firmware.bin',
    ],
    'fill': [
        'fill 0x20000000 0x100 0x00',
        'fill 32 0x20000000 0x100 0xDEADBEEF',
    ],
    'disasm': [
        'disasm 0x08000000 32',
        'disasm -c 16 0x08000000',
    ],

    # ── Flash 命令 ──────────────────────────
    'erase': [
        'erase',
        'erase 0x08000000 4',
    ],
    'unlock': [
        'unlock',
    ],

    # ── DAP (Debug Access Port) 命令 ──────────────────────────
    'readdp': [
        'readdp 0x0',
        'readdp 0x4',
        'readdp 0x8',
    ],
    'writedp': [
        'writedp 0x4 0x1F',
        'writedp 0x8 0x0',
    ],
    'readap': [
        'readap 0 0xFC',
        'readap 0 0x0',
        'readap 0 0x4',
        'readap 0xFC',
    ],
    'writeap': [
        'writeap 0 0x0 0xA2000042',
        'writeap 0 0x4 0xE0042000',
        'writeap 0 0xC 0x0',
    ],
    'initdp': [
        'initdp',
    ],
    'makeap': [
        'makeap 0',
        'makeap 1',
    ],
    'flushprobe': [
        'flushprobe',
    ],
    'reinit': [
        'reinit',
    ],

    # ── Register 命令 ──────────────────────────
    'reg': [
        'reg',
        'reg r0',
        'reg r0 r1 r2',
        'reg -f r0',
    ],
    'wreg': [
        'wreg r0 0x20000000',
        'wreg pc 0x08000000',
    ],

    # ── Run Control 命令 ──────────────────────────
    'halt': [
        'halt',
    ],
    'resume': [
        'resume',
        'continue',
    ],
    'step': [
        'step',
        'step 10',
    ],
    'reset': [
        'reset',
        'reset -h',
    ],
    'status': [
        'status',
    ],
    'where': [
        'where',
    ],

    # ── Breakpoint / Watchpoint 命令 ──────────────────────────
    'break': [
        'break 0x08000100',
        'break main',
    ],
    'watch': [
        'watch 0x20000000',
        'watch 0x20000000 rw',
        'watch 0x20000000 w 4',
    ],

    # ── Disassembly / Symbol 命令 ──────────────────────────
    'elf': [
        'elf firmware.axf',
        'elf build/debug/firmware.elf',
        '# 用法: halt → erase → load firmware.axf → reset -h → elf firmware.axf',
    ],
    'symbol': [
        'symbol main',
    ],

    # ── GDB Server 命令 ──────────────────────────
    'gdbserver': [
        'gdbserver start',
        'gdbserver status',
        'gdbserver stop',
    ],

    # ── Target / Probe 命令 ──────────────────────────
    'list': [
        'list',
    ],
    'targets': [
        'targets',
        'targets apm32f407xg',
    ],
    'select': [
        'select 0',
    ],

    # ── Session / Info 命令 ──────────────────────────
    'show': [
        'show map',
        'show target',
        'show cores',
    ],
    'help': [
        'help',
        'help read32',
    ],

    # ── Exit ──────────────────────────
    'exit': [
        'exit',
        'quit',
    ],
}
