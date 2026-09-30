import { compareHlc, createHlcClock, parseHlc } from './hlc'

describe('hlc', () => {
  it('increments the counter when physical time does not advance', () => {
    const clock = createHlcClock('abcd1234', () => 1_727_650_000_000)

    const first = clock.send()
    const second = clock.send()

    expect(compareHlc(first, second)).toBeLessThan(0)
    expect(parseHlc(second).counter).toBe(parseHlc(first).counter + 1)
  })

  it('receives remote values without moving backwards', () => {
    let now = 1_727_650_000_000
    const clock = createHlcClock('abcd1234', () => now)

    const local = clock.send()
    now -= 1000
    const received = clock.receive('001727650001000-00002-ffffeeee')

    expect(compareHlc(local, received)).toBeLessThan(0)
    expect(parseHlc(received).nodeId).toBe('abcd1234')
  })
})
