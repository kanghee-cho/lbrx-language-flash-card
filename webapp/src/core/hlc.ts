export interface ParsedHlc {
  physical: number
  counter: number
  nodeId: string
}

function pad(value: number, width: number): string {
  return value.toString().padStart(width, '0')
}

export function formatHlc(parsed: ParsedHlc): string {
  return `${pad(parsed.physical, 15)}-${pad(parsed.counter, 5)}-${parsed.nodeId}`
}

export function parseHlc(value: string): ParsedHlc {
  const match = /^(\d{15})-(\d{5})-([a-z0-9]+)$/u.exec(value)
  if (!match) {
    throw new Error(`Invalid HLC: ${value}`)
  }

  return {
    physical: Number(match[1]),
    counter: Number(match[2]),
    nodeId: match[3]!,
  }
}

export function compareHlc(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1
}

export interface HlcClock {
  send: () => string
  receive: (remoteHlc: string) => string
  peek: () => string | null
}

export function createHlcClock(
  nodeId: string,
  nowProvider: () => number = Date.now,
): HlcClock {
  let lastPhysical = 0
  let lastCounter = 0
  let lastValue: string | null = null

  const update = (physical: number, counter: number) => {
    lastPhysical = physical
    lastCounter = counter
    lastValue = formatHlc({ physical, counter, nodeId })
    return lastValue
  }

  return {
    send() {
      const now = nowProvider()
      const physical = Math.max(now, lastPhysical)
      const counter = physical === lastPhysical ? lastCounter + 1 : 0
      return update(physical, counter)
    },
    receive(remoteHlc: string) {
      const remote = parseHlc(remoteHlc)
      const now = nowProvider()
      const physical = Math.max(now, lastPhysical, remote.physical)

      let counter = 0
      if (physical === lastPhysical && physical === remote.physical) {
        counter = Math.max(lastCounter, remote.counter) + 1
      } else if (physical === lastPhysical) {
        counter = lastCounter + 1
      } else if (physical === remote.physical) {
        counter = remote.counter + 1
      }

      return update(physical, counter)
    },
    peek() {
      return lastValue
    },
  }
}
