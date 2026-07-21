/**
 * 通信校验算法集合
 *
 * 用于 RTT 发送数据时附加校验值。所有算法接收字节数组，返回字节数组（校验值）。
 * 校验范围由调用方截取 data.slice(start, end) 后传入。
 */

/** Modbus CRC16（低字节在前） */
export function modbusCrc16(data: Uint8Array): Uint8Array {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xa001
      } else {
        crc >>= 1
      }
    }
  }
  // Modbus 低字节在前
  return new Uint8Array([crc & 0xff, (crc >> 8) & 0xff])
}

/** CRC32（IEEE 802.3，多项式 0xEDB88320，最终异或 0xFFFFFFFF） */
export function crc32(data: Uint8Array): Uint8Array {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320
      } else {
        crc >>>= 1
      }
    }
  }
  crc ^= 0xffffffff
  return new Uint8Array([
    (crc >>> 24) & 0xff,
    (crc >>> 16) & 0xff,
    (crc >>> 8) & 0xff,
    crc & 0xff,
  ])
}

/** ADD8（8 位累加和） */
export function add8(data: Uint8Array): Uint8Array {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum = (sum + data[i]) & 0xff
  }
  return new Uint8Array([sum & 0xff])
}

/** XOR8（8 位异或和） */
export function xor8(data: Uint8Array): Uint8Array {
  let x = 0
  for (let i = 0; i < data.length; i++) {
    x ^= data[i]
  }
  return new Uint8Array([x & 0xff])
}

/** ADD16（16 位累加和，大端） */
export function add16(data: Uint8Array): Uint8Array {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum = (sum + data[i]) & 0xffff
  }
  return new Uint8Array([(sum >> 8) & 0xff, sum & 0xff])
}

/** CRC16-CCITT（多项式 0x1021，初始 0xFFFF，大端） */
export function crc16Ccitt(data: Uint8Array): Uint8Array {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= (data[i] << 8) & 0xff00
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff
      } else {
        crc = (crc << 1) & 0xffff
      }
    }
  }
  return new Uint8Array([(crc >> 8) & 0xff, crc & 0xff])
}

export type ChecksumType =
  | 'modbus-crc16'
  | 'crc16-ccitt'
  | 'crc32'
  | 'add8'
  | 'xor8'
  | 'add16'

export interface ChecksumOption {
  value: ChecksumType
  label: string
  desc: string
}

export const CHECKSUM_OPTIONS: ChecksumOption[] = [
  { value: 'modbus-crc16', label: 'Modbus CRC16', desc: 'Modbus 协议 CRC16，低字节在前' },
  { value: 'crc16-ccitt', label: 'CRC16-CCITT', desc: '多项式 0x1021，初始 0xFFFF，大端' },
  { value: 'crc32', label: 'CRC32', desc: 'IEEE 802.3 CRC32，大端' },
  { value: 'add8', label: 'ADD8', desc: '8 位累加和' },
  { value: 'xor8', label: 'XOR8', desc: '8 位异或和' },
  { value: 'add16', label: 'ADD16', desc: '16 位累加和，大端' },
]

/** 计算指定类型校验值 */
export function computeChecksum(data: Uint8Array, type: ChecksumType): Uint8Array {
  switch (type) {
    case 'modbus-crc16': return modbusCrc16(data)
    case 'crc16-ccitt': return crc16Ccitt(data)
    case 'crc32': return crc32(data)
    case 'add8': return add8(data)
    case 'xor8': return xor8(data)
    case 'add16': return add16(data)
  }
}

/**
 * 按字节范围截取数据并计算校验值
 * @param data 原始数据
 * @param type 校验类型
 * @param start 起始字节索引（0-based，含）
 * @param end 结束字节索引：
 *   - -1：至末尾（含全部字节）
 *   - -2：排除末尾 1 字节
 *   - -3：排除末尾 2 字节
 *   - 以此类推，负值 N 表示排除末尾 |N+1| 字节
 *   - >=0：0-based 索引（含）
 */
export function computeChecksumWithRange(
  data: Uint8Array,
  type: ChecksumType,
  start: number,
  end: number,
): Uint8Array {
  const safeStart = Math.max(0, Math.min(start, data.length))
  const safeEnd = end < 0
    ? Math.max(safeStart, data.length + (end + 1))
    : Math.min(end + 1, data.length)
  const slice = data.slice(safeStart, safeEnd)
  return computeChecksum(slice, type)
}
