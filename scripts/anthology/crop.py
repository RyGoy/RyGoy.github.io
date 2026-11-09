"""Crop one post or comment out of rendered Anthology pages and stack its page strips into one image.

segments: [[page, y0, y1], ...] in PDF points. Pages are rendered by pdftoppm at DPI to <pages>/p-NNNN.png.
"""
from PIL import Image

DPI = 110
X0, X1 = 274, 650  # the feed column, in points
SCALE = DPI / 72


def page_path(pages_dir, page, digits=4):
    return f'{pages_dir}/p-{page:0{digits}d}.png'


def crop(pages_dir, segments, cache={}):
    strips = []
    for page, y0, y1 in segments:
        if page not in cache:
            if len(cache) > 6:
                cache.clear()
            cache[page] = Image.open(page_path(pages_dir, page)).convert('RGB')
        img = cache[page]
        box = (round(X0 * SCALE), round(y0 * SCALE), round(X1 * SCALE), round(y1 * SCALE))
        if box[3] - box[1] > 2:
            strips.append(img.crop(box))
    width = max(s.width for s in strips)
    out = Image.new('RGB', (width, sum(s.height for s in strips)), 'white')
    y = 0
    for s in strips:
        out.paste(s, (0, y))
        y += s.height
    return out
