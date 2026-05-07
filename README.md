# Diablo IV Korean Translator

Chrome extension for translating Diablo IV build/info sites into Korean while
preserving Korean in-game terminology.

## Supported sites

- `https://maxroll.gg/*`
- `https://helltides.com/*`

## How to install locally

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select this project folder:
   `D:\work\KYN\99.테스트Source\Diablo4KoreanExtension`
6. Open a supported site and use the extension popup to enable translation.

## Translation behavior

The extension always applies the local Diablo IV glossary first:

- `data/diablo4-ko-glossary.json`
- `data/diablo4-ko-phrase-rules.json`

If Chrome exposes the built-in Translator API, the extension also translates
ordinary English sentences to Korean. Diablo IV terms are protected with
temporary placeholders before machine translation and restored afterward, so
the translator is less likely to distort in-game Korean terminology. If the API
is unavailable, it falls back to glossary-only translation.

## Development notes

- The content script stores original text nodes so disabling the extension can
  restore the page text.
- Dynamic content and tooltips are handled with a `MutationObserver`.
- Longest glossary terms are replaced first to prevent partial replacements
  such as `Damage` being replaced before `Critical Strike Damage`.
- Phrase rules clean up common build-guide wording after machine translation.
- The glossary should be updated each Diablo IV season because items, affixes,
  and activities can change.
