# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('index.html', '.'),
        ('match.html', '.'),
        ('operator.html', '.'),
        ('styles.css', '.'),
        ('script.js', '.'),
        ('match.js', '.'),
        ('operator.js', '.'),
        # Only the two backgrounds actually used. Listed individually rather
        # than bundling all of Pictures/ so unused local art is never shipped.
        ('Pictures/MTG.png', 'Pictures'),
        ('Pictures/YuGiOh.png', 'Pictures'),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='MTG_Display',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['Icons/MTG_Cards.ico'],
)
