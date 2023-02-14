#!/bin/bash

ssh -f -N -L 7860:localhost:7860 -i $HOME/credentials/dev-key.pem ubuntu@ec2-44-193-30-178.compute-1.amazonaws.com
