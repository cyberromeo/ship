set -e
cd /workspace/work/pirate
npx esbuild src/main.js --bundle --minify --format=iife --target=es2020 --outfile=dist/bundle.js --log-level=warning
python3 - <<'PY'
js=open('dist/bundle.js').read().replace('</script','<\\/script')
html='''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title></title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#07060a}canvas{display:block;width:100%;height:100%;cursor:grab}canvas:active{cursor:grabbing}#fade{position:fixed;inset:0;background:#07060a;transition:opacity 2.2s ease;pointer-events:none;z-index:2}</style>
</head><body><div id="fade"></div><script>'''+js+'''</script></body></html>'''
open('dist/pirate-ship.html','w').write(html)
PY
ls -la dist
