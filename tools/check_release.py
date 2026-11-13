"""Release gate for Folio. Runs in GitHub Actions before every Pages deploy (see
.github/workflows/pages.yml); a failure here keeps the previous build live.
Run locally from the repo root:  python3 tools/check_release.py

Checks only what a machine can prove:
  - BUILD in index.html and CACHE in sw.js name the same vN
  - every file sw.js pre-caches, and every icon/manifest the page links, exists
  - manifest icons: real pixel size = declared size; one file never serves two
    purposes; an "any" and a "maskable" icon at both 192 and 512
  - maskable icons are fully opaque edge to edge, with the artwork inside the
    safe circle (radius 40% of the side), so Android shows a full circle
  - no function is declared twice in index.html (the later one silently wins)
"""
import json, math, os, re, sys
from collections import Counter
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = []

def fail(msg):
    fails.append(msg)

def read(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return f.read()

def exists(name):
    return os.path.isfile(os.path.join(ROOT, name))

html, sw = read("index.html"), read("sw.js")

# 1. the two version strings move together
build = re.search(r'const BUILD="(v\d+)"', html)
cache = re.search(r'const CACHE = "folio-(v\d+)"', sw)
if not build or not cache:
    fail("BUILD (index.html) or CACHE (sw.js) not found")
elif build.group(1) != cache.group(1):
    fail(f"BUILD {build.group(1)} != CACHE {cache.group(1)} - bump both to the same vN")

# 2. every pre-cached shell file and every linked head asset exists
shell = re.search(r"const SHELL = \[(.*?)\];", sw, re.S)
for p in re.findall(r'"\./([^"]*)"', shell.group(1) if shell else ""):
    if p and not exists(p):
        fail(f"sw.js pre-caches {p}, which does not exist")
for rel, href in re.findall(r'<link rel="(manifest|icon|apple-touch-icon)" href="([^"]+)"', html):
    if not exists(href):
        fail(f'index.html links {rel} "{href}", which does not exist')

def opaque(im):
    if "transparency" in im.info:      # an RGB/L PNG can still mark one colour transparent
        return False
    return im.mode in ("RGB", "L") or im.convert("RGBA").getextrema()[3][0] == 255

# 3. manifest icons
man = json.loads(read("manifest.webmanifest"))
icons = man.get("icons", [])
uses = Counter(i["src"] for i in icons)
for src, n in uses.items():
    if n > 1:
        fail(f"{src} is listed {n} times - give each purpose its own file, or Chrome may "
             "build the installed app from the plain icon (small icon on a white circle)")
have = set()
for i in icons:
    src, purpose = i["src"], i.get("purpose", "any")
    if " " in purpose.strip():
        fail(f'{src}: purpose "{purpose}" - use one purpose per file')
    if not exists(src):
        fail(f"manifest icon {src} does not exist")
        continue
    im = Image.open(os.path.join(ROOT, src))
    w, h = im.size
    if f"{w}x{h}" != i.get("sizes"):
        fail(f'{src} is {w}x{h} but the manifest says {i.get("sizes")}')
    have.add((purpose, w))
    if purpose == "maskable":
        if w != h:
            fail(f"{src} must be square")
        if not opaque(im):
            fail(f"{src} has transparent pixels - a maskable icon must fill its square edge to edge")
        rgb = im.convert("RGB")
        px, bg = rgb.load(), rgb.getpixel((0, 0))
        safe = 0.40 * w
        far = max((math.hypot(x + .5 - w / 2, y + .5 - h / 2)
                   for x in range(w) for y in range(h)
                   if sum(abs(a - b) for a, b in zip(px[x, y], bg)) > 40), default=0)
        if far > safe:
            fail(f"{src}: artwork reaches {far / (w / 2):.0%} of the half-width; keep it inside 80% "
                 "or the launcher's circle crops it")
for purpose in ("any", "maskable"):
    for size in (192, 512):
        if (purpose, size) not in have:
            fail(f"manifest needs a {size}x{size} '{purpose}' icon")

if exists("apple-touch-icon.png"):
    im = Image.open(os.path.join(ROOT, "apple-touch-icon.png"))
    if im.size != (180, 180) or not opaque(im):
        fail("apple-touch-icon.png must be 180x180 and fully opaque (iOS fills transparency with black)")

# 4. duplicate function declarations shadow silently
dups = [n for n, c in Counter(re.findall(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(", html)).items() if c > 1]
if dups:
    fail("functions declared more than once in index.html: " + ", ".join(sorted(dups)))

if fails:
    print("RELEASE BLOCKED:")
    for f in fails:
        print("  - " + f)
    sys.exit(1)
print(f"Release checks passed ({build.group(1)}).")
