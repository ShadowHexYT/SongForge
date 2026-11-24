/**
 * Korean → Latin letters using Revised Romanization, with the sound changes that matter most
 * in lyrics: carrying a final consonant over to a following vowel (서로를 → seororeul),
 * nasalization (합니다 → hamnida, 있는 → inneun) and ㄹ assimilation (신라 → silla).
 * Everything that isn't Hangul is left as it is.
 */
const INITIAL = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']
const VOWEL = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i']
/** How each final consonant sounds before another consonant or at the end */
const FINAL = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't']
/** Final consonant before a silent ㅇ: [what stays, what moves to the next syllable] */
const CARRY: Array<[string, string]> = [
  ['', ''], ['', 'g'], ['', 'kk'], ['k', 's'], ['', 'n'], ['n', 'j'], ['', 'n'], ['', 'd'], ['', 'r'], ['l', 'g'], ['l', 'm'],
  ['l', 'b'], ['l', 's'], ['l', 't'], ['l', 'p'], ['', 'r'], ['', 'm'], ['', 'b'], ['p', 's'], ['', 's'], ['', 'ss'],
  ['ng', ''], ['', 'j'], ['', 'ch'], ['', 'k'], ['', 't'], ['', 'p'], ['', '']
]
const NASAL: Record<string, string> = { k: 'ng', t: 'n', p: 'm' }

const isHangul = (c: number) => c >= 0xac00 && c <= 0xd7a3

export const hasHangul = (s: string) => /[가-힣]/.test(s)

export function romanizeKorean(text: string): string {
  const chars = [...text]
  const syl = chars.map((ch) => {
    const c = ch.codePointAt(0)!
    if (!isHangul(c)) return null
    const i = c - 0xac00
    return { l: Math.floor(i / 588), v: Math.floor((i % 588) / 28), t: i % 28 }
  })
  const ini = syl.map((s) => (s ? INITIAL[s.l] : ''))
  const fin = syl.map((s) => (s ? FINAL[s.t] : ''))

  for (let i = 0; i < syl.length - 1; i++) {
    const a = syl[i]
    const b = syl[i + 1]
    if (!a || !b || !a.t) continue
    const f = FINAL[a.t]
    if (b.l === 11) {
      // Silent ㅇ: the final consonant is pronounced at the start of the next syllable
      ;[fin[i], ini[i + 1]] = CARRY[a.t]
    } else if (a.t === 27 && (b.l === 0 || b.l === 3 || b.l === 12)) {
      // ㅎ + ㄱ/ㄷ/ㅈ: 좋고 → joko
      fin[i] = ''
      ini[i + 1] = b.l === 0 ? 'k' : b.l === 3 ? 't' : 'ch'
    } else if (b.l === 2 || b.l === 6) {
      // Before ㄴ/ㅁ: 합니다 → hamnida
      if (NASAL[f]) fin[i] = NASAL[f]
      if (f === 'l' && b.l === 2) ini[i + 1] = 'l'
    } else if (b.l === 5) {
      // Before ㄹ: 신라 → silla, 종로 → jongno
      if (f === 'l' || f === 'n') {
        fin[i] = 'l'
        ini[i + 1] = 'l'
      } else {
        ini[i + 1] = 'n'
        if (NASAL[f]) fin[i] = NASAL[f]
      }
    }
  }

  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const s = syl[i]
    out += s ? ini[i] + VOWEL[s.v] + fin[i] : chars[i]
  }
  return out
}
