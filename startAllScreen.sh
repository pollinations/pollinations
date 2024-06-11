# Kill existing named screen session if it exists
#screen -S my_session -X quit

# Start a new named screen session
screen -S my_session -d -m

# Create a new window for each script and start them automatically

# screen 1
screen -S my_session -X screen -t tab1
screen -S my_session -p tab1 -X stuff 'cd image_gen_dmd2 && conda activate streamdiffusion && python -m demo.text_to_image_sdxl\n'

# screen 2
screen -S my_session -X screen -t tab2
screen -S my_session -p tab2 -X stuff 'cd image_gen_server && bash ../image_gen_server/infinite_loop.sh "node index_latent_consistency.js "\n'

# screen 3
screen -S my_session -X screen -t tab3
screen -S my_session -p tab3 -X stuff 'libretranslate\n'

# screen 4
screen -S my_session -X screen -t tab4
screen -S my_session -p tab4 -X stuff 'cd pollinations.ai-bot && source .venv/bin/activate && bash ../image_gen_server/infinite_loop.sh "python3 -m main"\n'
