#!/usr/bin/env bash
# Chạy test phân quyền RLS trên Postgres CỤC BỘ (tạo database tạm, nạp schema
# chụp từ Supabase + các migration mới, rồi chạy supabase/tests/*_test.sql).
#
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=... bash supabase/tests/run.sh
#
# KHÔNG trỏ vào database Supabase thật: script tạo/xóa database và dữ liệu mẫu.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ "${PGHOST:-}" == *supabase* ]]; then
  echo "Từ chối chạy: PGHOST trỏ tới Supabase. Chỉ chạy trên Postgres cục bộ." >&2
  exit 2
fi

DB="${RRT_TEST_DB:-rrt_rls_test}"
psql -d postgres -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"

psql -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase_stubs.sql
# Ảnh chụp schema cần PostGIS/pg_net (bảng laboratories...) — Postgres thường
# không có nên một số lệnh lỗi là bình thường; các bảng RRT vẫn được tạo.
psql -d "$DB" -q -f supabase/migrations/20260928000000_remote_schema.sql >/dev/null 2>&1 || true
psql -d "$DB" -tAc "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='incidents'" | grep -q 1 \
  || { echo "Không nạp được schema (thiếu bảng incidents)" >&2; exit 1; }

for f in supabase/migrations/2*.sql; do
  [[ "$f" == *20260928000000_remote_schema.sql ]] && continue
  echo "Áp dụng $f"
  if ! out="$(psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1)"; then
    echo "$out" | grep -v NOTICE >&2
    exit 1
  fi
done

status=0
for t in supabase/tests/*_test.sql; do
  echo "== $t"
  out="$(psql -d "$DB" -q -f "$t" 2>&1 || true)"
  echo "$out" | grep -oE '(PASS|FAIL): .*|ERROR: .*|^--- .*' || true
  pass=$(echo "$out" | grep -c 'PASS: ' || true)
  fail=$(echo "$out" | grep -cE 'FAIL: |ERROR: ' || true)
  echo "→ $pass PASS, $fail FAIL"
  if [[ $fail -gt 0 || $pass -eq 0 ]]; then status=1; fi
done

psql -d postgres -qc "DROP DATABASE IF EXISTS $DB"
exit $status
