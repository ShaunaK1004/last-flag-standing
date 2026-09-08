#!/bin/bash
# Sweep the two unmeasured constants against three INDEPENDENTLY measured targets:
#   crowded open median 0.97 s | sparse open mean 4.32 s | mean inward drift -50.6 px/s
# plus the derived rate 10.4 openings/min. Two free parameters, four targets.
echo "SPEED SUCT | crowded sparse  all  | drift  | open/min elim/min round"
for S in 140 160 180 200 220 250; do
for A in 70 100 130; do
  R=$(CBR_QUIET=1 timeout 160 node verify_sim.js 2 4242 BALL_SPEED=$S SUCTION=$A 2>/dev/null | tail -1)
  python3 - "$S" "$A" "$R" <<'PY'
import sys, json
s,a,r = sys.argv[1], sys.argv[2], sys.argv[3]
try: d=json.loads(r)
except Exception: print(f"{s:>5} {a:>4} | (no output)"); raise SystemExit
print(f"{s:>5} {a:>4} | {d['crowded']:7.2f} {d['sparse']:6.2f} {d['all']:5.2f} | "
      f"{d['drift']:6.1f} | {d['openRate']:8.2f} {d['elimRate']:8.2f} {d['round']:6.0f}"
      f"  fails={d['fails']}")
PY
done; done
