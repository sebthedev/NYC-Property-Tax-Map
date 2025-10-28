# This script loads data from the NYC Open Data portal into BigQuery tables.
# Tables have an expiration of 8 weeks in the future, to avoid clutter
# Run this script in Google Cloud Shell inside your BigQuery project

#!/usr/bin/env bash
set -euo pipefail

# =======================
# CONFIG
# =======================
PROJECT="sidewalk-chorus"
DATASET="propertytaxmap"          # tables land here

EXPIRE_SECONDS=4838400            # 8 weeks
YEAR_DEFAULT="$(date -d 'last year' +%Y)"   # Cloud Shell (GNU date)
YEAR="${YEAR:-$YEAR_DEFAULT}"
PVAD_YEAR="${PVAD_YEAR:-2026}"
PVAD_PERIOD="${PVAD_PERIOD:-3}"

PLUTO_TABLE="${PLUTO_TABLE:-PLUTO}"
ABATEMENTS_TABLE="${ABATEMENTS_TABLE:-ABATEMENTS}"
PVAD_TABLE="${PVAD_TABLE:-PVAD}"
AD_TABLE="${AD_TABLE:-ASSEMBLY_DISTRICTS}"

# =======================
# LOGGING (stderr)
# =======================
log() { printf "%s\n" "$*" >&2; }
ok()  { printf "✓ %s\n" "$*" >&2; }
err() { printf "✗ %s\n" "$*" >&2; }

# =======================
# CLEANUP
# =======================
TMP_FILES=()
cleanup() {
  for f in "${TMP_FILES[@]:-}"; do
    [[ -n "${f:-}" && -e "$f" ]] && rm -f "$f" || true
  done
}
trap cleanup EXIT

# =======================
# HELPERS
# =======================
ensure_dataset() {
  local fqds="$1"
  log "→ Ensuring dataset ${fqds} exists…"
  bq --project_id="${PROJECT}" mk -d -f "${fqds}" >/dev/null 2>&1 || true
  ok "Dataset ready: ${fqds}"
}

download_to_tmp() {
  local url="$1" label="$2"
  local tmp; tmp="$(mktemp "/tmp/${label}.XXXX.csv")"
  TMP_FILES+=("$tmp")

  log "→ Downloading ${label} from Socrata…"
  if ! curl -L --fail --retry 5 --retry-delay 2 --max-time 600 \
      -H 'DNT: 1' \
      -H 'Upgrade-Insecure-Requests: 1' \
      -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' \
      -H 'sec-ch-ua: "Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"' \
      -H 'sec-ch-ua-mobile: ?0' \
      -H 'sec-ch-ua-platform: "macOS"' \
      -o "${tmp}" "${url}"
  then
    err "Download failed: ${label}"
    exit 1
  fi
  # Log size to stderr; echo ONLY the path to stdout
  local bytes; bytes=$(wc -c <"${tmp}")
  ok "Downloaded ${label} to ${tmp} (${bytes} bytes)"
  echo "${tmp}"
}

load_csv_to_bq() {
  local table_fq="$1" csv_path="$2"

  log "→ Loading into ${table_fq} (autodetect schema, replace)…"
  bq load \
    --project_id="${PROJECT}" \
    --autodetect \
    --replace=true \
    --source_format=CSV \
    --skip_leading_rows=1 \
    "${table_fq}" \
    "${csv_path}"

  log "→ Setting expiration on ${table_fq} to ${EXPIRE_SECONDS}s (~8 weeks)…"
  bq update --project_id="${PROJECT}" --expiration "${EXPIRE_SECONDS}" "${table_fq}"

  # Verify row count
  local table_dot="${table_fq/:/.}"
  log "→ Verifying row count for ${table_fq}…"
  bq query --project_id="${PROJECT}" --use_legacy_sql=false --quiet \
    "SELECT COUNT(*) AS row_count FROM \`${table_dot}\`" | tail -n +3
  ok "Finished ${table_fq}"
}

# =======================
# RUN
# =======================
log "=== Starting NYC loads ==="
log "Project: ${PROJECT}"
log "Datasets: ${DATASET} (PLUTO, PVAD, ABATEMENTS, ASSEMBLY_DISTRICTS)"
log "Params: YEAR=${YEAR}, PVAD_YEAR=${PVAD_YEAR}, PVAD_PERIOD=${PVAD_PERIOD}"
log "Expiration: ${EXPIRE_SECONDS} seconds (~8 weeks)"

ensure_dataset "${PROJECT}:${DATASET}"

# 1) PLUTO (selected columns)
pluto_url="https://data.cityofnewyork.us/resource/64uk-42ks.csv?\$query=SELECT%20bbl%2C%20latitude%2C%20longitude%2C%20borough%2C%20council%2C%20cd%2C%20zipcode%2C%20address%2C%20ownername%2C%20yearbuilt%2C%20unitsres%2C%20assesstot%2C%20exempttot%2C%20condono%20LIMIT%2010000000"
pluto_tmp="$(download_to_tmp "${pluto_url}" "pluto")"
load_csv_to_bq "${PROJECT}:${DATASET}.${PLUTO_TABLE}" "${pluto_tmp}"

# 2) ABATEMENTS (by tax year)
abatements_url="https://data.cityofnewyork.us/resource/rgyu-ii48.csv?\$query=SELECT%20%2A%20WHERE%20taxyr%20%3D%20%22${YEAR}%22%20LIMIT%2010000000000"
abatements_tmp="$(download_to_tmp "${abatements_url}" "abatements_${YEAR}")"
load_csv_to_bq "${PROJECT}:${DATASET}.${ABATEMENTS_TABLE}" "${abatements_tmp}"

# 3) PVAD (by year + period)
pvad_url="https://data.cityofnewyork.us/resource/8y4t-faws.csv?\$query=SELECT%20parid%2C%20condo_number%2C%20curtaxclass%2C%20curmkttot%2C%20curtxbtot%2C%20curtxbextot%2C%20bldg_class%2C%20owner%20WHERE%20year%20%3D%20%22${PVAD_YEAR}%22%20AND%20period%20%3D%20%22${PVAD_PERIOD}%22%20LIMIT%2010000000"
pvad_tmp="$(download_to_tmp "${pvad_url}" "pvad_${PVAD_YEAR}_p${PVAD_PERIOD}")"
load_csv_to_bq "${PROJECT}:${DATASET}.${PVAD_TABLE}" "${pvad_tmp}"

# 4) State Assembly Districts
ad_url="https://data.cityofnewyork.us/resource/5yfv-9hkp.csv"
ad_tmp="$(download_to_tmp "${ad_url}" "ad")"
load_csv_to_bq "${PROJECT}:${DATASET}.${AD_TABLE}" "${ad_tmp}"

ok "All loads complete"
