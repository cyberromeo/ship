set -e
cd /workspace/work/pirate
npx esbuild src/main.js --bundle --minify --format=iife --target=es2020 --outfile=dist/bundle.js --log-level=warning
python3 - <<'PY'
js=open('dist/bundle.js').read().replace('</script','<\\/script')
html='''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title></title>
<meta name="description" content="An interactive, real-time 3D pirate ship sailing a living ocean at sunset. Drag to orbit, scroll to zoom.">
<meta name="theme-color" content="#2a1530">
<meta name="color-scheme" content="dark">
<meta name="author" content="Srihari Prabakaran">
<meta name="robots" content="index,follow">
<meta property="og:type" content="website">
<meta property="og:title" content="Pirate Ship at Sunset">
<meta property="og:description" content="An interactive, real-time 3D pirate ship sailing a living ocean at sunset.">
<meta property="og:image" content="__OG_IMAGE__">
<meta property="og:image:width" content="1280"><meta property="og:image:height" content="720">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Pirate Ship at Sunset">
<meta name="twitter:description" content="An interactive, real-time 3D pirate ship sailing a living ocean at sunset.">
<meta name="twitter:image" content="__OG_IMAGE__">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='38' r='22' fill='%23f29a4a'/%3E%3Cpath d='M10 44h44l-6 10H16z' fill='%23231018'/%3E%3Cpath d='M31 10v32M31 12l14 22H31zM29 16l-12 20h12z' stroke='%23231018' stroke-width='2' fill='%23f6e7cf'/%3E%3C/svg%3E">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#07060a}canvas{display:block;width:100%;height:100%;cursor:grab}canvas:active{cursor:grabbing}#fade{position:fixed;inset:0;background:#07060a;transition:opacity 2.2s ease;pointer-events:none;z-index:2}</style>
</head><body><div id="fade"></div><script>'''+js+'''</script></body></html>'''
import os
html=html.replace('__OG_IMAGE__', os.environ.get('OG_IMAGE','preview.jpg'))
open('dist/pirate-ship.html','w').write(html)
PY
ls -la dist
