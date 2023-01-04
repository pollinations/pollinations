#!/bin/bash

 ssh -f -N -L 7860:localhost:7860 -i $HOME/credentials/dev-key.pem ubuntu@ec2-3-238-105-40.compute-1.amazonaws.com