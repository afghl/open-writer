const ENGLISH_TOKEN_RE = /[a-z0-9_]+/g
const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u

function splitCJKBigrams(input: string) {
  const chars = Array.from(input)
  if (chars.length === 1) return chars
  const result: string[] = []
  for (let i = 0; i < chars.length - 1; i += 1) {
    result.push(chars[i] + chars[i + 1])
  }
  return result
}

export function tokenize(input: string) {
  const normalized = input.toLowerCase().normalize("NFKC")
  const english = normalized.match(ENGLISH_TOKEN_RE) ?? []

  const cjkOnly = Array.from(normalized)
    .filter((char) => CJK_RE.test(char))
    .join("")
  const cjkBigrams = cjkOnly.length > 0 ? splitCJKBigrams(cjkOnly) : []

  return [...english, ...cjkBigrams]
}
