echo "APT::Get::force-yes \"true\";"  >> /etc/apt/apt.conf.d/90forceyes

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
nvm install 16
nvm use 16

sudo mkdir /content
sudo chmod ugoa+rwx /content
sudo chmod ugoa+rwx -R /usr/local/bin/

git clone git@github.com:pollinations/pollinations.git 


# conda create -n poll2 python=3.7
# conda activate poll2
# conda install -c conda-forge --name poll2 ipykernel -y
# pip install papermill

# 

# papermill /home/ubuntu/pollinations/colabs/niels.ipynb