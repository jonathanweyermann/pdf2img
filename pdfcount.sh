[[ "$#" != "1" ]] && {
   print "ERROR: No file specified"
   exit 1
}

numpages=0

strings $1 | grep "/Count" |
while read line
do
   num=${line/*([[:print:]])+(Count )?(-)+({1,4}(\d))*([[:print:]])/\4}
   (( num > numpages)) && numpages=$num
done

print $numpages

exit 0
