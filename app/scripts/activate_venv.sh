#!/bin/sh

#  Set up
ENV_HASH=$1
ENV_PATH="/content/venvs/$ENV_HASH"
pip3 install virtualenv
mkdir -p /content/venvs

# Check if venv does not exist and create it if necessary
if [ ! -d $ENV_PATH ]; then
    virtualenv -p python3 "/content/venvs/$ENV_HASH"
fi

# Activate venv
source $ENV_PATH/bin/activate
