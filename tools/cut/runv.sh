cd /home/claude/cards
for c in AR CA CO CD ET KE PL RU ZA ES TZ GB KBEAR KDRAGON KWOLF KLION; do for n in beast warrior warrior2 pole flag title; do
  [ -f $c/m_$n.png ] || python3 sam.py $c $n 2>&1 | grep " ok" ; done; done
echo ALLDONE
