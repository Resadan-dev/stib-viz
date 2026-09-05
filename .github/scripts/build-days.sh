#!/usr/bin/env bash
# Builds every day listed on stdin, one per line, each independently; a failing day is set aside
# and reported, the others are still written. Then writes index.json over the valid days.
#
# usage: stibviz plan ... | .github/scripts/build-days.sh <gtfs> <out-dir> <report-file>
# exit code: 0 when every day built, 1 when at least one failed (after building the others).
set -u

gtfs="$1"
out="$2"
report="$3"

built=()
failed=()
: > "$report"
while IFS= read -r day; do
  [ -z "$day" ] && continue
  if uv run stibviz build --gtfs "$gtfs" --date "$day" --out "$out"; then
    built+=("$day")
    echo "$day: built" >> "$report"
  else
    failed+=("$day")
    echo "$day: FAILED" >> "$report"
  fi
done

uv run stibviz index --data "$out" --gtfs "$gtfs"

echo "built: ${#built[@]} day(s), failed: ${#failed[@]} day(s)" | tee -a "$report"
if [ "${#failed[@]}" -gt 0 ]; then
  printf 'failed day: %s\n' "${failed[@]}" >&2
  exit 1
fi
