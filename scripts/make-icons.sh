#!/bin/sh
# Builds every toolbar icon from assets/hrcek6.png.
#
# Three states: colour (configured, page not held), greyscale (not
# configured), and colour with a green tick (page already held). Each is
# rendered once at 512px and then scaled down, so the tick is drawn at a
# size where its geometry is legible and shrinks cleanly — drawing it at
# 16px directly gives a green smudge.
#
# Needs ImageMagick 7 (`magick`). The output is committed; this runs by
# hand when the artwork changes, not during a build.
set -eu

SRC="assets/hrcek6.png"
OUT="src/public/icon"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$OUT"

# Square, trimmed and centred, with a little breathing room so the ears
# are not flush against the edge of the toolbar button.
magick "$SRC" -trim +repage \
  -resize 460x460 -background none -gravity center -extent 512x512 \
  "$WORK/colour.png"

# Saturation to zero rather than -colorspace Gray: it leaves the alpha
# channel alone, and a flattened alpha would give the icon a black box.
magick "$WORK/colour.png" -modulate 100,0,100 "$WORK/grey.png"

# The tick: a green disc with a white outline so it reads against both
# the hamster and a dark toolbar, and a white check drawn over it.
magick "$WORK/colour.png" \
  -fill '#1f9d55' -stroke white -strokewidth 22 \
  -draw "circle 366,366 366,216" \
  -fill none -stroke white -strokewidth 40 \
  -draw "stroke-linecap round stroke-linejoin round polyline 300,368 348,416 434,318" \
  "$WORK/saved.png"

for size in 16 32 48 96 128; do
  magick "$WORK/colour.png" -resize "${size}x${size}" "$OUT/$size.png"
  magick "$WORK/grey.png"   -resize "${size}x${size}" "$OUT/grey-$size.png"
  magick "$WORK/saved.png"  -resize "${size}x${size}" "$OUT/saved-$size.png"
done

echo "Wrote 15 icons to $OUT"
