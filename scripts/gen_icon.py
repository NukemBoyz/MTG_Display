"""One-off icon generator: draws a mana-pip badge and packs it into a
multi-resolution .ico. Pure stdlib (struct + zlib + math) - no Pillow,
so it runs with the same embeddable Python the app ships with."""
import math
import struct
import sys
import zlib

MANA_COLORS = [
    # (fill, outline)
    ((249, 246, 217), (168, 154, 101)),   # White
    ((14, 104, 171), (8, 58, 97)),        # Blue
    ((30, 26, 24), (150, 140, 130)),      # Black (outline for contrast)
    ((211, 32, 42), (120, 15, 20)),       # Red
    ((0, 115, 62), (5, 60, 32)),          # Green
]

GOLD = (216, 165, 77)
DARK_FILL = (23, 18, 12)


def smoothstep(edge0, edge1, x):
    if edge0 == edge1:
        return 1.0 if x >= edge0 else 0.0
    t = (x - edge0) / (edge1 - edge0)
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return t * t * (3 - 2 * t)


def blend(under, over, alpha):
    return tuple(round(u * (1 - alpha) + o * alpha) for u, o in zip(under, over))


def render(size):
    cx = cy = size / 2.0
    outer_r = size * 0.49
    ring_inner_r = size * 0.435
    pip_orbit_r = size * 0.305
    pip_r = size * 0.155
    pip_outline_r = pip_r * 1.16
    aa = max(0.75, size * 0.01)

    pip_centers = []
    for i in range(5):
        ang = -math.pi / 2 + i * (2 * math.pi / 5)
        pip_centers.append((cx + pip_orbit_r * math.cos(ang), cy + pip_orbit_r * math.sin(ang)))

    buf = bytearray(size * size * 4)
    for y in range(size):
        dy = y + 0.5 - cy
        for x in range(size):
            dx = x + 0.5 - cx
            dist = math.hypot(dx, dy)

            outer_cov = smoothstep(outer_r + aa, outer_r - aa, dist)
            if outer_cov <= 0.0:
                continue

            if dist <= ring_inner_r:
                rgb = DARK_FILL
            else:
                ring_cov = smoothstep(ring_inner_r - aa, ring_inner_r + aa, dist)
                rgb = blend(DARK_FILL, GOLD, ring_cov)

            for (pcx, pcy), (fill, outline) in zip(pip_centers, MANA_COLORS):
                pd = math.hypot(x + 0.5 - pcx, y + 0.5 - pcy)
                if pd > pip_outline_r + aa:
                    continue
                outline_cov = smoothstep(pip_outline_r + aa, pip_outline_r - aa, pd)
                if outline_cov > 0:
                    rgb = blend(rgb, outline, outline_cov)
                fill_cov = smoothstep(pip_r + aa, pip_r - aa, pd)
                if fill_cov > 0:
                    rgb = blend(rgb, fill, fill_cov)

            idx = (y * size + x) * 4
            a = round(outer_cov * 255)
            buf[idx:idx + 4] = bytes((rgb[0], rgb[1], rgb[2], a))
    return bytes(buf)


def png_bytes(size, rgba):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    stride = size * 4
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw.extend(rgba[y * stride:(y + 1) * stride])
    idat = zlib.compress(bytes(raw), 9)
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')


def write_ico(path, sizes):
    images = [(s, png_bytes(s, render(s))) for s in sizes]
    n = len(images)
    header = struct.pack('<HHH', 0, 1, n)
    entries = b''
    offset = 6 + 16 * n
    data = b''
    for s, png in images:
        w = s if s < 256 else 0
        h = s if s < 256 else 0
        entries += struct.pack('<BBBBHHII', w, h, 0, 0, 1, 32, len(png), offset)
        data += png
        offset += len(png)
    with open(path, 'wb') as f:
        f.write(header + entries + data)


def write_png(path, size):
    with open(path, 'wb') as f:
        f.write(png_bytes(size, render(size)))


if __name__ == '__main__':
    out_ico = sys.argv[1] if len(sys.argv) > 1 else 'mtg_icon.ico'
    write_ico(out_ico, [16, 24, 32, 48, 64, 128, 256])
    print('wrote', out_ico)
    if len(sys.argv) > 2:
        write_png(sys.argv[2], 512)
        print('wrote', sys.argv[2])
