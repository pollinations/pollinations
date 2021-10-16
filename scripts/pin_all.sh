# Ex: nohup xargs -a $1 -r -I{}  ipfs pin add {} &
# where $1 is a file name with content id's.
# Nohup is for background processing.
nohup xargs -a $1 -r -I{}  ipfs pin add {} &