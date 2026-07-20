import { useEffect, useRef, useCallback } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { MonitorVariable, SamplePoint } from '@/services/monitor.service'
import type { ChannelConfig } from '@/stores/monitor.store'

export interface CursorMeasurement {
  /** 左游标时间（秒） */
  t1: number
  /** 右游标时间（秒） */
  t2: number
  /** 各通道在左右游标处的值 */
  values: { varId: string; name: string; v1: number | null; v2: number | null; delta: number | null }[]
}

interface Props {
  variables: MonitorVariable[]
  channels: ChannelConfig[]
  samples: SamplePoint[]
  follow: boolean
  /** 时间窗口（秒），Follow 模式下显示最近 N 秒 */
  windowSec?: number
  className?: string
  /** 游标选择回调（拖选区域后触发） */
  onCursorSelect?: (m: CursorMeasurement | null) => void
}

/** 最大渲染点数（超过时做 min/max 降采样） */
const MAX_RENDER_POINTS = 5000
/** Y 轴自适应的边距比例（上下各留 10%） */
const Y_PADDING = 0.1
/** Y 轴 hysteresis：新范围与旧范围重叠超过此比例时不更新，避免频繁跳动 */
const Y_HYSTERESIS = 0.15

export function WaveformChart({
  variables, channels, samples, follow,
  windowSec = 10, className, onCursorSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const dirtyRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const followRef = useRef(follow)
  const samplesRef = useRef(samples)
  const varsRef = useRef(variables)
  const chansRef = useRef(channels)
  const windowRef = useRef(windowSec)
  // Y 轴 hysteresis：记录上次设置的 Y 范围
  const yRangeRef = useRef<{ min: number; max: number } | null>(null)
  // 游标回调 ref（避免重建 uPlot）
  const onCursorRef = useRef(onCursorSelect)
  useEffect(() => { onCursorRef.current = onCursorSelect }, [onCursorSelect])

  // 同步 ref（避免重建 uPlot）
  useEffect(() => { followRef.current = follow }, [follow])
  useEffect(() => { samplesRef.current = samples; dirtyRef.current = true; scheduleRender() }, [samples])
  useEffect(() => { varsRef.current = variables; dirtyRef.current = true; scheduleRender() }, [variables])
  useEffect(() => { chansRef.current = channels; dirtyRef.current = true; scheduleRender() }, [channels])
  useEffect(() => { windowRef.current = windowSec }, [windowSec])

  // ── 构建可见通道列表（visible=true 的通道）──
  const getVisibleSeries = useCallback(() => {
    const chans = chansRef.current
    const vars = varsRef.current
    return vars
      .filter((v) => {
        const ch = chans.find((c) => c.varId === v.id)
        return ch?.visible ?? true
      })
      .map((v) => ({
        variable: v,
        channel: chans.find((c) => c.varId === v.id)!,
      }))
  }, [])

  // ── 数据转换：samples -> uPlot data 格式 ──
  const buildPlotData = useCallback(() => {
    const series = getVisibleSeries()
    const pts = samplesRef.current
    if (pts.length === 0 || series.length === 0) {
      return { data: [[] as number[], ...series.map(() => [] as number[])] as uPlot.AlignedData, series }
    }

    // 降采样：如果点数超过上限，等间隔抽样
    const step = pts.length > MAX_RENDER_POINTS
      ? Math.ceil(pts.length / MAX_RENDER_POINTS)
      : 1

    const tArr: number[] = []
    const valArrays: number[][] = series.map(() => [])

    for (let i = 0; i < pts.length; i += step) {
      const pt = pts[i]
      tArr.push(pt.t_ms / 1000) // 转为秒
      series.forEach((s, si) => {
        const v = pt.values.find((x) => x.id === s.variable.id)
        valArrays[si].push(v?.value ?? null as any)
      })
    }

    return {
      data: [tArr, ...valArrays] as uPlot.AlignedData,
      series,
    }
  }, [getVisibleSeries])

  // ── 渲染调度（rAF 节流）──
  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      doRender()
    })
  }, [])

  // ── 实际渲染 ──
  const doRender = useCallback(() => {
    const plot = plotRef.current
    if (!plot) return

    const { data, series } = buildPlotData()
    if (data[0].length === 0) return

    // 应用 Y 偏移/缩放到数据
    for (let si = 0; si < series.length; si++) {
      const yOffset = series[si].channel.yOffset
      const yScale = series[si].channel.yScale
      if (yOffset !== 0 || yScale !== 1) {
        const arr = data[si + 1]
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] !== null) {
            arr[i] = (arr[i] as number) * yScale + yOffset
          }
        }
      }
    }

    plot.setData(data)

    // Follow 模式：X 轴自动滚动到最新数据 + Y 轴自适应
    if (followRef.current && data[0].length > 0) {
      const lastT = data[0][data[0].length - 1] as number
      const win = windowRef.current

      // 触发检测：找第一个启用触发的通道，以其最近触发点作为窗口右边界
      // （示波器式触发：信号穿越/达到阈值时定格，便于观察边沿/电平）
      let trigXMax: number | null = null
      for (let si = 0; si < series.length; si++) {
        const ch = series[si].channel
        if (ch.triggerMode === 'none') continue
        const arr = data[si + 1]
        const level = ch.triggerLevel
        // 从后往前找最近的触发点
        for (let i = arr.length - 1; i >= 1; i--) {
          const prev = arr[i - 1]
          const curr = arr[i]
          if (prev === null || curr === null || typeof prev !== 'number' || typeof curr !== 'number') continue
          let hit = false
          if (ch.triggerMode === 'rising' && prev < level && curr >= level) hit = true
          else if (ch.triggerMode === 'falling' && prev > level && curr <= level) hit = true
          else if (ch.triggerMode === 'level' && curr >= level) hit = true
          if (hit) { trigXMax = data[0][i] as number; break }
        }
        if (trigXMax !== null) break
      }

      const xMax = trigXMax !== null ? trigXMax : lastT
      const xMin = xMax - win
      plot.setScale('x', { min: xMin, max: xMax })

      // Y 轴自适应：计算窗口内数据的 min/max
      let yMin = Infinity
      let yMax = -Infinity
      for (let i = 0; i < data[0].length; i++) {
        const t = data[0][i] as number
        if (t < xMin || t > xMax) continue
        for (let si = 0; si < series.length; si++) {
          const v = data[si + 1][i]
          if (v !== null && typeof v === 'number') {
            if (v < yMin) yMin = v
            if (v > yMax) yMax = v
          }
        }
      }

      if (yMin !== Infinity && yMax !== -Infinity) {
        // 添加边距
        const range = yMax - yMin || 1
        const paddedMin = yMin - range * Y_PADDING
        const paddedMax = yMax + range * Y_PADDING

        // Hysteresis：如果新范围在旧范围内且变化不大，不更新
        const prev = yRangeRef.current
        if (prev) {
          const prevRange = prev.max - prev.min
          // 如果数据仍在旧范围内且未超出 hysteresis 阈值，保持旧范围
          if (paddedMin >= prev.min + prevRange * Y_HYSTERESIS &&
              paddedMax <= prev.max - prevRange * Y_HYSTERESIS) {
            // 数据在旧范围内，不更新
          } else {
            yRangeRef.current = { min: paddedMin, max: paddedMax }
            plot.setScale('y', { min: paddedMin, max: paddedMax })
          }
        } else {
          yRangeRef.current = { min: paddedMin, max: paddedMax }
          plot.setScale('y', { min: paddedMin, max: paddedMax })
        }
      }
    } else {
      // 非 Follow 模式：重置 Y 轴 hysteresis，让 uPlot 自动计算
      yRangeRef.current = null
    }
  }, [buildPlotData])

  // ── 创建/重建 uPlot 实例（变量或通道数变化时）──
  useEffect(() => {
    if (!containerRef.current) return

    const series = getVisibleSeries()
    const width = containerRef.current.clientWidth || 600
    const height = containerRef.current.clientHeight || 300

    const opts: uPlot.Options = {
      width,
      height,
      series: [
        {}, // X 轴（时间）
        ...series.map((s) => ({
          label: s.variable.name,
          stroke: s.channel.color,
          width: 1.5,
          points: { show: false },
        })),
      ],
      axes: [
        {
          label: windowSec < 0.001 ? '时间 (μs)' : windowSec < 1 ? '时间 (ms)' : '时间 (s)',
          space: 60,
        },
        {
          label: '值',
          space: 50,
        },
      ],
      legend: {
        show: true,
        live: true,
      },
      cursor: {
        drag: { x: true, y: false, setScale: false },
      },
      hooks: {
        setSelect: [(self: uPlot) => {
          const sel = self.select
          if (!sel || sel.width < 2) {
            // 选择区域太小，清除游标
            onCursorRef.current?.(null)
            return
          }
          // 将像素坐标转换为数据坐标
          const t1 = self.posToVal(sel.left, 'x')
          const t2 = self.posToVal(sel.left + sel.width, 'x')
          const visibleSeries = varsRef.current
            .filter((v) => {
              const ch = chansRef.current.find((c) => c.varId === v.id)
              return ch?.visible ?? true
            })
          // 在数据中找到最接近 t1/t2 的采样点
          const pts = samplesRef.current
          const findNearest = (t: number) => {
            if (pts.length === 0) return null
            let best = pts[0]
            let bestDist = Math.abs(best.t_ms / 1000 - t)
            for (let i = 1; i < pts.length; i++) {
              const d = Math.abs(pts[i].t_ms / 1000 - t)
              if (d < bestDist) { best = pts[i]; bestDist = d }
            }
            return best
          }
          const p1 = findNearest(t1)
          const p2 = findNearest(t2)
          const values = visibleSeries.map((v) => {
            const v1 = p1?.values.find((x) => x.id === v.id)?.value ?? null
            const v2 = p2?.values.find((x) => x.id === v.id)?.value ?? null
            const delta = (v1 !== null && v2 !== null) ? v2 - v1 : null
            return { varId: v.id, name: v.name, v1, v2, delta }
          })
          onCursorRef.current?.({ t1, t2, values })
        }],
      },
      scales: {
        x: {
          time: true,
        },
      },
    }

    const plot = new uPlot(opts, [[]], containerRef.current)
    plotRef.current = plot

    // ResizeObserver 监听容器大小变化
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && plotRef.current) {
        plotRef.current.setSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      plot.destroy()
      plotRef.current = null
    }
    // 依赖变量ID列表和通道可见性，变化时重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    variables.map((v) => v.id).join(','),
    channels.filter((c) => c.visible).map((c) => c.varId).join(','),
    channels.map((c) => c.color).join(','),
    windowSec,
  ])

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />
}
