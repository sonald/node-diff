#!/usr/bin/env zsh
if [[ $1 = *diff* ]]; then
    diff -u <(echo $2 |awk 'BEGIN{FS=""; OFS="\n"}; {$1=$1;print $0}') <(echo $3|awk 'BEGIN{FS=""; OFS="\n"}; {$1=$1;print $0}')
else
    node index.js <(echo $2 |awk 'BEGIN{FS=""; OFS="\n"}; {$1=$1;print $0}') <(echo $3|awk 'BEGIN{FS=""; OFS="\n"}; {$1=$1;print $0}')
fi

