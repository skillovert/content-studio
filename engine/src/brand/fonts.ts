import {continueRender, delayRender, staticFile} from 'remotion';

// Latin-extended Inter (Turkish, Polish ...) only for the characters basic Inter lacks.
const EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+1EF2-1EFF, U+20A0-20C0, U+2C60-2C7F, U+A720-A7FF';

const faces: [string, string, string, string?][] = [
  ['Geist', 'fonts/Geist-Variable.woff2', '100 900'],
  ['Geist Mono', 'fonts/GeistMono-Variable.woff2', '100 900'],
  ['Inter', 'fonts/inter-latin-400-normal.woff2', '400'],
  ['Inter', 'fonts/inter-latin-500-normal.woff2', '500'],
  ['Inter', 'fonts/inter-latin-600-normal.woff2', '600'],
  ['Inter', 'fonts/inter-latin-700-normal.woff2', '700'],
  ['Inter', 'fonts/inter-latin-ext-400-normal.woff2', '400', EXT],
  ['Inter', 'fonts/inter-latin-ext-600-normal.woff2', '600', EXT],
  ['Inter', 'fonts/inter-latin-ext-700-normal.woff2', '700', EXT],
  ['Noto Sans Arabic', 'fonts/noto-sans-arabic-arabic-400-normal.woff2', '400'],
  ['Noto Sans Arabic', 'fonts/noto-sans-arabic-arabic-700-normal.woff2', '700'],
  ['Noto Sans Bengali', 'fonts/noto-sans-bengali-bengali-400-normal.woff2', '400'],
  ['Noto Sans Bengali', 'fonts/noto-sans-bengali-bengali-700-normal.woff2', '700'],
  ['Noto Sans Devanagari', 'fonts/noto-sans-devanagari-devanagari-400-normal.woff2', '400'],
  ['Noto Sans Devanagari', 'fonts/noto-sans-devanagari-devanagari-600-normal.woff2', '600'],
  ['Noto Sans Devanagari', 'fonts/noto-sans-devanagari-devanagari-700-normal.woff2', '700'],
  ['Noto Nastaliq Urdu', 'fonts/noto-nastaliq-urdu-arabic-400-normal.woff2', '400'],
  ['Noto Nastaliq Urdu', 'fonts/noto-nastaliq-urdu-arabic-600-normal.woff2', '600'],
  ['Noto Nastaliq Urdu', 'fonts/noto-nastaliq-urdu-arabic-700-normal.woff2', '700'],
];

if (typeof document !== 'undefined') {
  const handle = delayRender('Loading brand fonts');
  Promise.all(
    faces.map(([family, file, weight, unicodeRange]) =>
      new FontFace(family, `url(${staticFile(file)}) format('woff2')`, unicodeRange ? {weight, unicodeRange} : {weight})
        .load()
        .then((f) => document.fonts.add(f)),
    ),
  )
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error(err);
      continueRender(handle);
    });
}
