#!/bin/bash

 ssh -f -N -L 7862:localhost:7862 -i $HOME/credentials/dev-key.pem ubuntu@ec2-3-238-105-40.compute-1.amazonaws.com