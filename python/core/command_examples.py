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
    ],
    'wmem': [
        'wmem 0x20000000 0x12345678 0xDEADBEEF',
    ],

    # ── Register 命令 ──────────────────────────
    'reg': [
        'reg',
        'reg r0',
        'reg r0 r1 r2',
        'reg -f',
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
        'reset -halt',
        'reset -run',
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
        'break -h 0x08000100',
    ],
    'rbreak': [
        'rbreak main',
    ],
    'tbreak': [
        'tbreak 0x08000100',
    ],
    'watch': [
        'watch read 0x20000000',
        'watch write 0x20000000',
        'watch read 0x20000000 4',
    ],
    'rwp': [
        'rwp 0',
        'rwp all',
    ],

    # ── Flash 命令 ──────────────────────────
    'erase': [
        'erase',
        'erase 0x08000000 0x08004000',
        'erase sector 0 3',
    ],
    'unlock': [
        'unlock',
    ],

    # ── Disassembly / Symbol 命令 ──────────────────────────
    'disasm': [
        'disasm 0x08000000 32',
        'disasm -c 16 0x08000000',
    ],
    'symbol': [
        'symbol',
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

    # ── Monitor 命令 ──────────────────────────
    'monitor': [
        'monitor reset',
        'monitor halt',
    ],

    # ── Exit ──────────────────────────
    'exit': [
        'exit',
        'quit',
    ],
}
