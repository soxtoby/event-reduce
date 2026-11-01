import { expect, test } from "bun:test"
import { Effect, signal } from "event-reduce"

test("unattached effect, when a source changes, reports that source as invalidating it once checked", () => {
    let source = signal(1, 'source')
    let sut = new Effect('sut', () => source.value, () => { })
    sut.run()
    source.setValue(2)

    sut.isStale

    expect(sut.invalidatingSource).toBe(source)
})
