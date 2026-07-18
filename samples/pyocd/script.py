# Read memory block and format output
base = 0x20000000
for offset in range(0, 0x20, 4):
    addr = base + offset
    val = target.read32(addr)
    print(f'0x{addr:08X}: 0x{val:08X}')
# Write memory
target.write32(0x20000000, 0xDEADBEEF)
# Read register
print(f'R0 = 0x{target.regs["r0"]:08X}')