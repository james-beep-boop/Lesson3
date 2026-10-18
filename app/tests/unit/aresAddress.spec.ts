import { describe, expect, it } from 'vitest'
import { normalizeAresAddress as normalize } from '../../src/components/LinkedTextarea/aresAddress'

describe('ARES stored addresses', () => {
  it.each([
    ['https://ares.local/modules/a.pdf?q=1#p', 'http://ares.local/modules/a.pdf?q=1#p'],
    [
      'https://demo.aresedu.dev/kolibri/en/learn/#/topics/c/abc',
      'http://ares.local:8069/en/learn/#/topics/c/abc',
    ],
    [
      'http://ares.local:8069/en/learn/#/topics/c/abc',
      'http://ares.local:8069/en/learn/#/topics/c/abc',
    ],
    ['https://demo.aresedu.dev/modules/a.pdf', 'http://ares.local/modules/a.pdf'],
    ['https://demo.aresedu.dev/kolibriish/a', 'http://ares.local/kolibriish/a'],
    ['https://example.org/a?q=%2f#frag', 'https://example.org/a?q=%2f#frag'],
    ['http://ares.edu:8082/file', 'http://ares.edu:8082/file'],
    ['not a URL', 'not a URL'],
  ])('normalizes %s to %s', (input, expected) => expect(normalize(input)).toBe(expected))

  it('uses configured site/Kolibri hosts and exact aliases, preserving query and fragment', () => {
    const settings = {
      siteUrl: 'https://school.test',
      kolibriUrl: 'https://learn.test/content',
      aliases: ['192.168.1.2', 'SCHOOLBOX'],
    }
    expect(normalize('http://192.168.1.2/modules/a.pdf', settings)).toBe(
      'http://ares.local/modules/a.pdf',
    )
    expect(normalize('https://learn.test/content/en/#x', settings)).toBe(
      'http://ares.local:8069/en/#x',
    )
    expect(normalize('https://school.test/www2/search.php?q=a%20b#x', settings)).toBe(
      'http://ares.local/www2/search.php?q=a%20b#x',
    )
    expect(normalize('http://schoolbox/modules/a', settings)).toBe('http://ares.local/modules/a')
    expect(normalize('https://school.test.evil/a', settings)).toBe('https://school.test.evil/a')
    expect(normalize('https://learn.test/en/#x', { kolibriUrl: 'https://learn.test/' })).toBe(
      'http://ares.local:8069/en/#x',
    )
    expect(
      normalize(
        'https://learn.test/tracker/local_launch.html?target=%2Fcontent%2Fen%2F%23x',
        settings,
      ),
    ).toBe('http://ares.local:8069/en/#x')
  })

  it('unwraps both trusted tracker forms with exactly one query decoding step', () => {
    expect(
      normalize(
        'https://demo.aresedu.dev/tracker/local_launch.html?target=%2Fkolibri%2Fen%2Flearn%2F%23%2Ftopics%2Fc%2Fa',
      ),
    ).toBe('http://ares.local:8069/en/learn/#/topics/c/a')
    expect(
      normalize('http://ares.local/tracker/local_launch.html?target=%2Fmodules%2Fa%2520b.pdf'),
    ).toBe('http://ares.local/modules/a%20b.pdf')
    expect(
      normalize(
        'https://demo.aresedu.dev/tracker/external_launch.html?target=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc',
      ),
    ).toBe('https://www.youtube.com/watch?v=abc')
    expect(
      normalize(
        'https://demo.aresedu.dev/tracker/external_launch.html?target=https%3A%2F%2Fdemo.aresedu.dev%2Fmodules%2Fa.pdf',
      ),
    ).toBe('http://ares.local/modules/a.pdf')
  })

  it.each(['', '?target=bad', '?target=%2F%2Fevil.test%2Fa', '?target=%5Cevil', '?target=%0A'])(
    'leaves malformed local wrappers untouched: %s',
    (query) => {
      const input = `http://ares.local/tracker/local_launch.html${query}`
      expect(normalize(input)).toBe(input)
    },
  )
  it('does not unwrap arbitrary websites or unsafe external targets', () => {
    for (const input of [
      'https://evil.test/tracker/local_launch.html?target=%2Fmodules%2Fa',
      'http://ares.local/tracker/external_launch.html?target=javascript%3Aalert(1)',
    ])
      expect(normalize(input)).toBe(input)
  })
})
