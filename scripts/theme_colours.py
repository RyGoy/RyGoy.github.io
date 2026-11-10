"""Give static/css/archive.css its light and dark themes (the sidebar's Sepia / Light / Dark switch).

Sepia is the site's own design. Every colour in the stylesheet is a variable: the named ones in the first `:root`
(--ink, --paper, ...) and one per remaining colour, named after its sepia value (--c-e1c797). This script
- turns any colour written directly in a rule into such a variable (so new rules can use plain colours, then run it),
- and rewrites the block between the theme markers: the sepia values, then `:root[data-theme="light"]` and
  `:root[data-theme="dark"]` with every colour worked out from its sepia value.
Light turns lightness over (dark stone becomes parchment, cream text becomes brown ink) and keeps each colour's hue;
dark shadows stay shadows, lighter, and dark accents (the red) stay as they are. Dark keeps the lightness of text and
takes the backgrounds near black, with the warmth taken out (charcoal and off-white, the brass kept muted). Values it
can't work out are set by hand after the generated block (the light theme's stone, the cream on the red button). Colours that are not the theme's stay as written: masks,
the black video frame, the white behind the Anthology's printed pages, the cream flash card, and print styles.
Usage: theme_colours.py [<archive.css>]   (standard library only; run it after changing colours)
"""
import math, re, sys

PATH = sys.argv[1] if len(sys.argv) > 1 else 'static/css/archive.css'
BEGIN, END = '/* theme colours: begin', '/* theme colours: end */'
HEX = re.compile(r'#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b')
NAMED = ('--ink', '--surface', '--paper', '--muted', '--brass', '--line', '--red')


def keep(selector, prop, media):
    """Colours that are not the theme's."""
    return ('print' in media or 'fc-card' in selector or 'mask' in prop
            or (selector.strip() == '.video-embed' and prop == 'background')
            or selector.strip() == '.anthology-copy img')


def convert(css):
    """Replace colours written in rules with their variables; returns (css, {name: sepia value})."""
    out, palette, i = [], {}, 0
    stack, media, head = [], [], ''  # selectors of the open blocks
    while i < len(css):
        if css.startswith('/*', i):
            j = css.index('*/', i) + 2
            out.append(css[i:j]); i = j; continue
        ch = css[i]
        if ch == '{':
            sel = head.strip()
            stack.append(sel)
            if sel.startswith('@media'):
                media.append(sel)
            head = ''
            out.append(ch); i += 1; continue
        if ch == '}':
            sel = stack.pop() if stack else ''
            if sel.startswith('@media'):
                media.pop()
            head = ''
            out.append(ch); i += 1; continue
        if ch == ';':
            head = ''
            out.append(ch); i += 1; continue
        m = HEX.match(css, i) if ch == '#' else None
        selector = next((s for s in reversed(stack) if not s.startswith('@')), '')
        if m and stack and selector != ':root' and not selector.startswith(':root['):
            prop = head.split(':', 1)[0].strip()
            if not keep(selector, prop, ' '.join(media)):
                value = norm(m.group(0))
                name = '--c-' + value[1:]
                palette[name] = value
                out.append(f'var({name})'); i = m.end(); continue
        head += ch
        out.append(ch); i += 1
    return ''.join(out), palette


def norm(h):
    h = h.lower()
    if len(h) in (4, 5):
        h = '#' + ''.join(c * 2 for c in h[1:])
    return h


# sRGB <-> OKLab (Björn Ottosson's matrices).
def to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def to_srgb(c):
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def oklch(h):
    r, g, b = (to_lin(int(h[k:k + 2], 16) / 255) for k in (1, 3, 5))
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(A, B), math.degrees(math.atan2(B, A)) % 360


def from_oklch(L, C, H):
    A, B = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
    m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
    s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return '#' + ''.join(f'{round(to_srgb(c) * 255):02x}' for c in (r, g, b))


def light(h):
    alpha = h[7:]
    L, C, H = oklch(h[:7])
    if L < 0.05 and not alpha:  # black (a shadow's ring) stays black
        return h
    if alpha and int(alpha, 16) < 205 and L < 0.25:  # a shadow or a dark veil: stays dark, fainter
        return h[:7] + f'{round(int(alpha, 16) * 0.45):02x}'
    if C > 0.06 and L < 0.52:  # a dark accent (the red) reads on parchment as it is
        return h
    L2 = max(0.0, min(0.985, 1.10 - 0.93 * L))
    if L2 > 0.8 and C < 0.03:  # stone and charcoal become warm parchment
        C, H = 0.028, 85
    return from_oklch(L2, C * (1.15 if L2 < 0.6 else 1), H) + alpha


def dark(h):
    alpha = h[7:]
    L, C, H = oklch(h[:7])
    if C > 0.06 and L < 0.72:  # accents: brass and red, muted
        return from_oklch(L * 0.95, C * 0.6, H) + alpha
    if L < 0.25:  # backgrounds: near black, neutral
        return from_oklch(L * 0.62, C * 0.1, H) + alpha
    if L < 0.45:  # lines and dim tones: neutral
        return from_oklch(L * 0.9, C * 0.2, H) + alpha
    if L > 0.72:  # text and highlights: as bright, near white
        return from_oklch(min(L * 1.02, 0.95), C * 0.15, H) + alpha
    return from_oklch(L * 0.95, C * 0.4, H) + alpha


def main():
    css = open(PATH, encoding='utf-8').read()
    old = {}
    if BEGIN in css:  # the earlier generated block: its sepia values, then drop it
        a, b = css.index(BEGIN), css.index(END) + len(END)
        first = css[a:b].split(':root[', 1)[0]
        old = dict(re.findall(r'(--c-[0-9a-f]+):\s*(#[0-9a-f]+)', first))
        css = css[:a].rstrip('\n') + '\n' + css[b:].lstrip('\n')
    css, palette = convert(css)
    palette = dict(sorted({**old, **palette}.items()))
    used = set(re.findall(r'var\((--c-[0-9a-f]+)\)', css))
    palette = {k: v for k, v in palette.items() if k in used}
    root = re.search(r':root\s*\{(.*?)\}', css, re.S)
    named = {k: norm(v) for k, v in re.findall(r'(--[a-z]+):\s*(#[0-9a-fA-F]+)\s*;', root.group(1)) if k in NAMED}
    lines = [f'{BEGIN} (scripts/theme_colours.py writes this block; edit the sepia values, then run it) */',
             ':root {'] + [f'  {k}: {v};' for k, v in palette.items()] + ['}']
    for theme, fn, scheme in (('light', light, 'light'), ('dark', dark, 'dark')):
        lines.append(f':root[data-theme="{theme}"] {{')
        lines.append(f'  color-scheme: {scheme};')
        lines += [f'  {k}: {fn(v)};' for k, v in {**named, **palette}.items()]
        lines.append('}')
    lines.append(END)
    at = root.end()
    css = css[:at] + '\n' + '\n'.join(lines) + css[at:]
    open(PATH, 'w', encoding='utf-8').write(css)
    print(f'{len(named)} named colours, {len(palette)} more')


if __name__ == '__main__':
    main()
